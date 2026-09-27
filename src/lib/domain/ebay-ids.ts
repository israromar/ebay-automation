/** Extract a numeric legacy eBay item id (or a Browse `v1|…` id) from an id or listing URL. */
export function extractEbayItemId(urlOrId: string): string | null {
  const trimmed = urlOrId.trim();
  if (!trimmed) return null;
  if (/^\d{9,15}$/.test(trimmed) || /^v1\|/.test(trimmed)) return trimmed;
  const fromPath = trimmed.match(/\/itm\/(?:[^/]+\/)?(\d{9,15})/i);
  if (fromPath) return fromPath[1]!;
  try {
    const u = new URL(trimmed);
    const id = u.searchParams.get("item") ?? u.searchParams.get("id");
    if (id && /^\d{9,15}$/.test(id)) return id;
  } catch {
    /* not a URL */
  }
  return null;
}

/** Browse ids look like `v1|123456789012|0`; the legacy id is the middle part. */
export function legacyItemId(browseOrLegacyId: string): string {
  const m = browseOrLegacyId.match(/^v1\|(\d+)\|/);
  return m ? m[1]! : browseOrLegacyId;
}

export function toBrowseItemId(id: string): string {
  return id.startsWith("v1|") ? id : `v1|${id}|0`;
}

export interface EbayMarketplace {
  marketplaceId: string;
  currency: string;
  /** ISO country used as AliExpress ship-to. */
  country: string;
}

const MARKETPLACES: Array<[RegExp, EbayMarketplace]> = [
  [/(^|\.)ebay\.co\.uk$/, { marketplaceId: "EBAY_GB", currency: "GBP", country: "GB" }],
  [/(^|\.)ebay\.com\.au$/, { marketplaceId: "EBAY_AU", currency: "AUD", country: "AU" }],
  [/(^|\.)ebay\.de$/, { marketplaceId: "EBAY_DE", currency: "EUR", country: "DE" }],
  [/(^|\.)ebay\.fr$/, { marketplaceId: "EBAY_FR", currency: "EUR", country: "FR" }],
  [/(^|\.)ebay\.it$/, { marketplaceId: "EBAY_IT", currency: "EUR", country: "IT" }],
  [/(^|\.)ebay\.es$/, { marketplaceId: "EBAY_ES", currency: "EUR", country: "ES" }],
  [/(^|\.)ebay\.ca$/, { marketplaceId: "EBAY_CA", currency: "CAD", country: "CA" }],
  [/(^|\.)ebay\.com$/, { marketplaceId: "EBAY_US", currency: "USD", country: "US" }],
];

/** eBay site from a listing URL (ebay.co.uk → EBAY_GB / GBP / GB). Null for non-eBay hosts. */
export function marketplaceFromUrl(raw: string): EbayMarketplace | null {
  try {
    const host = new URL(raw.trim()).hostname.toLowerCase();
    return MARKETPLACES.find(([re]) => re.test(host))?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Selected variation of a multi-variation listing (`?var=123`), if any. */
export function variationIdFromUrl(raw: string): string | null {
  try {
    const v = new URL(raw.trim()).searchParams.get("var");
    return v && /^\d{6,20}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}
