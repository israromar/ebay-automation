/**
 * 30-day demand from Browse API `estimatedSoldQuantity` (lifetime units sold).
 *
 * eBay's public APIs do not expose sold-in-last-30-days, so we derive it:
 *  - ESTIMATED: lifetime ÷ listing age × 30 (day-0 triage only, never a "winner").
 *  - PROJECTED: delta between daily snapshots spanning ≥ 3 days, scaled to 30 days.
 *  - VERIFIED:  delta over ≥ 30 days of snapshots, a listing younger than 30 days
 *               (lifetime == last 30 days), or an operator Terapeak import.
 */

export const DEMAND_TIERS = ["ESTIMATED", "PROJECTED", "VERIFIED"] as const;
export type DemandTier = (typeof DEMAND_TIERS)[number];

export type DemandBasis = "lifetime_average" | "young_listing" | "snapshot_delta" | "snapshot_30d" | "terapeak" | "none";

export interface SnapshotPoint {
  lifetimeSold: number;
  capturedAt: Date;
}

export interface DemandResult {
  sold30d: number | null;
  tier: DemandTier;
  basis: DemandBasis;
  /** Days of evidence behind the number (snapshot span or listing age). */
  windowDays: number;
}

export const DAY_MS = 24 * 60 * 60 * 1000;
export const MIN_PROJECTION_DAYS = 3;
export const VERIFIED_WINDOW_DAYS = 30;

function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / DAY_MS;
}

/**
 * Keep only the snapshots after the most recent drop in lifetime sold.
 * A drop means eBay reset the counter (relist / listing revision), so earlier
 * points are not comparable.
 */
export function currentSnapshotSegment(snapshots: SnapshotPoint[]): SnapshotPoint[] {
  const sorted = [...snapshots]
    .filter((s) => Number.isFinite(s.lifetimeSold) && s.lifetimeSold >= 0)
    .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  let start = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.lifetimeSold < sorted[i - 1]!.lifetimeSold) start = i;
  }
  return sorted.slice(start);
}

export function computeDemand(input: { snapshots: SnapshotPoint[]; itemCreationDate?: Date | null; now?: Date }): DemandResult {
  const now = input.now ?? new Date();
  const segment = currentSnapshotSegment(input.snapshots);
  const latest = segment[segment.length - 1];

  if (!latest) {
    return { sold30d: null, tier: "ESTIMATED", basis: "none", windowDays: 0 };
  }

  const first = segment[0]!;
  const span = daysBetween(first.capturedAt, latest.capturedAt);

  if (segment.length >= 2 && span >= VERIFIED_WINDOW_DAYS) {
    // Baseline: the newest snapshot that is at least 30 days older than the latest.
    const cutoff = latest.capturedAt.getTime() - VERIFIED_WINDOW_DAYS * DAY_MS;
    let baseline = first;
    for (const point of segment) {
      if (point.capturedAt.getTime() <= cutoff) baseline = point;
      else break;
    }
    const window = daysBetween(baseline.capturedAt, latest.capturedAt);
    const delta = Math.max(0, latest.lifetimeSold - baseline.lifetimeSold);
    return {
      sold30d: Math.round((delta * VERIFIED_WINDOW_DAYS) / window),
      tier: "VERIFIED",
      basis: "snapshot_30d",
      windowDays: Math.round(window * 10) / 10,
    };
  }

  const creation = input.itemCreationDate ?? null;
  const ageDays = creation ? daysBetween(creation, now) : null;

  // Every sale of a listing created within the last 30 days happened in the last 30 days.
  if (ageDays != null && ageDays >= 0 && ageDays <= VERIFIED_WINDOW_DAYS) {
    return {
      sold30d: latest.lifetimeSold,
      tier: "VERIFIED",
      basis: "young_listing",
      windowDays: Math.round(ageDays * 10) / 10,
    };
  }

  if (segment.length >= 2 && span >= MIN_PROJECTION_DAYS) {
    const delta = Math.max(0, latest.lifetimeSold - first.lifetimeSold);
    return {
      sold30d: Math.round((delta * VERIFIED_WINDOW_DAYS) / span),
      tier: "PROJECTED",
      basis: "snapshot_delta",
      windowDays: Math.round(span * 10) / 10,
    };
  }

  if (ageDays != null && ageDays > 0) {
    return {
      sold30d: Math.round((latest.lifetimeSold * VERIFIED_WINDOW_DAYS) / Math.max(ageDays, 1)),
      tier: "ESTIMATED",
      basis: "lifetime_average",
      windowDays: Math.round(ageDays),
    };
  }

  return { sold30d: null, tier: "ESTIMATED", basis: "none", windowDays: 0 };
}

/** Winner = trusted 30-day demand at/above the threshold. Sourcing is checked separately. */
export function isTrustedDemand(tier: string): boolean {
  return tier === "PROJECTED" || tier === "VERIFIED";
}

export function meetsDemand(listing: { sold30d: number | null; demandTier: string }, minSold30d: number): boolean {
  return listing.sold30d != null && listing.sold30d >= minSold30d && isTrustedDemand(listing.demandTier);
}
