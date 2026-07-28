import { describe, expect, it } from "vitest";
import { calculateProfit } from "@/lib/domain/profit";
import { qualifyAliExpressProduct } from "@/lib/domain/qualification";
import {
  candidateFingerprint,
  normalizeTitle,
  scoreProductMatch,
} from "@/lib/domain/matching";
import { DEFAULT_RULES } from "@/lib/domain/types";
import { nextCronRun } from "@/lib/jobs/queue";

describe("profit", () => {
  it("calculates net margin with fees and sourcing buffer", () => {
    const result = calculateProfit({
      aliexpressItemPriceMinor: 1000,
      aliexpressShippingCostMinor: 200,
      additionalSourcingCostMinor: 199,
      expectedSellingPriceMinor: 3000,
      ebayFeeRate: 0.13,
      promotedListingRate: 0.02,
      expectedReturnCostMinor: 0,
      expectedRefundCostMinor: 0,
      otherFixedCostsMinor: 0,
    });
    expect(result.adjustedSourceCostMinor).toBe(1399);
    expect(result.grossRevenueMinor).toBe(3000);
    expect(result.marketplaceFeesMinor).toBe(390);
    expect(result.promotedListingFeeMinor).toBe(60);
    expect(result.totalEstimatedCostMinor).toBe(1849);
    expect(result.estimatedProfitMinor).toBe(1151);
    expect(result.profitMarginPercent).toBeCloseTo(38.366, 2);
  });
});

describe("qualification", () => {
  it("rejects low rating/reviews/orders", () => {
    const r = qualifyAliExpressProduct(
      { rating: 4.5, reviewCount: 10, orderCount: 20 },
      DEFAULT_RULES,
    );
    expect(r.passed).toBe(false);
    expect(r.reasons).toContain("ALIEXPRESS_RATING_TOO_LOW");
    expect(r.reasons).toContain("ALIEXPRESS_REVIEWS_TOO_LOW");
    expect(r.reasons).toContain("ALIEXPRESS_ORDERS_TOO_LOW");
  });

  it("passes threshold products", () => {
    const r = qualifyAliExpressProduct(
      { rating: 4.8, reviewCount: 30, orderCount: 100 },
      DEFAULT_RULES,
    );
    expect(r.passed).toBe(true);
  });

  it("treats missing review count as incomplete, not hard fail", () => {
    const r = qualifyAliExpressProduct(
      { rating: 4.9, reviewCount: undefined, orderCount: 100 },
      DEFAULT_RULES,
    );
    expect(r.passed).toBe(false);
    expect(r.reasons).toEqual([]);
    expect(r.missingFields).toContain("reviewCount");
  });
});

describe("matching", () => {
  it("hard-rejects pack and condition mismatches", () => {
    const m = scoreProductMatch(
      { title: "Blender 1 pc", condition: "NEW", packQuantity: 1 },
      { title: "Blender 2 pack", condition: "USED", packQuantity: 2 },
    );
    expect(m.hardReject).toBe(true);
    expect(m.confidence).toBe(0);
  });

  it("scores similar titles highly", () => {
    const m = scoreProductMatch(
      { title: "Portable Rechargeable Blender USB Mini", condition: "NEW" },
      { title: "Portable Rechargeable Blender USB Mini Smoothie", condition: "NEW" },
    );
    expect(m.hardReject).toBe(false);
    expect(m.confidence).toBeGreaterThanOrEqual(40);
  });

  it("builds stable fingerprints", () => {
    const a = candidateFingerprint({ aliexpressProductId: "1", title: "Hello World!" });
    const b = candidateFingerprint({ aliexpressProductId: "1", title: "hello world" });
    expect(a).toBe(b);
    expect(normalizeTitle("Hot Sale!!! Free Shipping")).not.toContain("free shipping");
  });
});

describe("scheduler", () => {
  it("computes next daily run", () => {
    const from = new Date("2026-07-26T10:00:00Z");
    const next = nextCronRun("daily", from);
    expect(next.getTime()).toBeGreaterThan(from.getTime());
  });
});
