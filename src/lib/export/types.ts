export interface ExportCandidateRow {
  timestamp: string;
  scanId: string;
  searchKeyword: string;
  productName: string;
  productImage: string;
  aliexpressUrl: string;
  aliexpressProductId: string;
  aliexpressPrice: string;
  aliexpressShipping: string;
  adjustedSourceCost: string;
  rating: string;
  reviewCount: string;
  orderCount: string;
  ebayUrl: string;
  ebayItemId: string;
  ebayCurrentPrice: string;
  averageCompletedSalePrice: string;
  soldLast30Days: string;
  activeListingCount: string;
  matchConfidence: string;
  estimatedMarketplaceFees: string;
  estimatedTotalCost: string;
  estimatedProfit: string;
  netMarginPercent: string;
  returnOnCostPercent: string;
  status: string;
  rejectionReason: string;
  lastVerifiedTimestamp: string;
  dataSource: string;
  fingerprint: string;
}

export interface ExportResult {
  success: boolean;
  destination: string;
  rowRange?: string;
  spreadsheetId?: string;
  error?: string;
  exportedCount: number;
}

export const EXPORT_HEADERS: (keyof ExportCandidateRow)[] = [
  "timestamp",
  "scanId",
  "searchKeyword",
  "productName",
  "productImage",
  "aliexpressUrl",
  "aliexpressProductId",
  "aliexpressPrice",
  "aliexpressShipping",
  "adjustedSourceCost",
  "rating",
  "reviewCount",
  "orderCount",
  "ebayUrl",
  "ebayItemId",
  "ebayCurrentPrice",
  "averageCompletedSalePrice",
  "soldLast30Days",
  "activeListingCount",
  "matchConfidence",
  "estimatedMarketplaceFees",
  "estimatedTotalCost",
  "estimatedProfit",
  "netMarginPercent",
  "returnOnCostPercent",
  "status",
  "rejectionReason",
  "lastVerifiedTimestamp",
  "dataSource",
  "fingerprint",
];
