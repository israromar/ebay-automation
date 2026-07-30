export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\b(free shipping|hot sale|new arrival|dropship)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SEARCH_STOP_WORDS = new Set(["with", "for", "and", "the", "new", "hot", "sale", "free", "shipping", "pcs", "pack", "lot", "usb", "ml", "oz", "ft", "brand"]);

function searchTokens(title: string): string[] {
  return normalizeTitle(title)
    .split(" ")
    .filter((token) => token.length > 2 && !SEARCH_STOP_WORDS.has(token) && !/^\d+$/.test(token));
}

/** Short AE search query — full eBay marketing titles often return 0 affiliate hits. */
export function buildAliExpressSearchQuery(title: string, seedKeyword?: string): string {
  const seed = seedKeyword?.trim();
  if (seed && seed.length >= 3 && seed.length <= 60) return seed;
  const tokens = searchTokens(title);
  return tokens.slice(0, 5).join(" ") || title.slice(0, 40).trim();
}

/** Query variants combine exact quantity/attributes with broader product terms. */
export function buildAliExpressSearchQueries(title: string, seedKeyword?: string): string[] {
  const tokens = searchTokens(title);
  const seed = seedKeyword?.trim();
  const packQuantity = extractPackQuantity(title);
  const titleHasSet = /\b(?:set|kit)\b/i.test(title);
  const descriptiveTokens = tokens.filter((token) => token !== "piece");
  const quantityCore = seed || descriptiveTokens.slice(0, 4).join(" ");
  const quantityQuery = (packQuantity ?? 0) > 1 && quantityCore ? `${packQuantity}pcs ${quantityCore}${titleHasSet && !/\b(?:set|kit)\b/i.test(quantityCore) ? " set" : ""}` : "";
  const queries = [quantityQuery, descriptiveTokens.slice(0, 5).join(" "), buildAliExpressSearchQuery(title, seedKeyword), descriptiveTokens.slice(5, 10).join(" ")];
  return [...new Set(queries.filter((query) => query.length >= 3))];
}

export function extractPackQuantity(title: string): number | null {
  const normalized = normalizeTitle(title.replace(/[\u2010-\u2015\u2212]/g, "-"));
  const m = normalized.match(/\b(\d+)\s*(pcs|pc|pack|pcs lot|pieces?)\b/);
  if (m) return Number(m[1]);
  const setOf = normalized.match(/\b(?:set|lot)\s+of\s+(\d+)\b/);
  return setOf ? Number(setOf[1]) : null;
}

export function tokenSet(title: string): Set<string> {
  return new Set(
    normalizeTitle(title)
      .split(" ")
      .map((token) => {
        if (/^\d+(?:pcs?|pieces?)$/.test(token)) return "piece";
        if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss") && token !== "fitness") return token.slice(0, -1);
        return token;
      })
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

const ACCESSORY_PATTERNS = [/\b(?:case|cover|shell|skin|protector)\s+(?:cover\s+)?for\b/, /\bprotective\s+(?:case|cover|shell)\b/, /\b(?:replacement|spare)\b/, /\b(?:charger|cable)\s+only\b/, /\b(?:holder|storage box)\b/];

const PRODUCT_CONTEXT_PATTERNS = [
  { id: "sleep_wellness", pattern: /\b(?:sleep|night|snor\w*|breath\w*|nasal|nose|oral|lip|bedtime)\b/ },
  { id: "textile_sewing", pattern: /\b(?:pant|pants|hem|hemming|fabric|sewing|iron|ironing|garment|dress|jeans|textile)\b/ },
];

export function detectAccessory(title: string): boolean {
  const n = normalizeTitle(title);
  return ACCESSORY_PATTERNS.some((pattern) => pattern.test(n));
}

function hasProductContextMismatch(sourceTitle: string, candidateTitle: string): boolean {
  const sourceContexts = PRODUCT_CONTEXT_PATTERNS.filter(({ pattern }) => pattern.test(normalizeTitle(sourceTitle))).map(({ id }) => id);
  const candidateContexts = PRODUCT_CONTEXT_PATTERNS.filter(({ pattern }) => pattern.test(normalizeTitle(candidateTitle))).map(({ id }) => id);
  return sourceContexts.length > 0 && candidateContexts.length > 0 && !sourceContexts.some((context) => candidateContexts.includes(context));
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

  if (hasProductContextMismatch(source.title, ebay.title)) {
    hardReject = true;
    reasons.push("product_context_mismatch");
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

function tokenContainment(sourceTitle: string, candidateTitle: string): number {
  const sourceTokens = tokenSet(sourceTitle);
  const candidateTokens = tokenSet(candidateTitle);
  const denominator = Math.min(sourceTokens.size, candidateTokens.size);
  if (denominator === 0) return 0;

  let intersection = 0;
  for (const token of sourceTokens) {
    if (candidateTokens.has(token)) intersection += 1;
  }
  return intersection / denominator;
}

function keywordCoverage(keyword: string, candidateTitle: string): number {
  const keywordTokens = tokenSet(keyword);
  if (keywordTokens.size === 0) return 0;
  const candidateTokens = tokenSet(candidateTitle);

  let matched = 0;
  for (const token of keywordTokens) {
    if (candidateTokens.has(token)) matched += 1;
  }
  return matched / keywordTokens.size;
}

/**
 * Cross-marketplace sourcing score. AE/eBay titles use different marketing
 * words, so containment is more useful here than symmetric Jaccard alone.
 */
export function scoreAliExpressSourceMatch(ebay: MatchAttributes, aliexpress: MatchAttributes, searchKeyword: string): MatchResult {
  const safetyMatch = scoreProductMatch(ebay, aliexpress);
  if (safetyMatch.hardReject) return safetyMatch;

  const ebayPack = ebay.packQuantity ?? extractPackQuantity(ebay.title);
  const aliexpressPack = aliexpress.packQuantity ?? extractPackQuantity(aliexpress.title);
  if ((ebayPack ?? 0) > 1 && aliexpressPack == null) {
    return { confidence: 0, hardReject: true, reasons: ["pack_quantity_missing"] };
  }

  const reasons = [...safetyMatch.reasons];
  const containment = tokenContainment(ebay.title, aliexpress.title);
  const coverage = keywordCoverage(searchKeyword, aliexpress.title);
  let score = Math.round(containment * 65 + coverage * 25);

  if ((ebayPack ?? 0) > 1 && ebayPack === aliexpressPack) {
    score += 20;
    reasons.push("pack_quantity_match");
  }

  if (ebay.priceMinor != null && aliexpress.priceMinor != null && aliexpress.priceMinor > 0 && aliexpress.priceMinor < ebay.priceMinor) {
    score += 10;
    reasons.push("source_price_below_ebay");
  }
  if (coverage === 1) reasons.push("search_keyword_match");
  if (containment >= 0.5) reasons.push("strong_title_containment");

  return {
    confidence: Math.max(0, Math.min(100, score)),
    hardReject: false,
    reasons,
  };
}

export function candidateFingerprint(parts: { aliexpressProductId?: string; ebayItemId?: string; title?: string }): string {
  const base = [parts.aliexpressProductId ?? "", parts.ebayItemId ?? "", normalizeTitle(parts.title ?? "")].join("|");
  let hash = 0;
  for (let i = 0; i < base.length; i++) {
    hash = (hash * 31 + base.charCodeAt(i)) | 0;
  }
  return `fp_${Math.abs(hash).toString(16)}_${base.length}`;
}
