export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\b(free shipping|hot sale|new arrival|dropship)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractPackQuantity(title: string): number | null {
  const m = title.match(/\b(\d+)\s*(pcs|pc|pack|pcs\/lot|pieces?)\b/i);
  if (m) return Number(m[1]);
  if (/\b(set of|lot of)\s*(\d+)\b/i.test(title)) {
    const m2 = title.match(/\b(set of|lot of)\s*(\d+)\b/i);
    return m2 ? Number(m2[2]) : null;
  }
  return 1;
}

export function tokenSet(title: string): Set<string> {
  return new Set(
    normalizeTitle(title)
      .split(" ")
      .filter((t) => t.length > 2),
  );
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export interface MatchAttributes {
  title: string;
  brand?: string;
  model?: string;
  condition?: string;
  packQuantity?: number | null;
  categoryId?: string;
  priceMinor?: number;
  isAccessory?: boolean;
}

export interface MatchResult {
  confidence: number;
  hardReject: boolean;
  reasons: string[];
}

const ACCESSORY_WORDS = ["case", "cover", "replacement", "spare", "part", "charger only", "cable only"];

export function detectAccessory(title: string): boolean {
  const n = normalizeTitle(title);
  return ACCESSORY_WORDS.some((w) => n.includes(w));
}

export function scoreProductMatch(source: MatchAttributes, ebay: MatchAttributes): MatchResult {
  const reasons: string[] = [];
  let hardReject = false;

  const sourcePack = source.packQuantity ?? extractPackQuantity(source.title);
  const ebayPack = ebay.packQuantity ?? extractPackQuantity(ebay.title);
  if (sourcePack != null && ebayPack != null && sourcePack !== ebayPack) {
    hardReject = true;
    reasons.push("pack_quantity_mismatch");
  }

  const sourceCond = (source.condition ?? "NEW").toUpperCase();
  const ebayCond = (ebay.condition ?? "NEW").toUpperCase();
  if (sourceCond.includes("NEW") && ebayCond.includes("USED")) {
    hardReject = true;
    reasons.push("condition_mismatch");
  }

  const sourceAccessory = source.isAccessory ?? detectAccessory(source.title);
  const ebayAccessory = ebay.isAccessory ?? detectAccessory(ebay.title);
  if (sourceAccessory !== ebayAccessory) {
    hardReject = true;
    reasons.push("accessory_vs_main");
  }

  if (source.model && ebay.model && source.model.toLowerCase() !== ebay.model.toLowerCase()) {
    hardReject = true;
    reasons.push("model_mismatch");
  }

  if (hardReject) {
    return { confidence: 0, hardReject: true, reasons };
  }

  const titleSim = jaccardSimilarity(tokenSet(source.title), tokenSet(ebay.title));
  let score = Math.round(titleSim * 85);
  if (titleSim >= 0.7) {
    score += 5;
    reasons.push("strong_title_overlap");
  }

  if (source.brand && ebay.brand) {
    if (source.brand.toLowerCase() === ebay.brand.toLowerCase()) {
      score += 15;
      reasons.push("brand_match");
    } else {
      score -= 10;
      reasons.push("brand_mismatch");
    }
  }

  if (source.categoryId && ebay.categoryId && source.categoryId === ebay.categoryId) {
    score += 10;
    reasons.push("category_match");
  }

  if (source.priceMinor != null && ebay.priceMinor != null && source.priceMinor > 0) {
    const ratio = ebay.priceMinor / source.priceMinor;
    if (ratio >= 1.2 && ratio <= 5) {
      score += 5;
      reasons.push("price_band_ok");
    }
  }

  score = Math.max(0, Math.min(100, score));
  return { confidence: score, hardReject: false, reasons };
}

export function candidateFingerprint(parts: {
  aliexpressProductId?: string;
  ebayItemId?: string;
  title?: string;
}): string {
  const base = [
    parts.aliexpressProductId ?? "",
    parts.ebayItemId ?? "",
    normalizeTitle(parts.title ?? ""),
  ].join("|");
  let hash = 0;
  for (let i = 0; i < base.length; i++) {
    hash = (hash * 31 + base.charCodeAt(i)) | 0;
  }
  return `fp_${Math.abs(hash).toString(16)}_${base.length}`;
}
