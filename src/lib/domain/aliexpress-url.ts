/**
 * AliExpress "Bundle Deals" / SuperDeals / "Pick 3" pages live under `/ssr/…` or `/gcp/…` and carry the
 * real product in `productIds=<productId>:<skuId>,…`. Those pages hide or inflate the single-item price,
 * so we always point sources at the plain item page (same rule the "Skip AliExpress Bundle Deals"
 * extensions apply in the browser).
 */

const PRODUCT_ID = /^\d{8,20}$/;

export function canonicalAliExpressItemUrl(productId: string): string {
  return `https://www.aliexpress.com/item/${productId}.html`;
}

/** Product id from a bundle-deal URL, an item URL, or null. */
export function aliexpressProductIdFromUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!/(^|\.)aliexpress\.[a-z.]+$/i.test(url.hostname)) return null;

  const item = url.pathname.match(/\/item\/(?:[^/]*\/)?(\d{8,20})\.html/i);
  if (item) return item[1]!;

  for (const key of ["productIds", "productId", "x_object_id", "itemId"]) {
    const first = url.searchParams.get(key)?.split(/[,:]/)[0]?.trim();
    if (first && PRODUCT_ID.test(first)) return first;
  }
  return null;
}

export function isAliExpressBundleUrl(raw: string | null | undefined): boolean {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return /(^|\.)aliexpress\.[a-z.]+$/i.test(url.hostname) && /^\/(ssr|gcp)\//i.test(url.pathname);
  } catch {
    return false;
  }
}

/** Rewrite a bundle-deal URL to its item page; other URLs pass through unchanged. */
export function unbundleAliExpressUrl(raw: string): string {
  if (!isAliExpressBundleUrl(raw)) return raw;
  const id = aliexpressProductIdFromUrl(raw);
  return id ? canonicalAliExpressItemUrl(id) : raw;
}
