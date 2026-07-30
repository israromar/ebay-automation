import { describe, expect, it } from "vitest";
import {
  applyVisualScoresToRankedSources,
  hasItemPriceBelowEbay,
  hasSourcingPriceAdvantage,
  isKnownShippingCost,
  rankAliExpressSources,
} from "@/lib/domain/source-ranking";
import { combineTextAndVisualConfidence, cosineSimilarity, visualSimilarityToScore } from "@/lib/domain/visual-matching";
import { DEFAULT_RULES, type AliExpressProduct } from "@/lib/domain/types";

const meta = {
  source: "test",
  confidence: 1,
  collectedAt: "2026-07-29T00:00:00.000Z",
  completeness: "partial" as const,
  warnings: [],
};

function source(id: string, title: string, rating: number, priceMinor: number): AliExpressProduct {
  return {
    productId: id,
    title,
    url: `https://www.aliexpress.com/item/${id}.html`,
    imageUrl: `https://example.com/${id}.jpg`,
    priceMinor,
    currency: "USD",
    rating,
    reviewCount: undefined,
    orderCount: 500,
    meta,
  };
}

describe("visual matching math", () => {
  it("requires the landed source cost to be below the eBay price", () => {
    expect(hasSourcingPriceAdvantage(521, 2664, 0)).toBe(false);
    expect(hasSourcingPriceAdvantage(3000, 2000, 500)).toBe(true);
    expect(hasSourcingPriceAdvantage(2500, 2000, 500)).toBe(false);
  });

  it("treats missing shipping as unknown rather than free", () => {
    expect(isKnownShippingCost(undefined)).toBe(false);
    expect(isKnownShippingCost(null)).toBe(false);
    expect(isKnownShippingCost(0)).toBe(true);
    expect(hasItemPriceBelowEbay(1899, 1066)).toBe(true);
    expect(hasItemPriceBelowEbay(1899, 2143)).toBe(false);
  });

  it("computes cosine similarity for identical vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("maps similarity into a 0–100 visual score", () => {
    expect(visualSimilarityToScore(1)).toBe(100);
    expect(visualSimilarityToScore(0.6)).toBe(60);
    expect(visualSimilarityToScore(0)).toBe(0);
    expect(visualSimilarityToScore(-1)).toBe(0);
  });

  it("weights visual evidence more heavily than text", () => {
    expect(
      combineTextAndVisualConfidence({
        textConfidence: 80,
        visualScore: 40,
        visualAvailable: true,
      }),
    ).toBe(56);
    expect(
      combineTextAndVisualConfidence({
        textConfidence: 80,
        visualAvailable: false,
      }),
    ).toBe(80);
  });
});

describe("visual re-ranking", () => {
  it("prefers a visually similar supplier over a stronger text-only match", () => {
    const ranked = rankAliExpressSources({
      ebay: {
        title: "Rechargeable Portable Blender Personal Mini Mixer Protein Shakes Juicer Cup USB",
        condition: "NEW",
        priceMinor: 1699,
      },
      candidates: [
        source("texty", "Portable USB Personal Mini Juicer Cup Handheld Travel Blender", 4.9, 800),
        source("visual", "Portable Electric Juice Maker Blender USB Rechargeable Fruit Mixer", 4.9, 900),
      ],
      searchKeyword: "portable blender",
      rules: DEFAULT_RULES,
    });

    const withVision = applyVisualScoresToRankedSources(
      ranked,
      [
        { productId: "texty", score: 35, similarity: -0.3, available: true },
        { productId: "visual", score: 88, similarity: 0.76, available: true },
      ],
      { ebayPriceMinor: 1699 },
    );

    expect(withVision[0]?.product.productId).toBe("visual");
    expect(withVision.some((entry) => entry.product.productId === "texty")).toBe(false);
  });

  it("drops candidates without visual evidence when visual matching is required", () => {
    const ranked = rankAliExpressSources({
      ebay: { title: "Portable Blender Smoothie Maker", condition: "NEW", priceMinor: 1699 },
      candidates: [source("unavailable", "Portable Blender Smoothie Maker USB", 4.9, 800)],
      searchKeyword: "portable blender",
      rules: DEFAULT_RULES,
    });

    const withRequiredVision = applyVisualScoresToRankedSources(
      ranked,
      [{ productId: "unavailable", score: 0, similarity: 0, available: false }],
      { ebayPriceMinor: 1699, requireVisual: true },
    );

    expect(withRequiredVision).toEqual([]);
  });
});
