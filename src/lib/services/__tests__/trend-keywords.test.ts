import { describe, expect, it } from "vitest";
import { getLatestTrendKeywords, refreshTrendKeywordsFromCatalog } from "@/lib/services/trend-keywords";

describe("trend keyword library service", () => {
  it("refresh upserts a ranked US library from the curated catalog", async () => {
    const refreshed = await refreshTrendKeywordsFromCatalog("US");
    expect(refreshed.market).toBe("US");
    expect(refreshed.keywords).toHaveLength(50);
    expect(refreshed.keywords[0]?.rank).toBe(1);
    expect(refreshed.keywords[49]?.rank).toBe(50);
    expect(refreshed.sources.length).toBeGreaterThan(0);

    const latest = await getLatestTrendKeywords("US");
    expect(latest.snapshotId).toBe(refreshed.snapshotId);
    expect(latest.keywords.map((entry) => entry.keyword)).toEqual(refreshed.keywords.map((entry) => entry.keyword));
  });
});
