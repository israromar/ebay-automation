import { describe, expect, it } from "vitest";
import { US_TRENDING_KEYWORD_CATALOG, listCatalogNiches } from "@/lib/research/us-trending-keywords";

describe("US trending keyword catalog", () => {
  it("contains exactly 50 unique ranked keywords", () => {
    const { keywords } = US_TRENDING_KEYWORD_CATALOG;
    expect(keywords).toHaveLength(50);

    const ranks = keywords.map((entry) => entry.rank).sort((a, b) => a - b);
    expect(ranks).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));

    const normalized = keywords.map((entry) => entry.keyword.trim().toLowerCase());
    expect(new Set(normalized).size).toBe(50);
  });

  it("covers the planned niches and includes dated source evidence", () => {
    expect(US_TRENDING_KEYWORD_CATALOG.market).toBe("US");
    expect(US_TRENDING_KEYWORD_CATALOG.researchedAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(US_TRENDING_KEYWORD_CATALOG.sources.length).toBeGreaterThan(0);
    expect(listCatalogNiches().length).toBeGreaterThanOrEqual(8);

    for (const entry of US_TRENDING_KEYWORD_CATALOG.keywords) {
      expect(entry.keyword.length).toBeGreaterThan(2);
      expect(entry.sources.length).toBeGreaterThan(0);
      expect(entry.why.length).toBeGreaterThan(10);
    }
  });
});
