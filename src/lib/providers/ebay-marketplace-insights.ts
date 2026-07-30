import type { EbayDemandInput, EbayDemandResult } from "@/lib/domain/types";

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

type InsightsAccess = "unknown" | "granted" | "denied";

/**
 * Marketplace Insights sold-history probe/provider.
 * Limited Release — many app keys get 403; those are treated as unavailable.
 */
export class EbayMarketplaceInsightsProvider {
  readonly name = "EbayMarketplaceInsightsProvider";
  private tokenCache: TokenCache | null = null;
  private access: InsightsAccess = "unknown";

  constructor(
    private readonly config: {
      clientId: string;
      clientSecret: string;
      marketplaceId?: string;
      baseUrl?: string;
    },
  ) {}

  get accessState(): InsightsAccess {
    return this.access;
  }

  private get hasCredentials() {
    return Boolean(this.config.clientId && this.config.clientSecret);
  }

  private get marketplaceId() {
    return this.config.marketplaceId ?? "EBAY_US";
  }

  private get baseUrl() {
    return this.config.baseUrl ?? "https://api.ebay.com";
  }

  async getMarketDemand(input: EbayDemandInput): Promise<EbayDemandResult> {
    const now = new Date().toISOString();
    if (!this.hasCredentials) {
      return this.unavailable(now, "Missing EBAY_CLIENT_ID/SECRET");
    }
    if (this.access === "denied") {
      return this.unavailable(now, "Marketplace Insights previously returned access denied");
    }

    try {
      const token = await this.getAppToken();
      const url = new URL(`${this.baseUrl}/buy/marketplace_insights/v1_beta/item_sales/search`);
      const query = input.keyword?.trim() || input.itemId?.trim();
      if (!query) return this.unavailable(now, "No keyword or itemId for Insights search");
      url.searchParams.set("q", query);
      url.searchParams.set("limit", "50");

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-EBAY-C-MARKETPLACE-ID": this.marketplaceId,
        },
      });
      const text = await res.text();
      if (res.status === 403 || res.status === 401) {
        this.access = "denied";
        return this.unavailable(now, `Insights access denied (${res.status})`);
      }
      if (!res.ok) {
        return this.unavailable(now, `Insights HTTP ${res.status}: ${text.slice(0, 180)}`);
      }

      this.access = "granted";
      const data = JSON.parse(text) as {
        itemSales?: Array<{
          itemId?: string;
          title?: string;
          lastSoldDate?: string;
          price?: { value?: string; currency?: string };
          totalSoldQuantity?: number;
        }>;
        total?: number;
      };

      const sales = data.itemSales ?? [];
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const recent = sales.filter((sale) => {
        if (!sale.lastSoldDate) return true;
        return new Date(sale.lastSoldDate).getTime() >= cutoff;
      });
      const prices = recent
        .map((sale) => Math.round(Number(sale.price?.value ?? 0) * 100))
        .filter((minor) => minor > 0)
        .sort((a, b) => a - b);
      const soldLast30Days = recent.reduce((sum, sale) => sum + (sale.totalSoldQuantity ?? 1), 0);
      const avgCompletedSaleMinor = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : undefined;
      const medianCompletedSaleMinor = prices.length ? prices[Math.floor(prices.length / 2)] : undefined;

      return {
        available: true,
        soldLast30Days,
        avgCompletedSaleMinor,
        medianCompletedSaleMinor,
        totalHistoricalSold: data.total ?? sales.length,
        source: this.name,
        meta: {
          source: this.name,
          confidence: 0.9,
          collectedAt: now,
          completeness: "partial",
          warnings: soldLast30Days === 0 ? ["Insights returned no recent sales for query"] : [],
          rawRecordRef: query,
        },
      };
    } catch (error) {
      return this.unavailable(now, error instanceof Error ? error.message : String(error));
    }
  }

  private unavailable(now: string, warning: string): EbayDemandResult {
    return {
      available: false,
      source: this.name,
      reasonCode: "EBAY_SOLD_HISTORY_UNAVAILABLE",
      meta: {
        source: this.name,
        confidence: 0,
        collectedAt: now,
        completeness: "minimal",
        warnings: [warning],
      },
    };
  }

  private async getAppToken(): Promise<string> {
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
