import { describe, expect, it } from "vitest";
import { DEFAULT_SOURCING_RULES, gateSource, selectTopSources } from "@/lib/domain/sourcing";
import type { AliExpressProduct } from "@/lib/domain/types";

const ebay = { title: "Resistance Bands Set Exercise Workout Fitness Tubes", priceMinor: 2499, shippingMinor: 0 };

function ae(overrides: Partial<AliExpressProduct> = {}): AliExpressProduct {
  return {
    productId: "1005001",
    title: "Resistance Bands Set Exercise Workout Fitness Tubes Yoga",
    url: "https://www.aliexpress.com/item/1005001.html",
    priceMinor: 650,
    currency: "USD",
    rating: 4.8,
    reviewCount: 500,
    orderCount: 3000,
    meta: { source: "test", confidence: 1, collectedAt: "", completeness: "partial", warnings: [] },
    ...overrides,
  };
}

describe("gateSource", () => {
  it("passes a strong, profitable, 4.7+ source", () => {
    const g = gateSource(ebay, ae(), "resistance bands", DEFAULT_SOURCING_RULES);
    expect(g.reasons).toEqual([]);
    expect(g.passed).toBe(true);
    expect(g.shippingEstimated).toBe(true);
    expect(g.shippingMinor).toBe(DEFAULT_SOURCING_RULES.aeShippingEstimateMinor);
  });

  it("enforces rating >= 4.7 exactly and rejects missing ratings", () => {
    expect(gateSource(ebay, ae({ rating: 4.7 }), "resistance bands", DEFAULT_SOURCING_RULES).passed).toBe(true);
    expect(gateSource(ebay, ae({ rating: 4.69 }), "resistance bands", DEFAULT_SOURCING_RULES).reasons).toContain("rating_below_min");
    expect(gateSource(ebay, ae({ rating: undefined }), "resistance bands", DEFAULT_SOURCING_RULES).reasons).toContain("rating_missing");
  });

  it("rejects low reviews/orders, poor matches and thin margins", () => {
    expect(gateSource(ebay, ae({ reviewCount: 3 }), "resistance bands", DEFAULT_SOURCING_RULES).reasons).toContain("reviews_below_min");
    expect(gateSource(ebay, ae({ orderCount: 10 }), "resistance bands", DEFAULT_SOURCING_RULES).reasons).toContain("orders_below_min");
    expect(gateSource(ebay, ae({ title: "Silicone Kitchen Spatula" }), "resistance bands", DEFAULT_SOURCING_RULES).passed).toBe(false);
    expect(gateSource(ebay, ae({ priceMinor: 2400 }), "resistance bands", DEFAULT_SOURCING_RULES).reasons).toContain("cost_not_below_ebay");
    expect(gateSource(ebay, ae({ priceMinor: 1700 }), "resistance bands", DEFAULT_SOURCING_RULES).reasons).toContain("margin_below_min");
  });

  it("uses API shipping when known", () => {
    const g = gateSource(ebay, ae({ shippingMinor: 0 }), "resistance bands", DEFAULT_SOURCING_RULES);
    expect(g.shippingEstimated).toBe(false);
    expect(g.shippingMinor).toBe(0);
  });
});

describe("selectTopSources", () => {
  it("returns the top 3 passing sources ranked by match then margin, deduped", () => {
    const candidates = [
      ae({ productId: "a", priceMinor: 900 }),
      ae({ productId: "b", priceMinor: 500 }),
      ae({ productId: "b", priceMinor: 500 }),
      ae({ productId: "c", rating: 4.2 }),
      ae({ productId: "d", priceMinor: 700 }),
      ae({ productId: "e", priceMinor: 800 }),
    ];
    const r = selectTopSources(ebay, candidates, "resistance bands", DEFAULT_SOURCING_RULES);
    expect(r.considered).toBe(5);
    expect(r.passed.map((s) => s.product.productId)).toEqual(["b", "d", "e"]);
    expect(r.rejected.rating_below_min).toBe(1);
  });
});

describe("minimum profit per sale", () => {
  const uk = { title: "Electric Milk Frother Mini Coffee Drinks Whisk Egg Beater USB Rechargeable", priceMinor: 1079, shippingMinor: 0 };
  const frother = (priceMinor: number) =>
    ae({ productId: `f${priceMinor}`, title: "Electric Milk Frother Mini Coffee Whisk Egg Beater USB Rechargeable", priceMinor });
  const rules = { ...DEFAULT_SOURCING_RULES, minMarginPct: 0, aeShippingEstimateMinor: 237, minProfitMinor: 158 };

  it("rejects a source that loses money or clears less than the minimum profit", () => {
    expect(gateSource(uk, frother(979), "milk frother", rules).reasons).toContain("cost_not_below_ebay");
    const thin = gateSource(uk, frother(650), "milk frother", rules);
    expect(thin.profit.estimatedProfitMinor).toBeLessThan(158);
    expect(thin.reasons).toContain("profit_below_min");
  });

  it("passes a source that leaves at least the minimum profit", () => {
    const g = gateSource(uk, frother(300), "milk frother", rules);
    expect(g.profit.estimatedProfitMinor).toBeGreaterThanOrEqual(158);
    expect(g.reasons).not.toContain("profit_below_min");
  });
});

describe("max supplier price for the profit floor", () => {
  it("computes the most an AliExpress item may cost for a £10.79 eBay listing", async () => {
    const { calculateMaxAcceptableSupplierCost } = await import("@/lib/domain/profit");
    const ceiling =
      calculateMaxAcceptableSupplierCost({
        expectedSellingPriceMinor: 1079,
        buyerShippingRevenueMinor: 0,
        additionalSourcingCostMinor: 0,
        ebayFeeRate: 0.1325,
        promotedListingRate: 0,
        expectedReturnCostMinor: 0,
        expectedRefundCostMinor: 0,
        otherFixedCostsMinor: 0,
        minimumNetMarginPercent: 10,
        minimumProfitMinor: 158, // $2 in GBP
      }) - 237; // $3 shipping estimate in GBP
    // 1079 − fees 143 − profit 158 − shipping 237
    expect(ceiling).toBe(541);
  });
});
