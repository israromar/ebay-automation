export type TrendIdeaMatchStatus = "AE_MATCHED" | "REJECTED";

interface TrendMatchCandidate {
  aliexpressProductId?: string | null;
  matchConfidence?: number | null;
  candidateStatus: string;
  rejectionReasonsJson?: string | null;
  minimumMatchConfidence: number;
}

const BLOCKING_AE_MATCH_REASONS = new Set([
  "ALIEXPRESS_RATING_TOO_LOW",
  "ALIEXPRESS_REVIEWS_TOO_LOW",
  "ALIEXPRESS_ORDERS_TOO_LOW",
  "MATCH_CONFIDENCE_TOO_LOW",
  "NO_QUALIFIED_ALIEXPRESS_SOURCE",
  "SOURCE_PRICE_NOT_BELOW_EBAY",
  "MARGIN_TOO_LOW",
  "VISUAL_MATCH_TOO_LOW",
  "VISUAL_MATCH_UNAVAILABLE",
  "BELOW_HIGH_QUALITY_BAR",
  "HIGH_QUALITY_EBAY_PRICE_TOO_LOW",
  "HIGH_QUALITY_SOURCE_COST_RATIO_HIGH",
  "HIGH_QUALITY_MARGIN_TOO_LOW",
  "HIGH_QUALITY_AE_VOLUME_TOO_LOW",
]);

function parseRejectionReasons(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((reason): reason is string => typeof reason === "string") : [];
  } catch {
    return [];
  }
}

export function deriveTrendIdeaMatchStatus(candidate: TrendMatchCandidate): TrendIdeaMatchStatus {
  if (!candidate.aliexpressProductId || candidate.candidateStatus === "ALIEXPRESS_REJECTED") return "REJECTED";
  if ((candidate.matchConfidence ?? 0) < candidate.minimumMatchConfidence) return "REJECTED";
  const rejectionReasons = parseRejectionReasons(candidate.rejectionReasonsJson);
  return rejectionReasons.some((reason) => BLOCKING_AE_MATCH_REASONS.has(reason)) ? "REJECTED" : "AE_MATCHED";
}
