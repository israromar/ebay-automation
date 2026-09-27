import { prisma } from "@/lib/db";
import { DAY_MS, meetsDemand } from "@/lib/domain/demand";
import { logInfo } from "@/lib/logger";
import { GET_ITEMS_BATCH } from "@/lib/providers/ebay-browse";
import { createAliExpressProvider, createEbayProvider, loadHuntSettings, type HuntSettingsValues } from "./providers";
import { stepHunt } from "./hunt";
import { sourceListing } from "./sourcing";
import { SNAPSHOT_MIN_GAP_MS, recordSnapshot } from "./tracking";

/** Re-source winners whose AliExpress sources are older than this. */
const RESOURCE_AFTER_MS = 7 * DAY_MS;
/** Stop tracking listings that are clearly not selling after two weeks of snapshots. */
const DROP_AFTER_DAYS = 14;
const DROP_BELOW_SHARE = 0.25;

export interface TrackerRunResult {
  snapshotted: number;
  deactivated: number;
  resourced: number;
  huntsAdvanced: number;
  remaining: number;
}

/**
 * Daily job: snapshot every active tracked listing (20 per getItems call), recompute
 * 30-day demand, re-source new/stale winners, and advance hunts left running by a closed tab.
 * Safe to call repeatedly — listings snapshotted in the last 20h are skipped.
 */
export async function runTracker(options?: { deadline?: number }): Promise<TrackerRunResult> {
  const deadline = options?.deadline ?? Date.now() + 50_000;
  const result: TrackerRunResult = { snapshotted: 0, deactivated: 0, resourced: 0, huntsAdvanced: 0, remaining: 0 };
  const ebay = createEbayProvider();
  const settingsCache = new Map<string, HuntSettingsValues>();
  const settingsFor = async (workspaceId: string) => {
    if (!settingsCache.has(workspaceId)) settingsCache.set(workspaceId, await loadHuntSettings(workspaceId));
    return settingsCache.get(workspaceId)!;
  };

  const dueWhere = {
    active: true,
    browseItemId: { not: null },
    OR: [{ lastSnapshotAt: null }, { lastSnapshotAt: { lt: new Date(Date.now() - SNAPSHOT_MIN_GAP_MS) } }],
  };

  // 1. Snapshots
  while (Date.now() < deadline - 5_000) {
    const batch = await prisma.trackedListing.findMany({
      where: dueWhere,
      orderBy: { lastSnapshotAt: { sort: "asc", nulls: "first" } },
      take: GET_ITEMS_BATCH,
    });
    if (batch.length === 0) break;
    const details = await ebay.getItemsBatch(batch.map((l) => l.browseItemId!));
    const now = new Date();
    for (const listing of batch) {
      const detail = details.get(listing.browseItemId!);
      if (!detail) {
        await prisma.trackedListing.update({ where: { id: listing.id }, data: { active: false, endedReason: "not_found", lastSnapshotAt: now } });
        result.deactivated += 1;
        continue;
      }
      const updated = await recordSnapshot(listing, detail, now);
      result.snapshotted += 1;
      if (!updated.active) {
        result.deactivated += 1;
        continue;
      }
      const settings = await settingsFor(listing.workspaceId);
      const ageDays = (now.getTime() - listing.createdAt.getTime()) / DAY_MS;
      if (
        updated.demandTier !== "ESTIMATED" &&
        ageDays >= DROP_AFTER_DAYS &&
        (updated.sold30d ?? 0) < settings.minSold30d * DROP_BELOW_SHARE
      ) {
        await prisma.trackedListing.update({ where: { id: listing.id }, data: { active: false, endedReason: "low_demand" } });
        result.deactivated += 1;
      }
    }
  }
  result.remaining = await prisma.trackedListing.count({ where: dueWhere });

  // 2. Re-source listings that became winners, have stale sources, or failed sourcing.
  if (Date.now() < deadline - 10_000) {
    const candidates = await prisma.trackedListing.findMany({
      where: {
        demandTier: { in: ["PROJECTED", "VERIFIED"] },
        OR: [{ sourcedAt: null }, { sourcedAt: { lt: new Date(Date.now() - RESOURCE_AFTER_MS) } }, { sourceError: { not: null } }],
      },
      orderBy: { sold30d: "desc" },
      take: 40,
    });
    const ae = candidates.length ? createAliExpressProvider() : null;
    for (const listing of candidates) {
      if (Date.now() > deadline - 8_000 || !ae) break;
      const settings = await settingsFor(listing.workspaceId);
      if (!meetsDemand(listing, settings.minSold30d)) continue;
      try {
        await sourceListing(ae, listing, settings);
        await prisma.trackedListing.update({ where: { id: listing.id }, data: { sourceError: null } });
        result.resourced += 1;
      } catch (error) {
        await prisma.trackedListing.update({
          where: { id: listing.id },
          data: { sourcedAt: new Date(), sourceError: (error instanceof Error ? error.message : String(error)).slice(0, 500) },
        });
      }
    }
  }

  // 3. Hunts nobody is polling (tab closed).
  const stale = await prisma.hunt.findMany({
    where: { status: "RUNNING", updatedAt: { lt: new Date(Date.now() - 2 * 60_000) } },
    orderBy: { updatedAt: "asc" },
    take: 5,
  });
  for (const hunt of stale) {
    let status = hunt.status;
    while (status === "RUNNING" && Date.now() < deadline - 20_000) {
      const next = await stepHunt(hunt.id, { deadline: deadline - 5_000 });
      status = next.error ? "RETRY_LATER" : next.status;
    }
    result.huntsAdvanced += 1;
  }

  logInfo("tracker_run", { ...result });
  return result;
}
