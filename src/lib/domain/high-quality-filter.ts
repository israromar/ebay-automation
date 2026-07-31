/** Optional premium opportunity bar — high eBay price, cheap AE, high margin, high AE volume. */
export interface HighQualityFilterThresholds {
  minEbayPriceMinor: number;
  maxAeLandedCostRatio: number;
  minNetMarginPercent: number;
  minOrderCount: number;
}

export const DEFAULT_HIGH_QUALITY_THRESHOLDS: HighQualityFilterThresholds = {
  minEbayPriceMinor: 2500, // $25+
  maxAeLandedCostRatio: 0.5, // AE item+ship ≤ 50% of eBay
  minNetMarginPercent: 15,
  minOrderCount: 100,
};

export function resolveHighQualityThresholds(config?: {
  highQualityMinEbayPriceMinor?: number;
  highQualityMaxAeLandedCostRatio?: number;
  highQualityMinNetMarginPercent?: number;
  highQualityMinOrderCount?: number;
}): HighQualityFilterThresholds {
  return {
    minEbayPriceMinor: config?.highQualityMinEbayPriceMinor ?? DEFAULT_HIGH_QUALITY_THRESHOLDS.minEbayPriceMinor,
    maxAeLandedCostRatio: config?.highQualityMaxAeLandedCostRatio ?? DEFAULT_HIGH_QUALITY_THRESHOLDS.maxAeLandedCostRatio,
    minNetMarginPercent: config?.highQualityMinNetMarginPercent ?? DEFAULT_HIGH_QUALITY_THRESHOLDS.minNetMarginPercent,
    minOrderCount: config?.highQualityMinOrderCount ?? DEFAULT_HIGH_QUALITY_THRESHOLDS.minOrderCount,
  };
}

/** Tighten workspace minimums used during AE qualify / profit gates. */
export function withHighQualityRules<T extends { minimumNetMarginPercent: number; minimumOrderCount: number }>(
  rules: T,
  thresholds: HighQualityFilterThresholds = DEFAULT_HIGH_QUALITY_THRESHOLDS,
): T {
  return {
    ...rules,
    minimumNetMarginPercent: Math.max(rules.minimumNetMarginPercent, thresholds.minNetMarginPercent),
    minimumOrderCount: Math.max(rules.minimumOrderCount, thresholds.minOrderCount),
  };
}

export function aeLandedCostRatio(input: {
  ebayPriceMinor?: number | null;
  aliexpressPriceMinor?: number | null;
  aliexpressShippingMinor?: number | null;
}): number | null {
  const ebay = input.ebayPriceMinor;
  const ae = input.aliexpressPriceMinor;
  if (typeof ebay !== "number" || ebay <= 0 || typeof ae !== "number" || ae < 0) return null;
  const ship = typeof input.aliexpressShippingMinor === "number" && input.aliexpressShippingMinor >= 0 ? input.aliexpressShippingMinor : 0;
  return (ae + ship) / ebay;
}

/**
 * Soft premium gate. Returns empty when passing; otherwise rejection reason codes.
 * AE orderCount is the availability / volume proxy (official API has no stock field).
 */
export function evaluateHighQualityFilter(
  input: {
    ebayCurrentPriceMinor?: number | null;
    aliexpressPriceMinor?: number | null;
    aliexpressShippingMinor?: number | null;
    netMarginPercent?: number | null;
    orderCount?: number | null;
  },
  thresholds: HighQualityFilterThresholds,
): string[] {
  const reasons: string[] = [];
  const ebay = input.ebayCurrentPriceMinor;
  if (typeof ebay !== "number" || ebay < thresholds.minEbayPriceMinor) {
    reasons.push("HIGH_QUALITY_EBAY_PRICE_TOO_LOW");
  }

  const ratio = aeLandedCostRatio({
    ebayPriceMinor: input.ebayCurrentPriceMinor,
    aliexpressPriceMinor: input.aliexpressPriceMinor,
    aliexpressShippingMinor: input.aliexpressShippingMinor,
  });
  if (ratio == null || ratio > thresholds.maxAeLandedCostRatio) {
    reasons.push("HIGH_QUALITY_SOURCE_COST_RATIO_HIGH");
  }

  const margin = input.netMarginPercent;
  if (typeof margin !== "number" || margin < thresholds.minNetMarginPercent) {
    reasons.push("HIGH_QUALITY_MARGIN_TOO_LOW");
  }

  const orders = input.orderCount;
  if (typeof orders !== "number" || orders < thresholds.minOrderCount) {
    reasons.push("HIGH_QUALITY_AE_VOLUME_TOO_LOW");
  }

  return reasons;
}
