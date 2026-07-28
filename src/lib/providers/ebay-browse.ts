import type {
  EbayDemandInput,
  EbayDemandResult,
  EbayListing,
  EbayListingDetails,
  ProductSearchInput,
} from "@/lib/domain/types";
import type { EbayProvider } from "./types";

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

/**
 * eBay Browse API provider for active listings.
 * Demand (sold history) returns unavailable unless Insights is wired separately.
 */
export class EbayBrowseApiProvider implements EbayProvider {
  readonly name = "EbayBrowseApiProvider";
  private tokenCache: TokenCache | null = null;

  constructor(
    private readonly config: {
      clientId: string;
      clientSecret: string;
      marketplaceId?: string;
      baseUrl?: string;
    },
  ) {}

  private get marketplaceId() {
    return this.config.marketplaceId ?? "EBAY_US";
  }

  private get baseUrl() {
    return this.config.baseUrl ?? "https://api.ebay.com";
  }

  private get hasCredentials() {
    return Boolean(this.config.clientId && this.config.clientSecret);
  }

  async searchProducts(input: ProductSearchInput): Promise<EbayListing[]> {
    if (!this.hasCredentials) {
      return this.fixtureSearch(input);
    }
    const token = await this.getAppToken();
    const limit = Math.min(input.limit ?? 10, 50);
    const url = new URL(`${this.baseUrl}/buy/browse/v1/item_summary/search`);
    url.searchParams.set("q", input.keyword);
    url.searchParams.set("limit", String(limit));

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-EBAY-C-MARKETPLACE-ID": this.marketplaceId,
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Browse search failed: ${res.status} ${body}`);
    }
    const data = (await res.json()) as {
      itemSummaries?: Array<{
        itemId: string;
        title: string;
        itemWebUrl?: string;
        image?: { imageUrl?: string };
        price?: { value?: string; currency?: string };
        shippingOptions?: Array<{ shippingCost?: { value?: string } }>;
        condition?: string;
        seller?: { username?: string };
        itemLocation?: { country?: string };
        categories?: Array<{ categoryId?: string }>;
      }>;
    };
    const now = new Date().toISOString();
    return (data.itemSummaries ?? []).map((item) => ({
      itemId: item.itemId,
      title: item.title,
      url: item.itemWebUrl ?? `https://www.ebay.com/itm/${item.itemId}`,
      imageUrl: item.image?.imageUrl,
      priceMinor: Math.round(Number(item.price?.value ?? 0) * 100),
      shippingMinor: item.shippingOptions?.[0]?.shippingCost?.value
        ? Math.round(Number(item.shippingOptions[0].shippingCost.value) * 100)
        : undefined,
      currency: item.price?.currency ?? "USD",
      condition: item.condition,
      sellerUsername: item.seller?.username,
      sellerLocation: item.itemLocation?.country,
      categoryId: item.categories?.[0]?.categoryId,
      meta: {
        source: this.name,
        confidence: 0.95,
        collectedAt: now,
        completeness: "partial" as const,
        warnings: [],
        rawRecordRef: item.itemId,
      },
    }));
  }

  async getListingDetails(itemId: string): Promise<EbayListingDetails> {
    if (!this.hasCredentials) {
      const list = await this.fixtureSearch({ keyword: itemId, limit: 1 });
      if (!list[0]) throw new Error(`Fixture listing not found: ${itemId}`);
      return list[0];
    }
    const token = await this.getAppToken();
    const res = await fetch(`${this.baseUrl}/buy/browse/v1/item/${encodeURIComponent(itemId)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": this.marketplaceId,
      },
    });
    if (!res.ok) {
      throw new Error(`getItem failed: ${res.status} ${await res.text()}`);
    }
    const item = (await res.json()) as {
      itemId: string;
      title: string;
      itemWebUrl?: string;
      image?: { imageUrl?: string };
      price?: { value?: string; currency?: string };
      shippingOptions?: Array<{ shippingCost?: { value?: string } }>;
      condition?: string;
      seller?: { username?: string };
      itemLocation?: { country?: string };
      categoryPath?: string;
      categoryId?: string;
    };
    const now = new Date().toISOString();
    return {
      itemId: item.itemId,
      title: item.title,
      url: item.itemWebUrl ?? `https://www.ebay.com/itm/${item.itemId}`,
      imageUrl: item.image?.imageUrl,
      priceMinor: Math.round(Number(item.price?.value ?? 0) * 100),
      shippingMinor: item.shippingOptions?.[0]?.shippingCost?.value
        ? Math.round(Number(item.shippingOptions[0].shippingCost.value) * 100)
        : undefined,
      currency: item.price?.currency ?? "USD",
      condition: item.condition,
      sellerUsername: item.seller?.username,
      sellerLocation: item.itemLocation?.country,
      categoryId: item.categoryId,
      meta: {
        source: this.name,
        confidence: 0.98,
        collectedAt: now,
        completeness: "full",
        warnings: [],
        rawRecordRef: item.itemId,
      },
    };
  }

  async getMarketDemand(input: EbayDemandInput): Promise<EbayDemandResult> {
    void input;
    const now = new Date().toISOString();
    // Marketplace Insights is limited-release; Browse cannot supply sold history.
    return {
      available: false,
      source: "EbayBrowseApiProvider",
      reasonCode: "EBAY_SOLD_HISTORY_UNAVAILABLE",
      meta: {
        source: this.name,
        confidence: 0,
        collectedAt: now,
        completeness: "minimal",
        warnings: [
          "Sold history requires Marketplace Insights (limited release) or manual/licensed source",
        ],
      },
    };
  }

  private async getAppToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 60_000) {
      return this.tokenCache.accessToken;
    }
    const basic = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`,
    ).toString("base64");
    const res = await fetch(`${this.baseUrl}/identity/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
    });
    if (!res.ok) {
      throw new Error(`eBay token failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.tokenCache = {
      accessToken: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    return data.access_token;
  }

  private fixtureSearch(input: ProductSearchInput): EbayListing[] {
    const now = new Date().toISOString();
    const fixtures: EbayListing[] = [
      {
        itemId: "v1|1100001|0",
        title: "Portable Rechargeable Blender USB Mini Smoothie Maker New",
        url: "https://www.ebay.com/itm/1100001",
        imageUrl: "https://via.placeholder.com/200",
        priceMinor: 2499,
        shippingMinor: 0,
        currency: "USD",
        condition: "NEW",
        sellerUsername: "fixture_seller",
        sellerLocation: "US",
        categoryId: "20667",
        meta: {
          source: "ebay_fixture",
          confidence: 0.8,
          collectedAt: now,
          completeness: "partial",
          warnings: ["Using fixture data — set EBAY_CLIENT_ID/SECRET for live Browse API"],
        },
      },
      {
        itemId: "v1|1100002|0",
        title: "Portable Blender Bottle 6 Blades Rechargeable Personal",
        url: "https://www.ebay.com/itm/1100002",
        priceMinor: 2799,
        shippingMinor: 399,
        currency: "USD",
        condition: "NEW",
        sellerUsername: "fixture_seller2",
        categoryId: "20667",
        meta: {
          source: "ebay_fixture",
          confidence: 0.8,
          collectedAt: now,
          completeness: "partial",
          warnings: ["fixture"],
        },
      },
      {
        itemId: "v1|1100005|0",
        title: "Portable Rechargeable Personal Blender 400ml USB",
        url: "https://www.ebay.com/itm/1100005",
        priceMinor: 3299,
        shippingMinor: 0,
        currency: "USD",
        condition: "NEW",
        sellerUsername: "fixture_seller5",
        categoryId: "20667",
        meta: {
          source: "ebay_fixture",
          confidence: 0.8,
          collectedAt: now,
          completeness: "partial",
          warnings: ["fixture"],
        },
      },
      {
        itemId: "v1|1100003|0",
        title: "Used Portable Blender Replacement Blade Only",
        url: "https://www.ebay.com/itm/1100003",
        priceMinor: 599,
        currency: "USD",
        condition: "USED",
        sellerUsername: "fixture_seller3",
        meta: {
          source: "ebay_fixture",
          confidence: 0.5,
          collectedAt: now,
          completeness: "partial",
          warnings: ["likely mismatch"],
        },
      },
    ];
    const tokens = input.keyword.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    return fixtures
      .filter((f) => {
        const title = f.title.toLowerCase();
        return tokens.some((t) => title.includes(t)) || title.includes("blender");
      })
      .slice(0, input.limit ?? 10);
  }
}

/** Manual demand entry — the MVP-approved path when Insights is unavailable. */
export class EbayManualDemandProvider {
  readonly name = "EbayManualDemandProvider";

  toDemandResult(observation: {
    soldLast30Days: number;
    avgCompletedSaleMinor?: number;
    medianCompletedSaleMinor?: number;
    totalHistoricalSold?: number;
    evidenceUrl?: string;
    verifiedBy?: string;
  }): EbayDemandResult {
    const now = new Date().toISOString();
    return {
      available: true,
      soldLast30Days: observation.soldLast30Days,
      avgCompletedSaleMinor: observation.avgCompletedSaleMinor,
      medianCompletedSaleMinor: observation.medianCompletedSaleMinor,
      totalHistoricalSold: observation.totalHistoricalSold,
      source: this.name,
      meta: {
        source: this.name,
        confidence: 1,
        collectedAt: now,
        completeness: "partial",
        warnings: observation.evidenceUrl ? [] : ["No evidence URL provided"],
        rawRecordRef: observation.evidenceUrl,
      },
    };
  }
}
