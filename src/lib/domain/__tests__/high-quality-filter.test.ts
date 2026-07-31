import { describe, expect, it } from "vitest";
import { aeLandedCostRatio, evaluateHighQualityFilter, resolveHighQualityThresholds } from "@/lib/domain/high-quality-filter";
import { classifyAutomationDecision } from "@/lib/domain/automation";

describe("high quality filter", () => {
  const thresholds = resolveHighQualityThresholds();

  it("computes AE landed cost ratio", () => {
    expect(aeLandedCostRatio({ ebayPriceMinor: 4000, aliexpressPriceMinor: 1200, aliexpressShippingMinor: 300 })).toBe(0.375);
    expect(aeLandedCostRatio({ ebayPriceMinor: 0, aliexpressPriceMinor: 100 })).toBeNull();
  });

  it("passes strong high-margin opportunities", () => {
    expect(
      evaluateHighQualityFilter(
        {
          ebayCurrentPriceMinor: 3999,
          aliexpressPriceMinor: 900,
          aliexpressShippingMinor: 200,
          netMarginPercent: 22,
          orderCount: 250,
        },
        thresholds,
      ),
    ).toEqual([]);
  });

  it("rejects low eBay price, expensive AE, thin margin, and low volume", () => {
    const reasons = evaluateHighQualityFilter(
      {
        ebayCurrentPriceMinor: 899,
        aliexpressPriceMinor: 700,
        aliexpressShippingMinor: 100,
        netMarginPercent: 8,
        orderCount: 20,
      },
      thresholds,
    );
    expect(reasons).toEqual(
      expect.arrayContaining([
        "HIGH_QUALITY_EBAY_PRICE_TOO_LOW",
        "HIGH_QUALITY_SOURCE_COST_RATIO_HIGH",
        "HIGH_QUALITY_MARGIN_TOO_LOW",
        "HIGH_QUALITY_AE_VOLUME_TOO_LOW",
      ]),
    );
  });

  it("is ignored by decision classifier when disabled", () => {
    expect(
      classifyAutomationDecision({
        status: "APPROVED",
        aliexpressProductId: "ae-1",
        matchConfidence: 90,
        aliexpressShippingMinor: 100,
        demandVerified: true,
        minimumMatchConfidence: 70,
        ebayCurrentPriceMinor: 800,
        aliexpressPriceMinor: 600,
        netMarginPercent: 5,
        orderCount: 10,
        highQualityFilter: false,
      }).outcome,
    ).toBe("READY_FOR_APPROVAL");
  });

  it("rejects below-bar candidates when enabled", () => {
    const result = classifyAutomationDecision({
      status: "APPROVED",
      aliexpressProductId: "ae-1",
      matchConfidence: 90,
      aliexpressShippingMinor: 100,
      demandVerified: true,
      minimumMatchConfidence: 70,
      ebayCurrentPriceMinor: 800,
      aliexpressPriceMinor: 600,
      netMarginPercent: 5,
      orderCount: 10,
      highQualityFilter: true,
    });
    expect(result.outcome).toBe("REJECTED");
    expect(result.reasons).toContain("BELOW_HIGH_QUALITY_BAR");
  });
});
