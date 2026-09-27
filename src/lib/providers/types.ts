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
