import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { computeDemand, DAY_MS } from "@/lib/domain/demand";
import { toBrowseItemId } from "@/lib/domain/ebay-ids";
import { jaccardSimilarity, tokenSet } from "@/lib/domain/matching";
import type { TerapeakRow } from "@/lib/domain/terapeak-import";
import { logError, logInfo } from "@/lib/logger";
import {
  EbayAccessError,
  GET_ITEMS_BATCH,
  isEbayBatchAvailable,
  type EbayBrowseApiProvider,
  type EbayItemDetails,
  type EbaySearchResult,
} from "@/lib/providers/ebay-browse";
import type { AliExpressProvider } from "@/lib/providers/types";
import { ConfigError, createAliExpressProvider, createEbayProvider, loadHuntSettings, type HuntSettingsValues } from "./providers";
import { mapWithConcurrency, sourceListing } from "./sourcing";
import { keepImportedDemand, recordSnapshot } from "./tracking";

/** Listings sourced per step (each needs several AliExpress calls). */
const SOURCE_PER_STEP = 6;
/** Terapeak rows resolved against eBay per step. */
const TERAPEAK_ROWS_PER_STEP = 20;
/** eBay results scanned per keyword. */
const RESULTS_PER_KEYWORD = 200;
/**
 * Listings per keyword whose sold count is read (in eBay best-match order). With batch getItems that
 * is 10 calls; with single getItem calls it is 1 call per listing, so the default is lower.
 */
function detailsPerKeyword() {
  const fromEnv = Number(process.env.EBAY_DETAILS_PER_KEYWORD);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return Math.min(Math.floor(fromEnv), RESULTS_PER_KEYWORD);
  return isEbayBatchAvailable() ? RESULTS_PER_KEYWORD : 100;
}
/** Listings estimated at ≥ this share of the threshold are tracked (not sourced) so snapshots can confirm them. */
const WATCH_SHARE = 0.5;
/** Leave headroom under the 60s serverless limit. */
export const STEP_BUDGET_MS = 45_000;

export type HuntKind = "KEYWORDS" | "TERAPEAK";

type HuntRow = NonNullable<Awaited<ReturnType<typeof prisma.hunt.findUnique>>>;

interface Deps {
  ebay: EbayBrowseApiProvider;
  ae: AliExpressProvider;
}

function appendLog(logJson: string, message: string): string {
  const log = JSON.parse(logJson || "[]") as Array<{ at: string; message: string }>;
  log.push({ at: new Date().toISOString(), message });
  return JSON.stringify(log.slice(-60));
}

export async function createHunt(
  workspaceId: string,
  input: { kind: "KEYWORDS"; keywords: string[] } | { kind: "TERAPEAK"; rows: TerapeakRow[]; label: string },
) {
  const payload = input.kind === "KEYWORDS" ? input.keywords : input.rows;
  if (payload.length === 0) throw new Error(input.kind === "KEYWORDS" ? "Add at least one keyword" : "No valid rows to import");
  const label = input.kind === "KEYWORDS" ? input.keywords.slice(0, 4).join(", ") + (input.keywords.length > 4 ? "…" : "") : input.label;
  return prisma.hunt.create({
    data: {
      workspaceId,
      kind: input.kind,
      label,
      payloadJson: JSON.stringify(payload),
      totalItems: payload.length,
      logJson: JSON.stringify([
        { at: new Date().toISOString(), message: `Started (${payload.length} ${input.kind === "KEYWORDS" ? "keywords" : "rows"})` },
      ]),
    },
  });
}

/**
 * Advance a hunt by one bounded step:
 *  1. source pending shortlisted listings (up to 6), else
 *  2. process the next payload item (one keyword, or up to 20 Terapeak rows), else
 *  3. finish.
 */
export async function stepHunt(huntId: string, options?: { deadline?: number; deps?: Deps }): Promise<HuntRow> {
  const hunt = await prisma.hunt.findUniqueOrThrow({ where: { id: huntId } });
  if (hunt.status !== "RUNNING") return hunt;
  const deadline = options?.deadline ?? Date.now() + STEP_BUDGET_MS;

  try {
    const deps = options?.deps ?? { ebay: createEbayProvider(), ae: createAliExpressProvider() };
    const settings = await loadHuntSettings(hunt.workspaceId);

    const pending = await prisma.trackedListing.findMany({
      where: { huntId, sourcedAt: null, sold30d: { gte: settings.minSold30d } },
      orderBy: { sold30d: "desc" },
      take: SOURCE_PER_STEP,
    });
    if (pending.length > 0) {
      const sourced = await sourcePending(deps.ae, pending, settings, deadline);
      return prisma.hunt.update({
        where: { id: huntId },
        data: {
          error: null,
          sourcedCount: { increment: sourced.withSources },
          logJson: appendLog(
            hunt.logJson,
            `Sourced ${sourced.done} listing(s) on AliExpress · ${sourced.withSources} with a qualifying 4.7★+ source`,
          ),
        },
      });
    }

    if (hunt.cursor < hunt.totalItems) {
      const payload = JSON.parse(hunt.payloadJson) as unknown[];
      if (hunt.kind === "TERAPEAK") {
        const rows = payload.slice(hunt.cursor, hunt.cursor + TERAPEAK_ROWS_PER_STEP) as TerapeakRow[];
        const result = await importTerapeakRows(deps.ebay, hunt, rows, deadline);
        return prisma.hunt.update({
          where: { id: huntId },
          data: {
            error: null,
            cursor: hunt.cursor + rows.length,
            scannedCount: { increment: rows.length },
            trackedCount: { increment: result.tracked },
            logJson: appendLog(hunt.logJson, `Imported ${rows.length} Terapeak row(s): ${result.linked} linked to live eBay listings`),
          },
        });
      }
      const keyword = String(payload[hunt.cursor]);
      const result = await discoverKeyword(deps.ebay, hunt, keyword, settings, deadline);
      return prisma.hunt.update({
        where: { id: huntId },
        data: {
          error: null,
          cursor: hunt.cursor + 1,
          scannedCount: { increment: result.scanned },
          trackedCount: { increment: result.tracked },
          logJson: appendLog(
            hunt.logJson,
            `"${keyword}": scanned ${result.scanned} eBay listings · ${result.shortlisted} at ≥${settings.minSold30d} sold/30d · ${result.watching} on watch`,
          ),
        },
      });
    }

    const winnerCount = await countWinners({ huntId }, settings);
    logInfo("hunt_completed", { huntId, winnerCount });
    return prisma.hunt.update({
      where: { id: huntId },
      data: {
        error: null,
        status: "COMPLETED",
        finishedAt: new Date(),
        winnerCount,
        logJson: appendLog(hunt.logJson, `Done · ${winnerCount} winner(s) with trusted demand and a qualifying source`),
      },
    });
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const message =
      error instanceof EbayAccessError
        ? `eBay denied access (${error.status}). Check that EBAY_CLIENT_ID / EBAY_CLIENT_SECRET are a Production keyset with the Buy → Browse API. ${raw}`
        : raw;
    logError("hunt_step_failed", { huntId, message });
    const fatal = error instanceof ConfigError || error instanceof EbayAccessError;
    return prisma.hunt.update({
      where: { id: huntId },
      data: {
        ...(fatal ? { status: "FAILED", finishedAt: new Date() } : {}),
        error: message,
        logJson: appendLog(hunt.logJson, `${fatal ? "Stopped" : "Step failed (will retry)"}: ${message}`),
      },
    });
  }
}

async function sourcePending(
  ae: AliExpressProvider,
  listings: Array<Parameters<typeof sourceListing>[1]>,
  settings: HuntSettingsValues,
  deadline: number,
) {
  const results = await mapWithConcurrency(listings, 3, (listing) => sourceListing(ae, listing, settings), deadline);
  let done = 0;
  let withSources = 0;
  for (let i = 0; i < listings.length; i++) {
    const r = results[i];
    if (!r) continue; // deadline hit — picked up next step
    done += 1;
    if (r.status === "fulfilled") {
      if (r.value.sourced > 0) withSources += 1;
      await prisma.trackedListing.update({ where: { id: listings[i]!.id }, data: { sourceError: null } });
    } else {
      const message = r.reason instanceof Error ? r.reason.message : String(r.reason);
      if (r.reason instanceof ConfigError) throw r.reason;
      // Mark as attempted so the hunt moves on; the daily cron retries listings with a sourceError.
      await prisma.trackedListing.update({
        where: { id: listings[i]!.id },
        data: { sourcedAt: new Date(), sourceError: message.slice(0, 500) },
      });
    }
  }
  return { done, withSources };
}

async function fetchDetails(ebay: EbayBrowseApiProvider, ids: string[], deadline: number): Promise<Map<string, EbayItemDetails>> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += GET_ITEMS_BATCH) chunks.push(ids.slice(i, i + GET_ITEMS_BATCH));
  const results = await mapWithConcurrency(chunks, 2, (chunk) => ebay.getItemsBatch(chunk), deadline);
  const merged = new Map<string, EbayItemDetails>();
  for (const r of results) {
    if (r?.status === "fulfilled") for (const [k, v] of r.value) merged.set(k, v);
    else if (r?.status === "rejected") throw r.reason;
  }
  return merged;
}

async function discoverKeyword(
  ebay: EbayBrowseApiProvider,
  hunt: HuntRow,
  keyword: string,
  settings: HuntSettingsValues,
  deadline: number,
) {
  const now = new Date();
  const results = await ebay.searchProducts({
    keyword,
    limit: RESULTS_PER_KEYWORD,
    minPriceMinor: settings.minEbayPriceMinor,
    maxPriceMinor: settings.maxEbayPriceMinor,
  });
  // Probe with the first chunk so a batch→single fallback applies to the size limit below.
  const first = await fetchDetails(
    ebay,
    results.slice(0, GET_ITEMS_BATCH).map((r) => r.itemId),
    deadline,
  );
  const rest = await fetchDetails(
    ebay,
    results.slice(GET_ITEMS_BATCH, detailsPerKeyword()).map((r) => r.itemId),
    deadline,
  );
  const details = new Map([...first, ...rest]);

  const existing = await prisma.trackedListing.findMany({
    where: { workspaceId: hunt.workspaceId, ebayItemId: { in: results.map((r) => r.legacyItemId) } },
    include: { snapshots: { where: { capturedAt: { gte: new Date(now.getTime() - 45 * DAY_MS) } }, orderBy: { capturedAt: "asc" } } },
  });
  const existingById = new Map(existing.map((l) => [l.ebayItemId, l]));

  let shortlisted = 0;
  let watching = 0;
  let tracked = 0;
  for (const summary of results) {
    const detail = details.get(summary.itemId);
    if (!detail || detail.estimatedSoldQuantity == null || detail.outOfStock) continue;

    const prior = existingById.get(summary.legacyItemId);
    const demand = computeDemand({
      snapshots: [...(prior?.snapshots ?? []), { lifetimeSold: detail.estimatedSoldQuantity, capturedAt: now }],
      itemCreationDate: detail.itemCreationDate,
      now,
    });
    const sold = demand.sold30d ?? 0;
    if (sold < settings.minSold30d * WATCH_SHARE) continue;
    if (sold >= settings.minSold30d) shortlisted += 1;
    else watching += 1;

    if (prior) {
      await prisma.trackedListing.update({ where: { id: prior.id }, data: { huntId: hunt.id, keyword, active: true, endedReason: null } });
      await recordSnapshot(prior, detail, now);
    } else {
      const created = await prisma.trackedListing.create({
        data: {
          workspaceId: hunt.workspaceId,
          huntId: hunt.id,
          ebayItemId: summary.legacyItemId,
          browseItemId: summary.itemId,
          title: detail.title,
          url: detail.url,
          imageUrl: detail.imageUrl ?? null,
          priceMinor: detail.priceMinor,
          shippingMinor: detail.shippingMinor ?? null,
          currency: detail.currency,
          keyword,
          itemCreationDate: detail.itemCreationDate,
        },
      });
      await recordSnapshot(created, detail, now);
      tracked += 1;
    }
  }
  return { scanned: details.size, shortlisted, watching, tracked };
}

function pseudoItemId(title: string): string {
  return `tp-${createHash("sha1").update(title.toLowerCase().trim()).digest("hex").slice(0, 16)}`;
}

function bestTitleMatch(title: string, candidates: EbaySearchResult[]): EbaySearchResult | null {
  const target = tokenSet(title);
  let best: { score: number; item: EbaySearchResult } | null = null;
  for (const item of candidates) {
    const score = jaccardSimilarity(target, tokenSet(item.title));
    if (!best || score > best.score) best = { score, item };
  }
  return best && best.score >= 0.45 ? best.item : null;
}

async function importTerapeakRows(ebay: EbayBrowseApiProvider, hunt: HuntRow, rows: TerapeakRow[], deadline: number) {
  const now = new Date();
  // 1. Resolve rows to live listings: by item id, else by title search.
  const browseIds = new Map<number, string>();
  for (const row of rows) if (row.itemId) browseIds.set(row.line, toBrowseItemId(row.itemId));

  const titleOnly = rows.filter((r) => !r.itemId);
  const searches = await mapWithConcurrency(
    titleOnly,
    4,
    (row) => ebay.searchProducts({ keyword: row.title.slice(0, 90), limit: 20 }),
    deadline,
  );
  titleOnly.forEach((row, i) => {
    const r = searches[i];
    if (r?.status === "fulfilled") {
      const match = bestTitleMatch(row.title, r.value);
      if (match) browseIds.set(row.line, match.itemId);
    }
  });

  const details = await fetchDetails(ebay, [...new Set(browseIds.values())], deadline);

  let linked = 0;
  let tracked = 0;
  for (const row of rows) {
    const browseId = browseIds.get(row.line);
    const detail = browseId ? details.get(browseId) : undefined;
    const ebayItemId = detail ? detail.legacyItemId : (row.itemId ?? pseudoItemId(row.title));
    const base = {
      demandTier: "VERIFIED",
      demandSource: "terapeak",
      sold30d: row.sold30d,
      avgSoldPriceMinor: row.avgSoldPriceMinor,
      huntId: hunt.id,
      sourcedAt: null,
      sourceError: null,
    };
    const existing = await prisma.trackedListing.findUnique({
      where: { workspaceId_ebayItemId: { workspaceId: hunt.workspaceId, ebayItemId } },
    });
    // An exact purchase-history count beats a Terapeak aggregate; keep it while it's fresh.
    const keepExact = existing != null && keepImportedDemand(existing, "VERIFIED", now);
    const listing = existing
      ? await prisma.trackedListing.update({
          where: { id: existing.id },
          data: keepExact
            ? { huntId: hunt.id, sourcedAt: null, sourceError: null, active: Boolean(detail) }
            : { ...base, active: Boolean(detail) },
        })
      : await prisma.trackedListing.create({
          data: {
            ...base,
            keyword: row.title.split(/\s+/).slice(0, 4).join(" "),
            workspaceId: hunt.workspaceId,
            ebayItemId,
            browseItemId: detail?.itemId ?? null,
            title: detail?.title ?? row.title,
            url: detail?.url ?? row.url ?? `https://www.ebay.com/sch/i.html?q=${encodeURIComponent(row.title)}`,
            imageUrl: detail?.imageUrl ?? null,
            priceMinor: detail?.priceMinor ?? row.avgSoldPriceMinor ?? 0,
            shippingMinor: detail?.shippingMinor ?? null,
            itemCreationDate: detail?.itemCreationDate ?? null,
            active: Boolean(detail),
            endedReason: detail ? null : "no_live_listing",
          },
        });
    if (!existing) tracked += 1;
    if (detail) {
      linked += 1;
      await recordSnapshot(listing, detail, now);
    }
  }
  return { linked, tracked };
}

/** Winners: trusted demand ≥ threshold and at least one AliExpress source that passed the gate. */
export function winnerWhere(settings: Pick<HuntSettingsValues, "minSold30d">) {
  return {
    sold30d: { gte: settings.minSold30d },
    demandTier: { in: ["PROJECTED", "VERIFIED"] },
    sources: { some: {} },
  };
}

async function countWinners(where: { huntId: string }, settings: HuntSettingsValues) {
  return prisma.trackedListing.count({ where: { ...where, ...winnerWhere(settings) } });
}
