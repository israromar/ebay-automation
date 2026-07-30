/** Candidate lifecycle statuses */
export const CANDIDATE_STATUSES = [
  "DISCOVERED",
  "COLLECTING",
  "ALIEXPRESS_REJECTED",
  "EBAY_MATCH_REQUIRED",
  "EBAY_MATCHED",
  "DEMAND_NOT_VERIFIED",
  "NEEDS_MANUAL_VALIDATION",
  "UNPROFITABLE",
  "APPROVED",
  "EXPORT_PENDING",
  "EXPORTED",
  "DATA_SOURCE_FAILED",
] as const;

export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export const REJECTION_CODES = [
  "ALIEXPRESS_RATING_TOO_LOW",
  "ALIEXPRESS_REVIEWS_TOO_LOW",
  "ALIEXPRESS_ORDERS_TOO_LOW",
  "EBAY_RECENT_SALES_TOO_LOW",
  "EBAY_SOLD_HISTORY_UNAVAILABLE",
  "MATCH_CONFIDENCE_TOO_LOW",
  "NO_QUALIFIED_ALIEXPRESS_SOURCE",
  "SOURCE_PRICE_NOT_BELOW_EBAY",
  "VISUAL_MATCH_TOO_LOW",
  "VISUAL_MATCH_UNAVAILABLE",
  "MARGIN_TOO_LOW",
  "MISSING_SHIPPING_COST",
  "STALE_DATA",
  "MANUAL_INTERVENTION_REQUIRED",
] as const;

export type RejectionCode = (typeof REJECTION_CODES)[number];

export interface MoneyMinor {
  amountMinor: number;
  currency: string;
}

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
  shippingMinor?: number;
  currency: string;
  rating?: number;
  reviewCount?: number;
  orderCount?: number;
  variants?: Array<{ skuId?: string; name: string; priceMinor: number; attrs?: Record<string, string> }>;
  meta: ProviderMeta;
}

export type AliExpressProductDetails = AliExpressProduct;

export interface EbayListing {
  itemId: string;
  title: string;
  url: string;
  imageUrl?: string;
  priceMinor: number;
  shippingMinor?: number;
  currency: string;
  condition?: string;
  sellerUsername?: string;
  sellerLocation?: string;
  categoryId?: string;
  brand?: string;
  model?: string;
  meta: ProviderMeta;
}

export type EbayListingDetails = EbayListing;

export interface EbayDemandInput {
  keyword?: string;
  itemId?: string;
  categoryId?: string;
}

export interface EbayDemandResult {
  available: boolean;
  soldLast30Days?: number;
  avgCompletedSaleMinor?: number;
  medianCompletedSaleMinor?: number;
  totalHistoricalSold?: number;
  source: string;
  meta: ProviderMeta;
  reasonCode?: RejectionCode;
}

export interface QualificationRules {
  minimumRating: number;
  preferredRating: number;
  idealRating: number;
  minimumReviewCount: number;
  preferredReviewCount: number;
  minimumOrderCount: number;
  preferredOrderCount: number;
  minimumRecentSales: number;
  minimumMatchConfidence: number;
  minimumNetMarginPercent: number;
  preferredNetMarginPercent: number;
  additionalSourcingCostMinor: number;
  ebayFeeRate: number;
  promotedListingRate: number;
  expectedReturnCostMinor: number;
  expectedRefundCostMinor: number;
  otherFixedCostsMinor: number;
  otherPercentageCost: number;
}

export const DEFAULT_RULES: QualificationRules = {
  minimumRating: 4.7,
  preferredRating: 4.8,
  idealRating: 4.9,
  minimumReviewCount: 20,
  preferredReviewCount: 30,
  minimumOrderCount: 50,
  preferredOrderCount: 100,
  minimumRecentSales: 5,
  minimumMatchConfidence: 70,
  minimumNetMarginPercent: 10,
  preferredNetMarginPercent: 15,
  additionalSourcingCostMinor: 199,
  ebayFeeRate: 0.1325,
  promotedListingRate: 0,
  expectedReturnCostMinor: 0,
  expectedRefundCostMinor: 0,
  otherFixedCostsMinor: 0,
  otherPercentageCost: 0,
};

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
