import { prisma } from "@/lib/db";
import { computeDemand, DAY_MS, type SnapshotPoint } from "@/lib/domain/demand";
import type { EbayItemDetails } from "@/lib/providers/ebay-browse";

/** Snapshots older than this never affect the 30-day number. */
const SNAPSHOT_LOOKBACK_DAYS = 45;
/** Do not write a second snapshot for the same listing within this window. */
export const SNAPSHOT_MIN_GAP_MS = 20 * 60 * 60 * 1000;

type ListingForSnapshot = {
  id: string;
  demandSource: string;
  itemCreationDate: Date | null;
  lastSnapshotAt: Date | null;
  purchaseHistoryAt?: Date | null;
};

/** Exact purchase-history counts stay authoritative for this long before snapshots take over again. */
export const PURCHASE_HISTORY_FRESH_MS = 7 * DAY_MS;

/**
 * Which demand number wins when a snapshot is recorded:
 *  - a purchase-history count (exact) younger than 7 days always wins;
 *  - a Terapeak import wins until the snapshot tracker itself reaches VERIFIED.
 */
export function keepImportedDemand(
  listing: Pick<ListingForSnapshot, "demandSource" | "purchaseHistoryAt">,
  snapshotTier: string,
  now = new Date(),
): boolean {
  if (listing.demandSource === "purchase_history") {
    return Boolean(listing.purchaseHistoryAt && now.getTime() - listing.purchaseHistoryAt.getTime() < PURCHASE_HISTORY_FRESH_MS);
  }
  return listing.demandSource === "terapeak" && snapshotTier !== "VERIFIED";
}

/** Append a lifetime-sold snapshot (if due) and recompute the 30-day demand tier. */
export async function recordSnapshot(listing: ListingForSnapshot, details: EbayItemDetails, now = new Date()) {
  const due = !listing.lastSnapshotAt || now.getTime() - listing.lastSnapshotAt.getTime() >= SNAPSHOT_MIN_GAP_MS;
  if (due && details.estimatedSoldQuantity != null) {
    await prisma.soldSnapshot.create({
      data: { listingId: listing.id, lifetimeSold: details.estimatedSoldQuantity, capturedAt: now },
    });
  }

  const rows = await prisma.soldSnapshot.findMany({
    where: { listingId: listing.id, capturedAt: { gte: new Date(now.getTime() - SNAPSHOT_LOOKBACK_DAYS * DAY_MS) } },
    orderBy: { capturedAt: "asc" },
    select: { lifetimeSold: true, capturedAt: true },
  });
  const snapshots: SnapshotPoint[] = rows;
  const itemCreationDate = details.itemCreationDate ?? listing.itemCreationDate;
  const demand = computeDemand({ snapshots, itemCreationDate, now });
  const keepImported = keepImportedDemand(listing, demand.tier, now);

  return prisma.trackedListing.update({
    where: { id: listing.id },
    data: {
      title: details.title,
      url: details.url,
      imageUrl: details.imageUrl ?? undefined,
      priceMinor: details.priceMinor,
      shippingMinor: details.shippingMinor ?? null,
      itemCreationDate,
      lifetimeSold: details.estimatedSoldQuantity ?? undefined,
      lastSnapshotAt: due ? now : undefined,
      ...(keepImported ? {} : { sold30d: demand.sold30d, demandTier: demand.tier, demandSource: "browse_tracker" }),
      ...(details.outOfStock || (details.itemEndDate && details.itemEndDate < now)
        ? { active: false, endedReason: details.outOfStock ? "out_of_stock" : "ended" }
        : {}),
    },
  });
}
