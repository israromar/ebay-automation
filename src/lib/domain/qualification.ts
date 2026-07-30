import type { AliExpressProduct, QualificationRules, RejectionCode } from "./types";

export interface QualificationResult {
  passed: boolean;
  reasons: RejectionCode[];
  missingFields: Array<"rating" | "reviewCount" | "orderCount">;
}

export function qualifyAliExpressProduct(
  product: Pick<AliExpressProduct, "rating" | "reviewCount" | "orderCount">,
  rules: Pick<QualificationRules, "minimumRating" | "minimumReviewCount" | "minimumOrderCount">,
): QualificationResult {
  const reasons: RejectionCode[] = [];
  const missingFields: Array<"rating" | "reviewCount" | "orderCount"> = [];

  if (product.rating == null) {
    missingFields.push("rating");
  } else if (product.rating < rules.minimumRating) {
    reasons.push("ALIEXPRESS_RATING_TOO_LOW");
  }

  if (product.reviewCount == null) {
    missingFields.push("reviewCount");
  } else if (product.reviewCount < rules.minimumReviewCount) {
    reasons.push("ALIEXPRESS_REVIEWS_TOO_LOW");
  }

  if (product.orderCount == null) {
    missingFields.push("orderCount");
  } else if (product.orderCount < rules.minimumOrderCount) {
    reasons.push("ALIEXPRESS_ORDERS_TOO_LOW");
  }

  // Hard fail only on known-below-threshold values.
  // Missing API fields are incomplete data, not a quality fail.
  return {
    passed: reasons.length === 0 && missingFields.length === 0,
    reasons,
    missingFields,
  };
}
