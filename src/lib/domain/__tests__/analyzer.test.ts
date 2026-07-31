import { describe, expect, it } from "vitest";
import {
  aggregateNiches,
  aggregateSellers,
  buildAnalyzerView,
  buildOpportunityMatrix,
  labelSoldSource,
  scoreLabel,
} from "@/lib/domain/analyzer";
import { DEFAULT_RULES, type EbayListing } from "@/lib/domain/types";

function listing(partial: Partial<EbayListing> & { itemId: string; title: string; priceMinor: number }): EbayListing {
  return {
    url: `https://www.ebay.com/itm/${partial.itemId}`,
    currency: "USD",
    meta: {
      source: "test",
      confidence: 1,
      collectedAt: new Date().toISOString(),
      completeness: "full",
      warnings: [],
    },
    ...partial,
  };
}

describe("analyzer domain", () => {
  it("labels sold sources honestly", () => {
    expect(labelSoldSource("browse_estimate", false)).toBe("browse_estimate");
    expect(labelSoldSource("insights", false)).toBe("insights");
    expect(labelSoldSource(null, true)).toBe("verified_30d");
    expect(labelSoldSource(null, false)).toBe("unavailable");
  });

  it("builds matrix with risk soft-flags not VeRO", () => {
    const matrix = buildOpportunityMatrix({
      overallScore: 78,
      activeListingCount: 12,
      demandSold: null,
      demandSource: "unavailable",
      marginPercent: null,
      supplierRating: null,
      supplierOrders: null,
      hasSupplier: false,
    });
    expect(matrix.find((r) => r.key === "risk")?.note).toMatch(/not VeRO/i);
    expect(matrix.find((r) => r.key === "profitability")?.score).toBe(0);
  });

  it("builds analyzer view with Browse proxy score note", () => {
    const view = buildAnalyzerView({
      listing: listing({ itemId: "123", title: "Wireless CarPlay Adapter", priceMinor: 3999 }),
      clusterListings: [
        listing({ itemId: "123", title: "Wireless CarPlay Adapter", priceMinor: 3999 }),
        listing({ itemId: "124", title: "Wireless CarPlay Dongle", priceMinor: 3499 }),
        listing({ itemId: "125", title: "CarPlay Adapter USB", priceMinor: 4299 }),
      ],
      searchKeyword: "carplay adapter",
      rules: DEFAULT_RULES,
    });
    expect(view.overallScore).toBeGreaterThan(0);
    expect(view.scoreNote).toMatch(/proxy/i);
    expect(view.demand.source).toBe("unavailable");
    expect(view.supplier).toBeNull();
    expect(view.guidance.length).toBeGreaterThan(10);
  });

  it("includes profit when supplier present", () => {
    const view = buildAnalyzerView({
      listing: listing({ itemId: "123", title: "Widget", priceMinor: 3999 }),
      supplier: {
        productId: "ae1",
        title: "AE Widget",
        url: "https://aliexpress.com/item/1.html",
        priceMinor: 1428,
        shippingMinor: 250,
        rating: 4.8,
        orderCount: 1200,
        matchConfidence: 88,
      },
      rules: DEFAULT_RULES,
      demandVerified: true,
      soldLast30Days: 40,
      soldCountSource: "manual",
    });
    expect(view.profit).not.toBeNull();
    expect(view.profit!.netProfitMinor).not.toBeNaN();
    expect(scoreLabel(view.overallScore, true)).toMatch(/Promising|Needs|Weak/);
  });

  it("aggregates niches and sellers", () => {
    const niches = aggregateNiches([
      { niche: "Tech", keyword: "carplay", momentum: "rising", rank: 1 },
      { niche: "Tech", keyword: "blender", momentum: "steady", rank: 2 },
      { niche: "Home", keyword: "led strip", momentum: "rising", rank: 3 },
    ]);
    expect(niches[0]?.niche).toBe("Tech");
    expect(niches[0]?.keywordCount).toBe(2);

    const sellers = aggregateSellers([
      { sellerUsername: "ProSeller", priceMinor: 2000, title: "A", itemId: "1", url: null },
      { sellerUsername: "ProSeller", priceMinor: 3000, title: "B", itemId: "2", url: null },
      { sellerUsername: "Other", priceMinor: 1000, title: "C", itemId: "3", url: null },
    ]);
    expect(sellers[0]?.sellerUsername).toBe("ProSeller");
    expect(sellers[0]?.listingCount).toBe(2);
    expect(sellers[0]?.avgPriceMinor).toBe(2500);
  });
});
