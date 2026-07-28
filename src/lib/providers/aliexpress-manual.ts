import type {
  AliExpressProduct,
  AliExpressProductDetails,
  ProductSearchInput,
} from "@/lib/domain/types";
import type { AliExpressProvider } from "./types";

/** Fixture / CSV-style provider for PoC without Affiliate API credentials. */
export class AliExpressManualImportProvider implements AliExpressProvider {
  readonly name = "AliExpressManualImportProvider";

  constructor(private readonly products: AliExpressProduct[] = []) {}

  async searchProducts(input: ProductSearchInput): Promise<AliExpressProduct[]> {
    const tokens = input.keyword
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2);
    const filtered = this.products.filter((p) => {
      const title = p.title.toLowerCase();
      return tokens.length === 0
        ? true
        : tokens.every((t) => title.includes(t)) || title.includes(input.keyword.toLowerCase());
    });
    // Prefer products that match the keyword; fall back to catalog slice for demos
    const pool = filtered.length > 0 ? filtered : this.products;
    return pool.slice(0, input.limit ?? 5);
  }

  async getProductDetails(urlOrId: string): Promise<AliExpressProductDetails> {
    const found = this.products.find(
      (p) => p.productId === urlOrId || p.url === urlOrId || p.url?.includes(urlOrId),
    );
    if (!found) {
      throw new Error(`AliExpress product not found: ${urlOrId}`);
    }
    return found;
  }
}

export function sampleAliExpressCatalog(): AliExpressProduct[] {
  const now = new Date().toISOString();
  const meta = {
    source: "manual_fixture",
    confidence: 0.9,
    collectedAt: now,
    completeness: "full" as const,
    warnings: [] as string[],
  };
  return [
    {
      productId: "1005001",
      title: "Portable Rechargeable Blender USB Mini Smoothie Maker",
      url: "https://www.aliexpress.com/item/1005001.html",
      imageUrl: "https://via.placeholder.com/200",
      priceMinor: 899,
      shippingMinor: 0,
      currency: "USD",
      rating: 4.8,
      reviewCount: 342,
      orderCount: 1200,
      meta,
    },
    {
      productId: "1005002",
      title: "Portable Blender Bottle 6 Blades Rechargeable",
      url: "https://www.aliexpress.com/item/1005002.html",
      imageUrl: "https://via.placeholder.com/200",
      priceMinor: 1099,
      shippingMinor: 199,
      currency: "USD",
      rating: 4.7,
      reviewCount: 88,
      orderCount: 210,
      meta,
    },
    {
      productId: "1005003",
      title: "Mini USB Juicer Cup Portable Blender",
      url: "https://www.aliexpress.com/item/1005003.html",
      imageUrl: "https://via.placeholder.com/200",
      priceMinor: 799,
      shippingMinor: 0,
      currency: "USD",
      rating: 4.9,
      reviewCount: 50,
      orderCount: 95,
      meta,
    },
    {
      productId: "1005004",
      title: "Wireless Earbuds Bluetooth 5.3",
      url: "https://www.aliexpress.com/item/1005004.html",
      priceMinor: 1299,
      shippingMinor: 0,
      currency: "USD",
      rating: 4.6,
      reviewCount: 15,
      orderCount: 40,
      meta: { ...meta, warnings: ["fails qualification fixtures"] },
    },
    {
      productId: "1005005",
      title: "Portable Rechargeable Personal Blender 400ml",
      url: "https://www.aliexpress.com/item/1005005.html",
      priceMinor: 1499,
      shippingMinor: 299,
      currency: "USD",
      rating: 4.85,
      reviewCount: 600,
      orderCount: 3500,
      meta,
    },
  ];
}
