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
};

/**
 * Append a lifetime-sold snapshot (if due) and recompute the 30-day demand tier.
 * Terapeak-imported demand stays authoritative until the tracker itself reaches VERIFIED.
 */
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
  const keepTerapeak = listing.demandSource === "terapeak" && demand.tier !== "VERIFIED";

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
      ...(keepTerapeak ? {} : { sold30d: demand.sold30d, demandTier: demand.tier, demandSource: "browse_tracker" }),
      ...(details.outOfStock || (details.itemEndDate && details.itemEndDate < now)
        ? { active: false, endedReason: details.outOfStock ? "out_of_stock" : "ended" }
        : {}),
    },
  });
}
