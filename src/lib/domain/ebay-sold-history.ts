/** Build operator-facing eBay sold-history / completed-sales URLs. */

export function extractNumericEbayItemId(itemIdOrUrl?: string | null): string | null {
  if (!itemIdOrUrl) return null;
  const trimmed = itemIdOrUrl.trim();
  if (!trimmed) return null;

  const fromLegacy = trimmed.match(/^v1\|(\d+)/i);
  if (fromLegacy) return fromLegacy[1];
  if (/^\d{9,15}$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    const fromPath = url.pathname.match(/\/itm\/(?:[^/]+\/)?(\d{9,15})/i);
    if (fromPath) return fromPath[1];
    const item = url.searchParams.get("item") ?? url.searchParams.get("id");
    if (item && /^\d{9,15}$/.test(item)) return item;
  } catch {
    /* not a URL */
  }

  const loose = trimmed.match(/(\d{9,15})/);
  return loose?.[1] ?? null;
}

/** Legacy per-listing purchase/sold history page (requires eBay login). */
export function buildEbayPurchaseHistoryUrl(itemIdOrUrl?: string | null): string | null {
  const itemId = extractNumericEbayItemId(itemIdOrUrl);
  if (!itemId) return null;
  return `https://www.ebay.com/bin/purchaseHistory?item=${itemId}`;
}

/** Marketplace sold+completed search for a keyword (operator comps). */
export function buildEbaySoldSearchUrl(keyword: string, options?: { days?: number }): string {
  const q = keyword.trim() || "product";
  const url = new URL("https://www.ebay.com/sch/i.html");
  url.searchParams.set("_nkw", q);
  url.searchParams.set("LH_Sold", "1");
  url.searchParams.set("LH_Complete", "1");
  url.searchParams.set("rt", "nc");
  url.searchParams.set("_ipg", "60");
  if (options?.days && options.days > 0) {
    url.searchParams.set("_udhi", "");
  }
  return url.toString();
}

export function dollarsToMinor(value: string | number): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 100);
  const cleaned = String(value).replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

export function minorToDollarsInput(minor?: number | null): string {
  if (typeof minor !== "number") return "";
  return (minor / 100).toFixed(2);
}
