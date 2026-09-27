import { describe, expect, it } from "vitest";
import { calculateMaxAcceptableSupplierCost } from "@/lib/domain/profit";
import {
  classifyOpportunityScore,
  finalizeProductIntelligence,
  isVerifiedDemandSource,
  qualifyEbaySide,
  type EbayQualificationInput,
  type SupplierQualificationInput,
} from "@/lib/domain/product-intelligence";
import { DEFAULT_RULES } from "@/lib/domain/types";

function ebayInput(overrides: Partial<EbayQualificationInput> = {}): EbayQualificationInput {
  return {
    ebayItemId: "100",
    ebayTitle: "Portable blender 6 piece kit",
    listingPriceMinor: 5000,
    priceMedianMinor: 4800,
    demandAvailable: true,
    demandSource: "purchase_history",
    sales: { sold7d: 28, sold30d: 120, sold90d: null, sold365d: null },
    activeListingCount: 20,
    sellerCount: 8,
    topSellerListingShare: 0.2,
    rules: DEFAULT_RULES,
    ...overrides,
  };
}

function supplier(overrides: Partial<SupplierQualificationInput> = {}): SupplierQualificationInput {
  return {
    productId: "ae-1",
    title: "Portable blender 6 piece kit",
    rating: 4.9,
    reviewCount: 40,
    orderCount: 200,
    priceMinor: 1000,
    shippingMinor: 200,
    matchConfidence: 90,
    matchHardReject: false,
    matchRejectReasons: [],
    ...overrides,
  };
}

describe("supplier budget", () => {
  it("computes the maximum AE item-plus-shipping from fees, shipping, profit, and allowance", () => {
    const max = calculateMaxAcceptableSupplierCost({
      expectedSellingPriceMinor: 2999,
      additionalSourcingCostMinor: 0,
      ebayFeeRate: 0.15,
      promotedListingRate: 0,
      expectedReturnCostMinor: 150,
      expectedRefundCostMinor: 0,
      otherFixedCostsMinor: 300,
      otherPercentageCost: 0,
      minimumNetMarginPercent: 0,
      minimumProfitMinor: 800,
    });
    expect(max).toBe(1299);
  });
});

describe("ebay-side hard filters", () => {
  it("does not treat a Browse lifetime estimate as verified 30-day demand", () => {
    const gate = qualifyEbaySide(
      ebayInput({
        demandAvailable: true,
        demandSource: "browse_estimate",
        sales: { sold7d: null, sold30d: 100, sold90d: null, sold365d: null },
      }),
    );
    expect(isVerifiedDemandSource("browse_estimate")).toBe(false);
    expect(gate.proceed).toBe(false);
    expect(gate.snapshot.status).toBe("needs_evidence");
    expect(gate.snapshot.opportunityScore).toBeNull();
    expect(gate.snapshot.rejectIds).toContain("EBAY_SOLD_HISTORY_UNAVAILABLE");
    expect(gate.snapshot.rejectIds).not.toContain("EBAY_RECENT_SALES_TOO_LOW");
  });

  it("rejects verified 30-day sales below the minimum with no score", () => {
    const gate = qualifyEbaySide(ebayInput({ sales: { sold7d: 2, sold30d: 10, sold90d: null, sold365d: null } }));
    expect(gate.proceed).toBe(false);
    expect(gate.snapshot.classification).toBe("reject");
    expect(gate.snapshot.opportunityScore).toBeNull();
    expect(gate.snapshot.rejectIds).toEqual(["EBAY_RECENT_SALES_TOO_LOW"]);
  });

  it("does not reject when sell-through cannot be calculated", () => {
    const gate = qualifyEbaySide(ebayInput({ activeListingCount: null, sellerCount: null, topSellerListingShare: null }));
    expect(gate.proceed).toBe(true);
    expect(gate.snapshot.rejectIds).not.toContain("SELL_THROUGH_TOO_LOW");
    expect(gate.snapshot.warnings).toContain("sell_through_unavailable");
  });

  it("rejects known sell-through below the threshold with no score", () => {
    const gate = qualifyEbaySide(ebayInput({ sales: { sold7d: 8, sold30d: 40, sold90d: null, sold365d: null }, activeListingCount: 400 }));
    expect(gate.sellThroughRate).toBeCloseTo(0.1);
    expect(gate.proceed).toBe(false);
    expect(gate.snapshot.opportunityScore).toBeNull();
    expect(gate.snapshot.classification).toBe("reject");
    expect(gate.snapshot.rejectIds).toEqual(["SELL_THROUGH_TOO_LOW"]);
  });

  it("hard-rejects restricted products before scoring", () => {
    const gate = qualifyEbaySide(ebayInput({ ebayTitle: "CBD oil tincture 30ml" }));
    const snapshot = finalizeProductIntelligence(gate, supplier());
    expect(snapshot.opportunityScore).toBeNull();
    expect(snapshot.classification).toBe("reject");
    expect(snapshot.rejectIds).toContain("RESTRICTED_PRODUCT");
    expect(snapshot.riskScore).toBeNull();
  });
});

describe("supplier gates and scores", () => {
  it("accepts rating 5.0 and rejects 4.69", () => {
    const gate = qualifyEbaySide(ebayInput());
    const perfect = finalizeProductIntelligence(gate, supplier({ rating: 5 }));
    expect(perfect.rejectIds).not.toContain("ALIEXPRESS_RATING_TOO_LOW");
    expect(perfect.opportunityScore).not.toBeNull();

    const low = finalizeProductIntelligence(gate, supplier({ rating: 4.69 }));
    expect(low.opportunityScore).toBeNull();
    expect(low.classification).toBe("reject");
    expect(low.rejectIds).toEqual(["ALIEXPRESS_RATING_TOO_LOW"]);
  });

  it("hard-rejects a pack mismatch with no opportunity score", () => {
    const snapshot = finalizeProductIntelligence(
      qualifyEbaySide(ebayInput()),
      supplier({ matchHardReject: true, matchConfidence: 0, matchRejectReasons: ["pack_quantity_mismatch"] }),
    );
    expect(snapshot.opportunityScore).toBeNull();
    expect(snapshot.classification).toBe("reject");
    expect(snapshot.rejectIds).toContain("pack_quantity_mismatch");
  });

  it("does not treat missing shipping as zero", () => {
    const snapshot = finalizeProductIntelligence(qualifyEbaySide(ebayInput()), supplier({ shippingMinor: null }));
    expect(snapshot.status).toBe("needs_evidence");
    expect(snapshot.opportunityScore).toBeNull();
    expect(snapshot.rejectIds).toContain("MISSING_SHIPPING_COST");
    expect(snapshot.supplier?.landedCost).toBeNull();
    expect(snapshot.economics.estimatedNetProfit).toBeNull();
  });

  it("drops missing score components and renormalizes instead of inventing a midpoint", () => {
    const snapshot = finalizeProductIntelligence(
      qualifyEbaySide(
        ebayInput({
          sales: { sold7d: null, sold30d: 120, sold90d: null, sold365d: null },
          sellerCount: null,
          topSellerListingShare: null,
        }),
      ),
      supplier(),
    );
    expect(snapshot.trendScore).toBeNull();
    expect(snapshot.listingOpportunityScore).toBeNull();
    expect(snapshot.warnings).toContain("score_partial:trend");
    expect(snapshot.warnings).toContain("score_partial:listingOpportunity");
    expect(snapshot.opportunityScore).not.toBeNull();
    expect(snapshot.demandScore).not.toBeNull();
  });

  it("classifies a fully qualified product and keeps match confidence separate from opportunity", () => {
    const snapshot = finalizeProductIntelligence(qualifyEbaySide(ebayInput()), supplier({ matchConfidence: 92 }));
    expect(snapshot.status).toBe("qualified");
    expect(snapshot.classification).toBe("strong_candidate");
    expect(snapshot.opportunityScore).toBeGreaterThanOrEqual(80);
    expect(snapshot.matchConfidence).toBe(92);
    expect(snapshot.matchConfidence).not.toBe(snapshot.opportunityScore);
    expect(snapshot.economics.maxAcceptableSupplierCost).toBeGreaterThan(0);
    expect(snapshot.supplier?.landedCost).toBeLessThanOrEqual(snapshot.economics.maxAcceptableSupplierCost ?? 0);
  });
});

describe("classification bands", () => {
  it("maps score bands without overriding a hard reject", () => {
    expect(classifyOpportunityScore(80)).toBe("strong_candidate");
    expect(classifyOpportunityScore(79)).toBe("investigate");
    expect(classifyOpportunityScore(60)).toBe("investigate");
    expect(classifyOpportunityScore(59)).toBe("weak_candidate");
    expect(classifyOpportunityScore(40)).toBe("weak_candidate");
    expect(classifyOpportunityScore(39)).toBe("reject");
  });
});
