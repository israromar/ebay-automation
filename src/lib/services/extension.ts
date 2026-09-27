import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DAY_MS, meetsDemand } from "@/lib/domain/demand";
import { extractEbayItemId, legacyItemId, toBrowseItemId } from "@/lib/domain/ebay-ids";
import { buildEbayPurchaseHistoryUrl, detectPurchaseHistoryBlock, parseEbayPurchaseHistoryHtml } from "@/lib/domain/ebay-purchase-history";
import { logInfo, logWarn } from "@/lib/logger";
import { createAliExpressProvider, createEbayProvider, loadHuntSettings } from "./providers";
import { sourceListing } from "./sourcing";
import { recordSnapshot } from "./tracking";

/** Re-check a listing's purchase history at most this often. */
export const RECHECK_AFTER_MS = 3 * DAY_MS;
/** A queued item is handed out again if the extension never reports back within this window. */
const LEASE_MS = 30 * 60 * 1000;
/** After a sign-in page or bot check, every extension in the workspace backs off this long. */
export const PAUSE_AFTER_BLOCK_MS = 6 * 60 * 60 * 1000;
/** Listings estimated below this share of the threshold aren't worth an eBay page view. */
const QUEUE_MIN_SHARE = 0.5;

export function extensionDailyCap(): number {
  const n = Number(process.env.EXTENSION_DAILY_CAP ?? 300);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 300;
}

function startOfUtcDay(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Listings whose exact 30-day count should be read from eBay purchase history, best candidates first. */
export async function queueWhere(workspaceId: string, now = new Date()): Promise<Prisma.TrackedListingWhereInput> {
  const settings = await loadHuntSettings(workspaceId);
  return {
    workspaceId,
    active: true,
    browseItemId: { not: null },
    AND: [
      // Near/above the threshold, or tracked by hand from an eBay page (no hunt) and never checked.
      { OR: [{ sold30d: { gte: Math.floor(settings.minSold30d * QUEUE_MIN_SHARE) } }, { huntId: null, purchaseHistoryAt: null }] },
      { OR: [{ purchaseHistoryAt: null }, { purchaseHistoryAt: { lt: new Date(now.getTime() - RECHECK_AFTER_MS) } }] },
    ],
  };
}

export async function extensionStats(workspaceId: string, now = new Date()) {
  const since = startOfUtcDay(now);
  const [verifiedToday, checkedToday, lastBlock, pending, tokens] = await Promise.all([
    prisma.trackedListing.count({ where: { workspaceId, demandSource: "purchase_history", purchaseHistoryAt: { gte: since } } }),
    prisma.trackedListing.count({
      where: { workspaceId, purchaseHistoryAt: { gte: since }, purchaseHistoryStatus: { not: "leased" } },
    }),
    prisma.trackedListing.findFirst({
      where: {
        workspaceId,
        purchaseHistoryStatus: { in: ["login_required", "blocked"] },
        purchaseHistoryAt: { gte: new Date(now.getTime() - PAUSE_AFTER_BLOCK_MS) },
      },
      orderBy: { purchaseHistoryAt: "desc" },
      select: { purchaseHistoryAt: true, purchaseHistoryStatus: true },
    }),
    prisma.trackedListing.count({ where: await queueWhere(workspaceId, now) }),
    prisma.extensionToken.findMany({ where: { workspaceId, revokedAt: null }, orderBy: { createdAt: "desc" } }),
  ]);
  const pauseUntil = lastBlock?.purchaseHistoryAt ? new Date(lastBlock.purchaseHistoryAt.getTime() + PAUSE_AFTER_BLOCK_MS) : null;
  const lastSeenAt = tokens.reduce<Date | null>((max, t) => (t.lastSeenAt && (!max || t.lastSeenAt > max) ? t.lastSeenAt : max), null);
  return {
    verifiedToday,
    checkedToday,
    dailyCap: extensionDailyCap(),
    pending,
    pauseUntil: pauseUntil && pauseUntil > now ? pauseUntil.toISOString() : null,
    pauseReason: pauseUntil && pauseUntil > now ? (lastBlock?.purchaseHistoryStatus ?? null) : null,
    lastSeenAt: lastSeenAt?.toISOString() ?? null,
    tokens: tokens.map((t) => ({ id: t.id, label: t.label, createdAt: t.createdAt, lastSeenAt: t.lastSeenAt })),
  };
}

/**
 * Hand out up to `limit` listings and lease them for 30 minutes (so two browsers don't fetch the same
 * page). The lease is expressed by backdating `purchaseHistoryAt` so it expires on its own.
 */
export async function leaseQueue(workspaceId: string, limit: number, now = new Date()) {
  const stats = await extensionStats(workspaceId, now);
  const remaining = Math.max(0, stats.dailyCap - stats.checkedToday);
  if (stats.pauseUntil || remaining === 0) return { items: [], ...stats, remainingToday: remaining };

  const rows = await prisma.trackedListing.findMany({
    where: await queueWhere(workspaceId, now),
    orderBy: [{ purchaseHistoryAt: { sort: "asc", nulls: "first" } }, { sold30d: { sort: "desc", nulls: "last" } }],
    take: Math.min(limit, remaining),
    select: { id: true, ebayItemId: true, title: true },
  });
  if (rows.length) {
    await prisma.trackedListing.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { purchaseHistoryAt: new Date(now.getTime() - RECHECK_AFTER_MS + LEASE_MS), purchaseHistoryStatus: "leased" },
    });
  }
  return {
    items: rows.map((r) => ({ id: r.id, ebayItemId: r.ebayItemId, title: r.title, url: buildEbayPurchaseHistoryUrl(r.ebayItemId)! })),
    ...stats,
    remainingToday: remaining,
  };
}

export type PurchaseHistoryOutcome =
  | {
      status: "ok";
      listingId: string;
      sold30d: number;
      lowerBound: boolean;
      avgSoldPriceMinor: number | null;
      winner: boolean;
      sourced: number | null;
    }
  | { status: "no_rows"; listingId: string }
  | { status: "login_required" | "blocked"; listingId: string | null; pause: true; pauseUntil: string }
  | { status: "not_tracked" };

/** Apply one purchase-history page fetched by the extension with the operator's eBay session. */
export async function applyPurchaseHistory(
  workspaceId: string,
  input: { itemId: string; html: string; finalUrl?: string | null },
  now = new Date(),
): Promise<PurchaseHistoryOutcome> {
  const itemId = legacyItemId(extractEbayItemId(input.itemId) ?? input.itemId);
  const listing = await prisma.trackedListing.findUnique({ where: { workspaceId_ebayItemId: { workspaceId, ebayItemId: itemId } } });

  const block = detectPurchaseHistoryBlock(input.html, input.finalUrl);
  if (block) {
    if (listing) {
      await prisma.trackedListing.update({ where: { id: listing.id }, data: { purchaseHistoryAt: now, purchaseHistoryStatus: block } });
    }
    logWarn("purchase_history_blocked", { workspaceId, itemId, block });
    return {
      status: block,
      listingId: listing?.id ?? null,
      pause: true,
      pauseUntil: new Date(now.getTime() + PAUSE_AFTER_BLOCK_MS).toISOString(),
    };
  }
  if (!listing) return { status: "not_tracked" };

  const parsed = parseEbayPurchaseHistoryHtml(input.html, { itemIdOrUrl: itemId, now });
  if (parsed.purchases.length === 0) {
    // No rows: either no recent sales or a markup change. Don't overwrite demand on a guess.
    await prisma.trackedListing.update({ where: { id: listing.id }, data: { purchaseHistoryAt: now, purchaseHistoryStatus: "no_rows" } });
    return { status: "no_rows", listingId: listing.id };
  }

  const updated = await prisma.trackedListing.update({
    where: { id: listing.id },
    data: {
      sold30d: parsed.soldLast30Days,
      demandTier: "VERIFIED",
      demandSource: "purchase_history",
      avgSoldPriceMinor: parsed.avgCompletedSaleMinor ?? listing.avgSoldPriceMinor,
      purchaseHistoryAt: now,
      purchaseHistoryStatus: parsed.soldLast30DaysIsLowerBound ? "ok_lower_bound" : "ok",
    },
    include: { _count: { select: { sources: true } } },
  });

  const settings = await loadHuntSettings(workspaceId);
  const demandOk = meetsDemand(updated, settings.minSold30d);
  let sourced: number | null = null;
  // A newly confirmed winner without sources gets sourced right away instead of waiting for the cron.
  if (
    demandOk &&
    updated._count.sources === 0 &&
    (!updated.sourcedAt || updated.sourceError || updated.sourcedAt < new Date(now.getTime() - DAY_MS))
  ) {
    try {
      sourced = (await sourceListing(createAliExpressProvider(), updated, settings)).sourced;
      await prisma.trackedListing.update({ where: { id: updated.id }, data: { sourceError: null } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.trackedListing.update({ where: { id: updated.id }, data: { sourcedAt: now, sourceError: message.slice(0, 500) } });
    }
  }
  const sourceCount = sourced ?? updated._count.sources;
  logInfo("purchase_history_applied", { workspaceId, itemId, sold30d: parsed.soldLast30Days, sourced });
  return {
    status: "ok",
    listingId: updated.id,
    sold30d: parsed.soldLast30Days,
    lowerBound: parsed.soldLast30DaysIsLowerBound,
    avgSoldPriceMinor: parsed.avgCompletedSaleMinor,
    winner: demandOk && sourceCount > 0,
    sourced,
  };
}

/** "Track in Hunter" from an eBay item page. Queued for a purchase-history check straight away. */
export async function trackFromUrl(workspaceId: string, urlOrId: string, now = new Date()) {
  const raw = extractEbayItemId(urlOrId);
  if (!raw) throw new Error("Not an eBay item URL");
  const itemId = legacyItemId(raw);
  const ebay = createEbayProvider();
  const browseId = raw.startsWith("v1|") ? raw : toBrowseItemId(itemId);
  const detail = (await ebay.getItemsBatch([browseId])).get(browseId);
  if (!detail) throw new Error("eBay did not return this listing (ended, or a multi-variation listing opened without a variation)");

  const existing = await prisma.trackedListing.findUnique({ where: { workspaceId_ebayItemId: { workspaceId, ebayItemId: itemId } } });
  const listing =
    existing ??
    (await prisma.trackedListing.create({
      data: {
        workspaceId,
        ebayItemId: itemId,
        browseItemId: detail.itemId,
        title: detail.title,
        url: detail.url,
        imageUrl: detail.imageUrl ?? null,
        priceMinor: detail.priceMinor,
        shippingMinor: detail.shippingMinor ?? null,
        currency: detail.currency,
        keyword: detail.title.split(/\s+/).slice(0, 4).join(" ").toLowerCase(),
        itemCreationDate: detail.itemCreationDate,
      },
    }));
  if (existing && !existing.active) {
    await prisma.trackedListing.update({ where: { id: existing.id }, data: { active: true, endedReason: null } });
  }
  // Manually tracked listings skip the threshold filter for their first check.
  await prisma.trackedListing.update({ where: { id: listing.id }, data: { purchaseHistoryAt: null, purchaseHistoryStatus: null } });
  const updated = await recordSnapshot(listing, detail, now);
  return { listing: updated, created: !existing };
}

/** Lookup for the eBay item-page panel. */
export async function listingForPanel(workspaceId: string, urlOrId: string) {
  const raw = extractEbayItemId(urlOrId);
  if (!raw) return null;
  const listing = await prisma.trackedListing.findUnique({
    where: { workspaceId_ebayItemId: { workspaceId, ebayItemId: legacyItemId(raw) } },
    include: { sources: { orderBy: { rank: "asc" }, take: 1 } },
  });
  if (!listing) return null;
  const settings = await loadHuntSettings(workspaceId);
  return {
    id: listing.id,
    sold30d: listing.sold30d,
    demandTier: listing.demandTier,
    demandSource: listing.demandSource,
    purchaseHistoryAt: listing.purchaseHistoryAt,
    purchaseHistoryStatus: listing.purchaseHistoryStatus,
    minSold30d: settings.minSold30d,
    winner: meetsDemand(listing, settings.minSold30d) && listing.sources.length > 0,
    bestSource: listing.sources[0]
      ? {
          title: listing.sources[0].title,
          url: listing.sources[0].url,
          priceMinor: listing.sources[0].priceMinor,
          rating: listing.sources[0].rating,
          netProfitMinor: listing.sources[0].netProfitMinor,
          marginPct: listing.sources[0].marginPct,
        }
      : null,
  };
}
