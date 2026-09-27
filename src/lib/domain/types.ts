export interface ProviderMeta {
  source: string;
  confidence: number;
  collectedAt: string;
  completeness: "full" | "partial" | "minimal";
  warnings: string[];
  rawRecordRef?: string;
}

export interface ProductSearchInput {
  keyword: string;
  limit?: number;
  shipToCountry?: string;
  currency?: string;
}

export interface AliExpressProduct {
  productId: string;
  title: string;
  url: string;
  imageUrl?: string;
  priceMinor: number;
  /** Undefined when the Affiliate API did not return shipping (the common case). */
  shippingMinor?: number;
  currency: string;
  /** 0–5 stars. The Affiliate API returns `evaluate_rate` (% positive); mapped as % ÷ 20. */
  rating?: number;
  reviewCount?: number;
  orderCount?: number;
  meta: ProviderMeta;
}

export type AliExpressProductDetails = AliExpressProduct;

export interface ProfitInput {
  aliexpressItemPriceMinor: number;
  aliexpressShippingCostMinor: number;
  additionalSourcingCostMinor: number;
  expectedSellingPriceMinor: number;
  buyerShippingRevenueMinor?: number;
  ebayFeeRate: number;
  promotedListingRate: number;
  expectedReturnCostMinor: number;
  expectedRefundCostMinor: number;
  otherFixedCostsMinor: number;
  otherPercentageCost?: number;
}

export interface ProfitResult {
  adjustedSourceCostMinor: number;
  grossRevenueMinor: number;
  marketplaceFeesMinor: number;
  promotedListingFeeMinor: number;
  totalEstimatedCostMinor: number;
  estimatedProfitMinor: number;
  profitMarginPercent: number;
  returnOnCostPercent: number;
  grossMarginPercent: number;
}
