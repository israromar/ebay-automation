import { describe, expect, it } from "vitest";
import { calculateProfit } from "@/lib/domain/profit";
import { qualifyAliExpressProduct } from "@/lib/domain/qualification";
import {
  buildAliExpressSearchQueries,
  buildAliExpressSearchQuery,
  candidateFingerprint,
  extractGridQuantity,
  normalizeTitle,
  scoreAliExpressSourceMatch,
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
    const r = qualifyAliExpressProduct({ rating: 4.5, reviewCount: 10, orderCount: 20 }, DEFAULT_RULES);
    expect(r.passed).toBe(false);
    expect(r.reasons).toContain("ALIEXPRESS_RATING_TOO_LOW");
    expect(r.reasons).toContain("ALIEXPRESS_REVIEWS_TOO_LOW");
    expect(r.reasons).toContain("ALIEXPRESS_ORDERS_TOO_LOW");
  });

  it("passes threshold products", () => {
    const r = qualifyAliExpressProduct({ rating: 4.8, reviewCount: 30, orderCount: 100 }, DEFAULT_RULES);
    expect(r.passed).toBe(true);
  });

  it("treats missing review count as incomplete, not hard fail", () => {
    const r = qualifyAliExpressProduct({ rating: 4.9, reviewCount: undefined, orderCount: 100 }, DEFAULT_RULES);
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

  it("prefers short seed keyword for AE search", () => {
    expect(
      buildAliExpressSearchQuery("Rechargeable Portable Blender Personal Mini Mixer Protein Shakes Juicer Cup USB", "portable blender"),
    ).toBe("portable blender");
    expect(buildAliExpressSearchQuery("Rechargeable Portable Blender Personal Mini Mixer Protein Shakes Juicer Cup USB")).toMatch(
      /portable|blender/i,
    );
  });

  it("builds distinct AE query variants from a marketplace title", () => {
    expect(
      buildAliExpressSearchQueries("Rechargeable Portable Blender Personal Mini Mixer Protein Shakes Juicer Cup USB", "portable blender"),
    ).toEqual(["rechargeable portable blender personal mini", "portable blender", "mixer protein shakes juicer cup"]);
  });

  it("preserves kit quantity in AE retrieval and matching", () => {
    const ebayTitle = "XPRT Fitness 11-Piece Resistance Bands Set 150LB - Ultimate Home Gym Kit";
    const exactAeTitle =
      "11pcs TPE Resistance Band Set Fitness Band Pull Rope Elastic Training Band With Door Anchor Handles Carry Bag Legs Ankle Straps";
    const genericAeTitle =
      "5-Level Resistance Bands Set for Yoga Pilates Home Gym Exercise Fitness Sport Elastic Rubber Bands for Workout Gym Accessories";

    expect(buildAliExpressSearchQueries(ebayTitle, "resistance bands")[0]).toBe("11pcs resistance bands set");
    expect(buildAliExpressSearchQueries(ebayTitle)[0]).toBe("11pcs xprt fitness resistance bands set");
    expect(
      scoreAliExpressSourceMatch(
        { title: ebayTitle, condition: "NEW", priceMinor: 2999 },
        { title: exactAeTitle, condition: "NEW", priceMinor: 728 },
        "11pcs resistance bands set",
      ),
    ).toMatchObject({
      hardReject: false,
      confidence: 85,
      reasons: expect.arrayContaining(["pack_quantity_match"]),
    });
    expect(
      scoreAliExpressSourceMatch(
        { title: ebayTitle, condition: "NEW", priceMinor: 2999 },
        { title: genericAeTitle, condition: "NEW", priceMinor: 500 },
        "11pcs resistance bands set",
      ),
    ).toMatchObject({
      hardReject: true,
      reasons: expect.arrayContaining(["pack_quantity_missing"]),
    });
  });

  it("rejects a different tray grid count", () => {
    const ebayTitle = "Ice Cube Tray, 2 Pack Silicone Ice Tray, 37 Ice Cube Molds with Lids";
    const wrongGrid = "2PCS Silicone Ice Cube Mold 148 Cube Large-capacity Ice Trays with Lids";

    expect(extractGridQuantity(ebayTitle)).toBe(37);
    expect(extractGridQuantity(wrongGrid)).toBe(148);
    expect(
      scoreAliExpressSourceMatch({ title: ebayTitle, priceMinor: 899 }, { title: wrongGrid, priceMinor: 310 }, "2pcs ice cube tray"),
    ).toMatchObject({
      hardReject: true,
      reasons: expect.arrayContaining(["feature_quantity_mismatch"]),
    });
  });

  it("matches equivalent cross-marketplace titles with different wording", () => {
    const match = scoreAliExpressSourceMatch(
      {
        title: "Rechargeable Portable Blender Personal Mini Mixer Protein Shakes Juicer Cup USB",
        condition: "NEW",
        priceMinor: 1399,
      },
      {
        title: "Portable USB Personal Mini Juicer Cup Handheld Travel Blender Single Double Cups",
        condition: "NEW",
        priceMinor: 1114,
      },
      "portable blender",
    );

    expect(match.hardReject).toBe(false);
    expect(match.confidence).toBeGreaterThanOrEqual(70);
  });

  it("does not promote a blender accessory as the main product", () => {
    const match = scoreAliExpressSourceMatch(
      { title: "Rechargeable Portable Blender Personal Mini Mixer", condition: "NEW" },
      { title: "Portable Plastic Blender Holder Stand Storage Box", condition: "NEW" },
      "portable blender",
    );

    expect(match.hardReject).toBe(true);
  });

  it("rejects an earbuds case cover as a match for complete earbuds", () => {
    const match = scoreAliExpressSourceMatch(
      { title: "Soundcore P30i Wireless Earbuds 2-in-1 Case Phone Stand Smart Noise Cancelling", condition: "NEW" },
      {
        title:
          "Potdemiel Disney Earphone Case Cover for Anker Soundcore R50i NC / P30i Silicone Wireless Earbuds Protective Shell With Hook",
        condition: "NEW",
      },
      "earbuds",
    );

    expect(match).toMatchObject({
      hardReject: true,
      confidence: 0,
      reasons: expect.arrayContaining(["accessory_vs_main"]),
    });
  });

  it("rejects sewing tape as a match for sleep mouth tape", () => {
    const match = scoreAliExpressSourceMatch(
      { title: "Hostage Mouth Tape 90 Night Supply", condition: "NEW", priceMinor: 4000 },
      {
        title: "Pants Edge Shorten Self Adhesive Pant Mouth Paste Iron on Hem Fabric Fusing Hemming Ironing Sewing Tape",
        condition: "NEW",
        priceMinor: 188,
      },
      "mouth tape",
    );

    expect(match).toMatchObject({
      hardReject: true,
      confidence: 0,
      reasons: expect.arrayContaining(["product_context_mismatch"]),
    });
  });

  it("rejects a lying traction pillow for an over-door cervical traction device", () => {
    const match = scoreAliExpressSourceMatch(
      {
        title: "Neck Traction Stretcher Cervical Head Brace Pain Relief Device Home Over Door",
        condition: "NEW",
        priceMinor: 1899,
      },
      {
        title:
          "Neck Devices Neck Stretcher Orthopedic Traction Pillow Relief Neck Cervical Traction Pillow Portable Cervical Massage Pillow",
        condition: "NEW",
        priceMinor: 563,
      },
      "neck stretcher",
    );

    expect(match).toMatchObject({
      hardReject: true,
      confidence: 0,
      reasons: expect.arrayContaining(["product_context_mismatch"]),
    });
  });
});

describe("scheduler", () => {
  it("computes next daily run", () => {
    const from = new Date("2026-07-26T10:00:00Z");
    const next = nextCronRun("daily", from);
    expect(next.getTime()).toBeGreaterThan(from.getTime());
  });
});
