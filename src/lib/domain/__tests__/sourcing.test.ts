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
