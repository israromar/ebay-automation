/**
 * Live probe for Advanced Affiliate APIs:
 * product.query, product.smartmatch, hotproduct.query, image.search
 *
 * Usage: npx tsx scripts/aliexpress-advanced-probe.ts
 */
import "dotenv/config";
import { AliExpressOfficialApiProvider, signAliExpressParams } from "../src/lib/providers/aliexpress-official";

function gmt8Timestamp(date = new Date()): string {
  const offsetMs = 8 * 60 * 60 * 1000;
  const d = new Date(date.getTime() + offsetMs);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

async function callRaw(
  method: string,
  business: Record<string, string | number>,
  appKey: string,
  appSecret: string,
) {
  const params: Record<string, string> = {
    method,
    app_key: appKey,
    timestamp: gmt8Timestamp(),
    format: "json",
    v: "2.0",
    sign_method: "md5",
    simplify: "false",
    ...Object.fromEntries(Object.entries(business).map(([k, v]) => [k, String(v)])),
  };
  params.sign = signAliExpressParams(params, appSecret, "md5");
  const res = await fetch("https://api-sg.aliexpress.com/sync", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: new URLSearchParams(params),
  });
  const json = (await res.json()) as Record<string, unknown>;
  const err = json.error_response as { code?: string; msg?: string; sub_msg?: string } | undefined;
  if (err) {
    return { ok: false as const, method, error: `${err.code ?? ""} ${err.msg ?? ""} ${err.sub_msg ?? ""}`.trim() };
  }

  const responseKey = Object.keys(json).find((k) => k.includes("response"));
  const response = (responseKey ? json[responseKey] : json) as Record<string, unknown>;
  const respResult = (response.resp_result as Record<string, unknown> | undefined) ?? response;
  const result = (respResult.result as Record<string, unknown> | undefined) ?? respResult;
  const productsNode = result.products as { product?: unknown } | unknown[] | undefined;
  let list: Record<string, unknown>[] = [];
  if (Array.isArray(productsNode)) {
    list = productsNode.filter((p): p is Record<string, unknown> => !!p && typeof p === "object");
  } else if (productsNode && typeof productsNode === "object") {
    const nested = (productsNode as { product?: unknown }).product;
    if (Array.isArray(nested)) {
      list = nested.filter((p): p is Record<string, unknown> => !!p && typeof p === "object");
    } else if (nested && typeof nested === "object") {
      list = [nested as Record<string, unknown>];
    }
  }

  return {
    ok: true as const,
    method,
    count: list.length,
    sample: list.slice(0, 2).map((p) => ({
      id: p.product_id,
      title: String(p.product_title ?? "").slice(0, 80),
      volume: p.lastest_volume ?? p.latest_volume,
    })),
  };
}

async function main() {
  const appKey = process.env.ALIEXPRESS_APP_KEY ?? "";
  const appSecret = process.env.ALIEXPRESS_APP_SECRET ?? "";
  const trackingId = process.env.ALIEXPRESS_TRACKING_ID ?? "default";
  if (!appKey || !appSecret) throw new Error("Missing AliExpress credentials");

  const provider = new AliExpressOfficialApiProvider({ appKey, appSecret, trackingId });
  const keyword = process.argv[2] ?? "neck traction";
  const results = [];

  results.push(
    await callRaw(
      "aliexpress.affiliate.product.query",
      {
        keywords: keyword,
        page_no: 1,
        page_size: 3,
        target_currency: "USD",
        target_language: "EN",
        ship_to_country: "US",
        tracking_id: trackingId,
        sort: "LAST_VOLUME_DESC",
      },
      appKey,
      appSecret,
    ),
  );

  results.push(
    await callRaw(
      "aliexpress.affiliate.product.smartmatch",
      {
        keywords: keyword,
        device_id: "ebay-automation-probe",
        country: "US",
        page_no: 1,
        target_currency: "USD",
        target_language: "EN",
        tracking_id: trackingId,
        app: "ebay-automation",
        app_signature: process.env.ALIEXPRESS_APP_SIGNATURE || trackingId,
      },
      appKey,
      appSecret,
    ),
  );

  results.push(
    await callRaw(
      "aliexpress.affiliate.hotproduct.query",
      {
        keywords: keyword,
        page_no: 1,
        page_size: 3,
        target_currency: "USD",
        target_language: "EN",
        ship_to_country: "US",
        tracking_id: trackingId,
        sort: "LAST_VOLUME_DESC",
      },
      appKey,
      appSecret,
    ),
  );

  try {
    const img = await provider.searchProductsByImage({
      imageUrl: "https://i.ebayimg.com/images/g/8~kAAOSw~7RnYQ8~/s-l1600.jpg",
      limit: 5,
      shipToCountry: "US",
      currency: "USD",
    });
    results.push({
      ok: true as const,
      method: "aliexpress.affiliate.image.search",
      count: img.length,
      sample: img.slice(0, 2).map((p) => ({
        id: p.productId,
        title: p.title.slice(0, 80),
        volume: p.orderCount,
      })),
    });
  } catch (error) {
    results.push({
      ok: false as const,
      method: "aliexpress.affiliate.image.search",
      error: error instanceof Error ? error.message : String(error),
    });
  }

  console.log(JSON.stringify({ keyword, results }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
