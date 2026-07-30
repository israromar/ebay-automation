import { describe, expect, it } from "vitest";
import { clusterListings, medianMinor, opportunityScore, scoreClustersForKeyword } from "@/lib/domain/trend-scoring";
import type { EbayListing } from "@/lib/domain/types";
import { extractEbayItemId } from "@/lib/services/scan-orchestrator";

function listing(partial: Partial<EbayListing> & { itemId: string; title: string; priceMinor: number }): EbayListing {
  return {
    url: `https://www.ebay.com/itm/${partial.itemId}`,
    currency: "USD",
    condition: "NEW",
    meta: {
      source: "test",
      confidence: 1,
      collectedAt: new Date().toISOString(),
      completeness: "partial",
      warnings: [],
    },
    ...partial,
  };
}

describe("trend scoring", () => {
  it("computes opportunity score in 0–100", () => {
    const score = opportunityScore({
      clusterSize: 5,
      priceMinMinor: 2000,
      priceMaxMinor: 2800,
      priceMedianMinor: 2400,
      listingPriceMinor: 2500,
    });
    expect(score).toBeGreaterThan(50);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("medianMinor handles even/odd lengths", () => {
    expect(medianMinor([100, 300, 200])).toBe(200);
    expect(medianMinor([100, 200])).toBe(150);
  });

  it("clusters similar titles and scores ideas", () => {
    const listings = [
      listing({ itemId: "1", title: "Portable Rechargeable Blender USB Mini", priceMinor: 2499 }),
      listing({ itemId: "2", title: "Portable Rechargeable Blender USB Smoothie", priceMinor: 2799 }),
      listing({ itemId: "3", title: "Portable Rechargeable Personal Blender USB", priceMinor: 2599 }),
      listing({ itemId: "9", title: "LED Strip Lights 16ft RGB Color Changing", priceMinor: 1999 }),
      listing({ itemId: "10", title: "LED Strip Lights 16.4ft RGB Remote", priceMinor: 2199 }),
    ];

    const clusters = clusterListings(listings, 0.4);
    expect(clusters.length).toBeGreaterThanOrEqual(2);

    const ideas = scoreClustersForKeyword("portable blender", listings, {
      minEbayPriceMinor: 500,
      maxEbayPriceMinor: 15000,
      minActiveListings: 2,
      maxActiveListings: 40,
      clusterSimilarity: 0.4,
      topNPerKeyword: 10,
    });
    expect(ideas.length).toBeGreaterThanOrEqual(1);
    expect(ideas[0].score).toBeGreaterThan(0);
    expect(ideas[0].activeListingCount).toBeGreaterThanOrEqual(2);
  });

  it("filters by price and competition caps", () => {
    const listings = [
      listing({ itemId: "1", title: "Portable Blender Cup USB", priceMinor: 800 }),
      listing({ itemId: "2", title: "Portable Blender Cup Rechargeable", priceMinor: 900 }),
    ];
    const ideas = scoreClustersForKeyword("blender", listings, {
      minEbayPriceMinor: 2000,
      maxEbayPriceMinor: 5000,
      minActiveListings: 2,
    });
    expect(ideas).toHaveLength(0);
  });
});

describe("extractEbayItemId", () => {
  it("parses numeric ids and itm URLs", () => {
    expect(extractEbayItemId("123456789012")).toBe("123456789012");
    expect(extractEbayItemId("https://www.ebay.com/itm/123456789012")).toBe("123456789012");
    expect(extractEbayItemId("v1|1100001|0")).toBe("v1|1100001|0");
  });
});
