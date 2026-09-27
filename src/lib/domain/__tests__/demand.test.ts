import { describe, expect, it } from "vitest";
import { computeDemand, currentSnapshotSegment, DAY_MS, meetsDemand } from "@/lib/domain/demand";

const now = new Date("2026-09-27T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * DAY_MS);

describe("computeDemand", () => {
  it("returns null without snapshots", () => {
    expect(computeDemand({ snapshots: [], now })).toEqual({ sold30d: null, tier: "ESTIMATED", basis: "none", windowDays: 0 });
  });

  it("estimates from lifetime average on day 0", () => {
    const r = computeDemand({ snapshots: [{ lifetimeSold: 300, capturedAt: now }], itemCreationDate: daysAgo(300), now });
    expect(r).toMatchObject({ sold30d: 30, tier: "ESTIMATED", basis: "lifetime_average" });
  });

  it("treats listings younger than 30 days as verified (lifetime == last 30 days)", () => {
    const r = computeDemand({ snapshots: [{ lifetimeSold: 42, capturedAt: now }], itemCreationDate: daysAgo(12), now });
    expect(r).toMatchObject({ sold30d: 42, tier: "VERIFIED", basis: "young_listing" });
  });

  it("does not project from snapshots under 3 days apart", () => {
    const r = computeDemand({
      snapshots: [
        { lifetimeSold: 100, capturedAt: daysAgo(2) },
        { lifetimeSold: 110, capturedAt: now },
      ],
      itemCreationDate: daysAgo(400),
      now,
    });
    expect(r.tier).toBe("ESTIMATED");
  });

  it("projects from a 5-day snapshot delta", () => {
    const r = computeDemand({
      snapshots: [
        { lifetimeSold: 100, capturedAt: daysAgo(5) },
        { lifetimeSold: 103, capturedAt: daysAgo(3) },
        { lifetimeSold: 105, capturedAt: now },
      ],
      itemCreationDate: daysAgo(400),
      now,
    });
    expect(r).toMatchObject({ sold30d: 30, tier: "PROJECTED", basis: "snapshot_delta", windowDays: 5 });
  });

  it("verifies with 30+ days of snapshots using the baseline closest to 30 days", () => {
    const r = computeDemand({
      snapshots: [
        { lifetimeSold: 10, capturedAt: daysAgo(45) },
        { lifetimeSold: 40, capturedAt: daysAgo(30) },
        { lifetimeSold: 50, capturedAt: daysAgo(20) },
        { lifetimeSold: 65, capturedAt: now },
      ],
      itemCreationDate: daysAgo(400),
      now,
    });
    expect(r).toMatchObject({ sold30d: 25, tier: "VERIFIED", basis: "snapshot_30d", windowDays: 30 });
  });

  it("resets the baseline when lifetime sold drops (relist)", () => {
    const snapshots = [
      { lifetimeSold: 500, capturedAt: daysAgo(10) },
      { lifetimeSold: 2, capturedAt: daysAgo(8) },
      { lifetimeSold: 12, capturedAt: now },
    ];
    expect(currentSnapshotSegment(snapshots)).toHaveLength(2);
    const r = computeDemand({ snapshots, itemCreationDate: daysAgo(400), now });
    expect(r).toMatchObject({ sold30d: 38, tier: "PROJECTED" });
  });
});

describe("meetsDemand", () => {
  it("requires a trusted tier and the threshold", () => {
    expect(meetsDemand({ sold30d: 25, demandTier: "PROJECTED" }, 20)).toBe(true);
    expect(meetsDemand({ sold30d: 25, demandTier: "VERIFIED" }, 20)).toBe(true);
    expect(meetsDemand({ sold30d: 25, demandTier: "ESTIMATED" }, 20)).toBe(false);
    expect(meetsDemand({ sold30d: 19, demandTier: "VERIFIED" }, 20)).toBe(false);
    expect(meetsDemand({ sold30d: null, demandTier: "VERIFIED" }, 20)).toBe(false);
  });
});
