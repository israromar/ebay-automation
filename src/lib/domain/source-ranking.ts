import { scoreAliExpressSourceMatch, type MatchAttributes, type MatchResult } from "./matching";
import { qualifyAliExpressProduct, type QualificationResult } from "./qualification";
import type { AliExpressProduct, QualificationRules } from "./types";
import { combineTextAndVisualConfidence, DEFAULT_VISUAL_MATCH_FLOOR } from "./visual-matching";

export interface RankedAliExpressSource {
  product: AliExpressProduct;
  match: MatchResult;
  qualification: QualificationResult;
  rankScore: number;
  visualScore?: number;
  visualSimilarity?: number;
  visualAvailable?: boolean;
  combinedConfidence?: number;
}

interface RankAliExpressSourcesInput {
  ebay: MatchAttributes;
  candidates: AliExpressProduct[];
  searchKeyword: string;
  rules: QualificationRules;
}

export interface VisualScoreInput {
  productId: string;
  score: number;
  similarity: number;
  available: boolean;
}

export function hasSourcingPriceAdvantage(ebayPriceMinor: number, sourcePriceMinor: number, sourceShippingMinor = 0): boolean {
  return sourcePriceMinor + sourceShippingMinor < ebayPriceMinor;
}

function supplierQualityScore(product: AliExpressProduct): number {
  const rating = ((product.rating ?? 0) / 5) * 15;
  const orders = Math.min(Math.log10((product.orderCount ?? 0) + 1) / 3, 1) * 10;
  const reviews = Math.min((product.reviewCount ?? 0) / 100, 1) * 5;
  return rating + orders + reviews;
}

function sourcingPriceScore(ebayPriceMinor: number | undefined, sourcePriceMinor: number): number {
  if (!ebayPriceMinor || ebayPriceMinor <= 0) return 0;
  const discount = (ebayPriceMinor - sourcePriceMinor) / ebayPriceMinor;
  return Math.max(0, Math.min(discount, 1)) * 10;
}

export function rankAliExpressSources(input: RankAliExpressSourcesInput): RankedAliExpressSource[] {
  const softMatchFloor = Math.min(35, input.rules.minimumMatchConfidence);

  return input.candidates
    .map((product): RankedAliExpressSource => {
      const match = scoreAliExpressSourceMatch(input.ebay, { title: product.title, condition: "NEW", priceMinor: product.priceMinor }, input.searchKeyword);
      const qualification = qualifyAliExpressProduct(product, input.rules);
      const rankScore = match.confidence * 0.65 + supplierQualityScore(product) + sourcingPriceScore(input.ebay.priceMinor, product.priceMinor);
      return { product, match, qualification, rankScore };
    })
    .filter(({ match, qualification }) => !match.hardReject && match.confidence >= softMatchFloor && qualification.reasons.length === 0)
    .sort((a, b) => b.rankScore - a.rankScore);
}

/**
 * Re-rank a text shortlist with DINOv2 visual scores.
 * Drops candidates with available visual evidence below the floor.
 */
export function applyVisualScoresToRankedSources(ranked: RankedAliExpressSource[], visuals: VisualScoreInput[], options?: { visualFloor?: number; ebayPriceMinor?: number; requireVisual?: boolean }): RankedAliExpressSource[] {
  const visualFloor = options?.visualFloor ?? DEFAULT_VISUAL_MATCH_FLOOR;
  const byId = new Map(visuals.map((v) => [v.productId, v]));

  return ranked
    .map((entry) => {
      const visual = byId.get(entry.product.productId);
      const visualAvailable = Boolean(visual?.available);
      const visualScore = visualAvailable ? visual?.score : undefined;
      const combinedConfidence = combineTextAndVisualConfidence({
        textConfidence: entry.match.confidence,
        visualScore,
        visualAvailable,
      });
      const rankScore = combinedConfidence * 0.65 + supplierQualityScore(entry.product) + sourcingPriceScore(options?.ebayPriceMinor, entry.product.priceMinor) + (visualAvailable ? (visualScore ?? 0) * 0.15 : 0);

      return {
        ...entry,
        visualScore,
        visualSimilarity: visual?.similarity,
        visualAvailable,
        combinedConfidence,
        rankScore,
      };
    })
    .filter((entry) => {
      if (!entry.visualAvailable || entry.visualScore == null) return options?.requireVisual !== true;
      return entry.visualScore >= visualFloor;
    })
    .sort((a, b) => b.rankScore - a.rankScore);
}
