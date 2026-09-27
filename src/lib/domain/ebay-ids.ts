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
