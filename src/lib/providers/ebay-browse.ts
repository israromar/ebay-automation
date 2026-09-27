import { legacyItemId } from "@/lib/domain/ebay-ids";

/**
 * eBay Browse API (official, public). Used for two things only:
 *  1. keyword search of active fixed-price listings
 *  2. batched getItems to read `estimatedSoldQuantity` (lifetime units sold) + `itemCreationDate`
 *     for the daily sold-snapshot tracker.
 */

export interface EbaySearchInput {
  keyword: string;
  /** Total results wanted (paged 200 at a time; Browse caps offset+limit at 10,000). */
  limit?: number;
  minPriceMinor?: number;
  maxPriceMinor?: number;
}

export interface EbaySearchResult {
  itemId: string;
  legacyItemId: string;
  title: string;
  url: string;
  imageUrl?: string;
  priceMinor: number;
  shippingMinor?: number;
  currency: string;
}

export interface EbayItemDetails extends EbaySearchResult {
  estimatedSoldQuantity: number | null;
  itemCreationDate: Date | null;
  itemEndDate: Date | null;
  outOfStock: boolean;
}

interface BrowseItem {
  itemId: string;
  legacyItemId?: string;
  title: string;
  itemWebUrl?: string;
  image?: { imageUrl?: string };
  price?: { value?: string; currency?: string };
  shippingOptions?: Array<{ shippingCost?: { value?: string } }>;
  itemCreationDate?: string;
  itemEndDate?: string;
  estimatedAvailabilities?: Array<{ estimatedSoldQuantity?: number; estimatedAvailabilityStatus?: string }>;
}

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

export class EbayConfigError extends Error {}

const PAGE_SIZE = 200;
export const GET_ITEMS_BATCH = 20;

function toMinor(value?: string): number | undefined {
  if (value == null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : undefined;
}

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function mapSummary(item: BrowseItem): EbaySearchResult {
  const legacy = item.legacyItemId ?? legacyItemId(item.itemId);
  return {
    itemId: item.itemId,
    legacyItemId: legacy,
    title: item.title,
    url: item.itemWebUrl?.split("?")[0] ?? `https://www.ebay.com/itm/${legacy}`,
    imageUrl: item.image?.imageUrl,
    priceMinor: toMinor(item.price?.value) ?? 0,
    shippingMinor: toMinor(item.shippingOptions?.[0]?.shippingCost?.value),
    currency: item.price?.currency ?? "USD",
  };
}

export function mapItemDetails(item: BrowseItem): EbayItemDetails {
  const sold = item.estimatedAvailabilities
    ?.map((entry) => entry.estimatedSoldQuantity)
    .find((value): value is number => typeof value === "number" && Number.isFinite(value));
  const status = item.estimatedAvailabilities?.[0]?.estimatedAvailabilityStatus;
  return {
    ...mapSummary(item),
    estimatedSoldQuantity: sold ?? null,
    itemCreationDate: parseDate(item.itemCreationDate),
    itemEndDate: parseDate(item.itemEndDate),
    outOfStock: status === "OUT_OF_STOCK",
  };
}

export class EbayBrowseApiProvider {
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

  get configured() {
    return Boolean(this.config.clientId && this.config.clientSecret);
  }

  async searchProducts(input: EbaySearchInput): Promise<EbaySearchResult[]> {
    const wanted = Math.min(Math.max(input.limit ?? PAGE_SIZE, 1), 1000);
    const filters = ["buyingOptions:{FIXED_PRICE}", "conditions:{NEW}", "deliveryCountry:US"];
    if (input.minPriceMinor != null || input.maxPriceMinor != null) {
      const lo = input.minPriceMinor != null ? (input.minPriceMinor / 100).toFixed(2) : "";
      const hi = input.maxPriceMinor != null ? (input.maxPriceMinor / 100).toFixed(2) : "";
      filters.push(`price:[${lo}..${hi}]`, "priceCurrency:USD");
    }

    const results = new Map<string, EbaySearchResult>();
    for (let offset = 0; results.size < wanted; offset += PAGE_SIZE) {
      const url = new URL(`${this.baseUrl}/buy/browse/v1/item_summary/search`);
      url.searchParams.set("q", input.keyword);
      url.searchParams.set("limit", String(Math.min(PAGE_SIZE, wanted)));
      url.searchParams.set("offset", String(offset));
      url.searchParams.set("filter", filters.join(","));
      const data = (await this.request(url)) as { itemSummaries?: BrowseItem[]; total?: number };
      const page = data.itemSummaries ?? [];
      for (const item of page) {
        const mapped = mapSummary(item);
        // Variation listings appear once per variation; keep one row per legacy listing.
        if (!results.has(mapped.legacyItemId)) results.set(mapped.legacyItemId, mapped);
      }
      if (page.length < PAGE_SIZE || offset + PAGE_SIZE >= (data.total ?? 0)) break;
    }
    return [...results.values()].slice(0, wanted);
  }

  /**
   * Batched getItems (max 20 ids per call). Returns details keyed by the requested id.
   * Ids absent from the result map were not returned by eBay (ended, removed, or invalid).
   */
  async getItemsBatch(itemIds: string[]): Promise<Map<string, EbayItemDetails>> {
    const out = new Map<string, EbayItemDetails>();
    const unique = [...new Set(itemIds)];
    for (let i = 0; i < unique.length; i += GET_ITEMS_BATCH) {
      const chunk = unique.slice(i, i + GET_ITEMS_BATCH);
      const url = new URL(`${this.baseUrl}/buy/browse/v1/item/`);
      url.searchParams.set("item_ids", chunk.join(","));
      const data = (await this.request(url, { allow404: true })) as { items?: BrowseItem[] } | null;
      const byLegacy = new Map((data?.items ?? []).map((item) => [item.legacyItemId ?? legacyItemId(item.itemId), item]));
      for (const id of chunk) {
        const item = (data?.items ?? []).find((it) => it.itemId === id) ?? byLegacy.get(legacyItemId(id));
        if (item) out.set(id, mapItemDetails(item));
      }
    }
    return out;
  }

  private async request(url: URL, options?: { allow404?: boolean }): Promise<unknown> {
    const token = await this.getAppToken();
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-EBAY-C-MARKETPLACE-ID": this.marketplaceId,
      },
    });
    if (res.status === 404 && options?.allow404) return null;
    if (!res.ok) {
      throw new Error(`eBay Browse ${url.pathname} failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
    }
    return res.json();
  }

  private async getAppToken(): Promise<string> {
    if (!this.configured) {
      throw new EbayConfigError("eBay API keys missing: set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET.");
    }
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 60_000) {
      return this.tokenCache.accessToken;
    }
    const basic = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64");
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
}
