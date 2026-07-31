import type { AliExpressProduct, AliExpressProductDetails, ProductSearchInput } from "@/lib/domain/types";

export interface AliExpressImageSearchInput {
  imageUrl: string;
  limit?: number;
  shipToCountry?: string;
  currency?: string;
}

export interface AliExpressSmartMatchInput {
  keywords?: string;
  productId?: string;
  limit?: number;
  shipToCountry?: string;
  currency?: string;
  deviceId?: string;
}

export interface AliExpressHotProductInput {
  keyword?: string;
  categoryIds?: string;
  limit?: number;
  shipToCountry?: string;
  currency?: string;
}

export interface AliExpressProvider {
  readonly name: string;
  searchProducts(input: ProductSearchInput): Promise<AliExpressProduct[]>;
  searchProductsByImage?(input: AliExpressImageSearchInput): Promise<AliExpressProduct[]>;
  searchSmartMatch?(input: AliExpressSmartMatchInput): Promise<AliExpressProduct[]>;
  searchHotProducts?(input: AliExpressHotProductInput): Promise<AliExpressProduct[]>;
  getProductDetails(urlOrId: string): Promise<AliExpressProductDetails>;
}

export interface EbayProvider {
  readonly name: string;
  searchProducts(input: ProductSearchInput): Promise<import("@/lib/domain/types").EbayListing[]>;
  getListingDetails(itemId: string): Promise<import("@/lib/domain/types").EbayListingDetails>;
  getMarketDemand(input: import("@/lib/domain/types").EbayDemandInput): Promise<import("@/lib/domain/types").EbayDemandResult>;
}

export interface SpreadsheetExporter {
  readonly name: string;
  exportCandidates(candidates: import("@/lib/export/types").ExportCandidateRow[]): Promise<import("@/lib/export/types").ExportResult>;
}

export interface BrowserSessionOptions {
  headless?: boolean;
  traceDir?: string;
}

export interface BrowserSession {
  id: string;
  close(): Promise<void>;
}

export interface BrowserProvider {
  createSession(options: BrowserSessionOptions): Promise<BrowserSession>;
  closeSession(sessionId: string): Promise<void>;
}
