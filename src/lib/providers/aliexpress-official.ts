import { createHash, createHmac } from "crypto";
import type { AliExpressProduct, AliExpressProductDetails, ProductSearchInput } from "@/lib/domain/types";
import type { AliExpressProvider } from "./types";

type GatewayParams = Record<string, string | number | boolean | undefined | null>;

function gmt8Timestamp(date = new Date()): string {
  const offsetMs = 8 * 60 * 60 * 1000;
  const d = new Date(date.getTime() + offsetMs);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function cleanParams(params: GatewayParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    out[k] = String(v);
  }
  return out;
}

/** TOP-style MD5 bookend signature used by Affiliate APIs. */
export function signAliExpressParams(
  params: Record<string, string>,
  appSecret: string,
  signMethod: "md5" | "hmac" | "sha256" = "md5",
): string {
  const sortedKeys = Object.keys(params).sort();
  const concatenated = sortedKeys.map((k) => `${k}${params[k]}`).join("");

  if (signMethod === "md5") {
    return createHash("md5").update(`${appSecret}${concatenated}${appSecret}`, "utf8").digest("hex").toUpperCase();
  }

  if (signMethod === "hmac") {
    return createHmac("md5", appSecret).update(concatenated, "utf8").digest("hex").toUpperCase();
  }

  return createHmac("sha256", appSecret).update(concatenated, "utf8").digest("hex").toUpperCase();
}

function toMinorUnits(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function mapProduct(raw: Record<string, unknown>, source: string): AliExpressProduct {
  const productId = String(raw.product_id ?? raw.productId ?? raw.item_id ?? raw.itemId ?? "");
  const title = String(raw.product_title ?? raw.productTitle ?? raw.title ?? "Untitled");
  const price = raw.target_sale_price ?? raw.sale_price ?? raw.target_original_price ?? raw.original_price ?? 0;
  const ratingRaw = raw.evaluate_rate ?? raw.evaluateRate ?? raw.product_rating ?? raw.rating;
  const rating =
    ratingRaw == null
      ? undefined
      : Number(String(ratingRaw).replace("%", "")) > 5
        ? Number(String(ratingRaw).replace("%", "")) / 20
        : Number(ratingRaw);
  const reviewCount = raw.evaluation_count ?? raw.evaluationCount ?? raw.review_count;
  const orderCount = raw.lastest_volume ?? raw.latest_volume ?? raw.volume ?? raw.order_count;
  const url =
    String(raw.promotion_link ?? raw.product_detail_url ?? raw.detail_url ?? "") ||
    (productId ? `https://www.aliexpress.com/item/${productId}.html` : "");
  const smallImages = Array.isArray(raw.product_small_image_urls) ? raw.product_small_image_urls : [];

  return {
    productId,
    title,
    url,
    imageUrl: String(raw.product_main_image_url ?? smallImages[0] ?? raw.image_url ?? "") || undefined,
    priceMinor: toMinorUnits(price),
    shippingMinor: undefined,
    currency: String(raw.target_sale_price_currency ?? raw.currency ?? "USD"),
    rating: Number.isFinite(rating) ? rating : undefined,
    reviewCount: reviewCount == null ? undefined : Number(reviewCount),
    orderCount: orderCount == null ? undefined : Number(orderCount),
    meta: {
      source,
      confidence: 0.9,
      collectedAt: new Date().toISOString(),
      completeness: "partial",
      warnings: [],
      rawRecordRef: productId || undefined,
    },
  };
}

function extractProducts(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const response =
    (root.aliexpress_affiliate_product_query_response as Record<string, unknown> | undefined) ??
    (root.aliexpress_affiliate_productdetail_get_response as Record<string, unknown> | undefined) ??
    root;

  const respResult = (response.resp_result as Record<string, unknown> | undefined) ?? response;
  const result = (respResult.result as Record<string, unknown> | undefined) ?? respResult;
  const products = (result.products as { product?: unknown } | unknown[] | undefined) ?? (result.products as unknown);

  if (Array.isArray(products)) {
    return products.filter((p): p is Record<string, unknown> => !!p && typeof p === "object");
  }
  if (products && typeof products === "object") {
    const nested = (products as { product?: unknown }).product;
    if (Array.isArray(nested)) {
      return nested.filter((p): p is Record<string, unknown> => !!p && typeof p === "object");
    }
    if (nested && typeof nested === "object") return [nested as Record<string, unknown>];
  }
  return [];
}

/**
 * Official Affiliate API adapter.
 * Requires ALIEXPRESS_APP_KEY, ALIEXPRESS_APP_SECRET, ALIEXPRESS_TRACKING_ID.
 */
export class AliExpressOfficialApiProvider implements AliExpressProvider {
  readonly name = "AliExpressOfficialApiProvider";

  constructor(
    private readonly config: {
      appKey: string;
      appSecret: string;
      trackingId?: string;
      gatewayUrl?: string;
    },
  ) {}

  private get gatewayUrl() {
    // Business/affiliate calls commonly use the SG sync gateway.
    return this.config.gatewayUrl ?? "https://api-sg.aliexpress.com/sync";
  }

  async searchProducts(input: ProductSearchInput): Promise<AliExpressProduct[]> {
    if (!this.config.appKey || !this.config.appSecret) {
      throw new Error("AliExpressOfficialApiProvider: missing credentials");
    }

    const requested = Math.min(Math.max(input.limit ?? 5, 1), 150);
    const products = new Map<string, AliExpressProduct>();

    for (let page = 1; products.size < requested; page += 1) {
      const pageSize = Math.min(50, requested - products.size);
      const pageProducts = await this.searchProductPage(input, page, pageSize);
      for (const product of pageProducts) products.set(product.productId, product);
      if (pageProducts.length < pageSize) break;
    }

    return [...products.values()].slice(0, requested);
  }

  private async searchProductPage(input: ProductSearchInput, page: number, pageSize: number): Promise<AliExpressProduct[]> {
    const body = await this.call("aliexpress.affiliate.product.query", {
      keywords: input.keyword,
      page_no: page,
      page_size: pageSize,
      target_currency: input.currency ?? "USD",
      target_language: "EN",
      ship_to_country: input.shipToCountry ?? "US",
      tracking_id: this.config.trackingId ?? "default",
      sort: "LAST_VOLUME_DESC",
      fields:
        "commission_rate,sale_price,lastest_volume,evaluate_rate,evaluation_count,product_title,product_main_image_url,product_id,promotion_link,product_detail_url",
    });
    return extractProducts(body).map((product) => mapProduct(product, this.name));
  }

  async getProductDetails(urlOrId: string): Promise<AliExpressProductDetails> {
    if (!this.config.appKey || !this.config.appSecret) {
      throw new Error("AliExpressOfficialApiProvider: missing credentials");
    }

    const productIds = urlOrId.match(/\d{10,}/)?.[0] ?? urlOrId;
    const body = await this.call("aliexpress.affiliate.productdetail.get", {
      product_ids: productIds,
      target_currency: "USD",
      target_language: "EN",
      ship_to_country: "US",
      tracking_id: this.config.trackingId ?? "default",
      fields:
        "commission_rate,sale_price,lastest_volume,evaluate_rate,evaluation_count,product_title,product_main_image_url,product_id,promotion_link,product_detail_url",
    });

    const products = extractProducts(body).map((p) => mapProduct(p, this.name));
    if (!products[0]) {
      throw new Error(`AliExpress product not found for: ${urlOrId}`);
    }
    return products[0];
  }

  private async call(method: string, businessParams: GatewayParams): Promise<unknown> {
    const params = cleanParams({
      method,
      app_key: this.config.appKey,
      timestamp: gmt8Timestamp(),
      format: "json",
      v: "2.0",
      sign_method: "md5",
      simplify: "false",
      ...businessParams,
    });
    params.sign = signAliExpressParams(params, this.config.appSecret, "md5");

    const res = await fetch(this.gatewayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
      },
      body: new URLSearchParams(params),
    });

    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`AliExpress API non-JSON response (${res.status}): ${text.slice(0, 300)}`);
    }

    const err = (json as { error_response?: { code?: string; msg?: string; sub_msg?: string } }).error_response;
    if (err) {
      throw new Error(`AliExpress API error: ${err.code ?? "unknown"} ${err.msg ?? ""} ${err.sub_msg ?? ""}`.trim());
    }
    if (!res.ok) {
      throw new Error(`AliExpress API HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    return json;
  }
}
