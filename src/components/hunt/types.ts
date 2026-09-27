export type DemandTier = "ESTIMATED" | "PROJECTED" | "VERIFIED";

export interface SourceMatch {
  id: string;
  rank: number;
  aeProductId: string;
  title: string;
  url: string;
  imageUrl: string | null;
  priceMinor: number;
  shippingMinor: number;
  shippingEstimated: boolean;
  rating: number;
  reviewCount: number;
  orderCount: number;
  matchConfidence: number;
  matchReasonsJson: string;
  totalCostMinor: number;
  feesMinor: number;
  netProfitMinor: number;
  marginPct: number;
  checkedAt: string;
}

export interface ListingRow {
  id: string;
  ebayItemId: string;
  title: string;
  url: string;
  imageUrl: string | null;
  priceMinor: number;
  shippingMinor: number | null;
  keyword: string;
  sold30d: number | null;
  lifetimeSold: number | null;
  demandTier: DemandTier;
  demandSource: "browse_tracker" | "terapeak" | "purchase_history";
  purchaseHistoryAt?: string | null;
  purchaseHistoryStatus?: string | null;
  avgSoldPriceMinor: number | null;
  active: boolean;
  endedReason: string | null;
  sourcedAt: string | null;
  sourceError: string | null;
  lastSnapshotAt: string | null;
  itemCreationDate: string | null;
  createdAt: string;
  bestSource: SourceMatch | null;
  sourceCount: number;
  snapshotCount: number;
}

export interface Hunt {
  id: string;
  kind: "KEYWORDS" | "TERAPEAK";
  label: string;
  keywords: string[];
  totalItems: number;
  cursor: number;
  status: "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  scannedCount: number;
  trackedCount: number;
  sourcedCount: number;
  winnerCount: number;
  error: string | null;
  log: Array<{ at: string; message: string }>;
  startedAt: string;
  finishedAt: string | null;
}
