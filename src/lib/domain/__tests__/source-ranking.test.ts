import { describe, expect, it } from "vitest";
import { rankAliExpressSources } from "@/lib/domain/source-ranking";
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
    priceMinor,
    currency: "USD",
    rating,
    reviewCount: undefined,
    orderCount: 500,
    meta,
  };
}

describe("rankAliExpressSources", () => {
  it("removes known low-quality suppliers before ranking matches", () => {
    const ranked = rankAliExpressSources({
      ebay: {
        title: "Rechargeable Portable Blender Personal Mini Mixer Protein Shakes Juicer Cup USB",
        condition: "NEW",
        priceMinor: 1399,
      },
      candidates: [
        source("low-rating", "Portable USB Personal Mini Juicer Cup Handheld Travel Blender", 3.7, 700),
        source("qualified", "Portable Electric Juice Maker Blender USB Rechargeable Fruit Mixer Juicer", 4.9, 900),
      ],
      searchKeyword: "portable blender",
      rules: DEFAULT_RULES,
    });

    expect(ranked.map((candidate) => candidate.product.productId)).toEqual(["qualified"]);
  });

  it("prefers a cheaper qualified source when product confidence is equal", () => {
    const title = "6 Blades Electric Juicer Cup Travel Portable Mixer USB Personal Blender Smoothie";
    const ranked = rankAliExpressSources({
      ebay: {
        title: "Rechargeable Portable Blender Personal Mini Mixer Protein Shakes Juicer Cup USB",
        condition: "NEW",
        priceMinor: 1399,
      },
      candidates: [source("expensive", title, 4.9, 1200), source("cheaper", title, 4.9, 800)],
      searchKeyword: "portable blender",
      rules: DEFAULT_RULES,
    });

    expect(ranked[0]?.product.productId).toBe("cheaper");
  });

  it("prefers over-door hanging traction over high-order pillows", () => {
    const ranked = rankAliExpressSources({
      ebay: {
        title: "Neck Traction Stretcher Cervical Head Brace Pain Relief Device Home Over Door",
        condition: "NEW",
        priceMinor: 1899,
      },
      candidates: [
        source(
          "pillow",
          "Neck Devices Neck Stretcher Orthopedic Traction Pillow Relief Neck Cervical Traction Pillow Portable Cervical Massage Pillow",
          4.9,
          563,
        ),
        source(
          "hanging",
          "Cervical Traction Device Over Door Hanging Home Use Neck Stretcher Belt Medical Orthosis Pain Relief Adjustable Portable Soft",
          4.8,
          1066,
        ),
      ],
      searchKeyword: "over door neck stretcher",
      rules: DEFAULT_RULES,
    });

    expect(ranked.map((entry) => entry.product.productId)).toEqual(["hanging"]);
    expect(ranked[0]?.match.reasons).toContain("form_factor_match");
  });
});
