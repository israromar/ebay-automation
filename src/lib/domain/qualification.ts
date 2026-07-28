import type { AliExpressProduct, QualificationRules, RejectionCode } from "./types";

export interface QualificationResult {
  passed: boolean;
  reasons: RejectionCode[];
}

export function qualifyAliExpressProduct(
  product: Pick<AliExpressProduct, "rating" | "reviewCount" | "orderCount">,
  rules: Pick<
    QualificationRules,
    "minimumRating" | "minimumReviewCount" | "minimumOrderCount"
  >,
): QualificationResult {
  const reasons: RejectionCode[] = [];

  if (product.rating == null || product.rating < rules.minimumRating) {
    reasons.push("ALIEXPRESS_RATING_TOO_LOW");
  }
  if (product.reviewCount == null || product.reviewCount < rules.minimumReviewCount) {
    reasons.push("ALIEXPRESS_REVIEWS_TOO_LOW");
  }
  if (product.orderCount == null || product.orderCount < rules.minimumOrderCount) {
    reasons.push("ALIEXPRESS_ORDERS_TOO_LOW");
  }

  return { passed: reasons.length === 0, reasons };
}
