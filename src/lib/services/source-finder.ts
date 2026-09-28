import { prisma } from "@/lib/db";
import { extractEbayItemId, legacyItemId, marketplaceFromUrl, variationIdFromUrl } from "@/lib/domain/ebay-ids";
import { bestComparison, fingerprintImage, type ImageFingerprint, type VisualComparison } from "@/lib/domain/image-fingerprint";
import { buildAliExpressSearchQuery, scoreAliExpressSourceMatch } from "@/lib/domain/matching";
import { combineConfidence, type ConfidenceTier } from "@/lib/domain/source-confidence";
import { gateSource } from "@/lib/domain/sourcing";
import type { AliExpressProduct } from "@/lib/domain/types";
import { logInfo, logWarn } from "@/lib/logger";
import type { EbayListingForSourcing } from "@/lib/providers/ebay-browse";
import { createAliExpressProvider, createEbayProvider, loadHuntSettings } from "./providers";
import { mapWithConcurrency, retrieveAliExpressCandidates } from "./sourcing";

/**
 * Source finder: paste an eBay listing link (any eBay site, built for ebay.co.uk) and get the
 * AliExpress products most likely to be the same item, scored by title match + image fingerprint.
 * The closest candidates are always returned, even when none is a confident match.
 */

const TEXT_SHORTLIST = 30;
const RESULT_LIMIT = 12;
const EBAY_IMAGES = 4;
const IMAGE_CONCURRENCY = 8;
const IMAGE_TIMEOUT_MS = 5000;
const IMAGE_MAX_BYTES = 3 * 1024 * 1024;
const LOOKUP_BUDGET_MS = 45_000;

const IMAGE_HOSTS = [/(^|\.)alicdn\.com$/i, /(^|\.)aliexpress-media\.com$/i, /(^|\.)aliexpress\.com$/i, /(^|\.)ebayimg\.com$/i];

export interface SourceCandidate {
  productId: string;
  title: string;
  url: string;
  affiliateUrl: string | null;
  imageUrl: string | null;
  priceMinor: number;
  currency: string;
  rating: number | null;
  reviewCount: number | null;
  orderCount: number | null;
  confidence: number;
  tier: ConfidenceTier;
  textScore: number;
  visual: VisualComparison | null;
  reasons: string[];
  hardReject: boolean;
  retrievedByImage: boolean;
  estimatedProfitMinor: number;
  marginPct: number;
  shippingMinor: number;
  shippingEstimated: boolean;
  meetsGate: boolean;
  gateReasons: string[];
}

export interface SourceLookupResult {
  ebay: {
    itemId: string;
    title: string;
    url: string;
    images: string[];
    priceMinor: number;
    shippingMinor: number | null;
    currency: string;
    marketplaceId: string;
    brand: string | null;
    aspects: Record<string, string>;
  };
  candidates: SourceCandidate[];
  stats: { retrieved: number; shortlisted: number; fingerprinted: number; imageFailures: number; queries: string[]; durationMs: number };
}

function allowedImageHost(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const extra = (process.env.IMAGE_FETCH_EXTRA_HOSTS ?? "")
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);
    return IMAGE_HOSTS.some((re) => re.test(url.hostname)) || extra.includes(url.host);
  } catch {
    return false;
  }
}

/** Ask the AliExpress CDN for a smaller rendition when the URL supports it (faster, same pixels). */
function smallAliExpressImage(url: string): string {
  return /alicdn\.com\/.+\.(jpe?g|png|webp)$/i.test(url) && !/_\d+x\d+/.test(url) ? `${url}_350x350.jpg` : url;
}

async function fetchImage(url: string): Promise<Buffer | null> {
  if (!allowedImageHost(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS), headers: { Accept: "image/*" } });
    if (!res.ok) return null;
    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > IMAGE_MAX_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.byteLength > IMAGE_MAX_BYTES ? null : buf;
  } catch {
    return null;
  }
}

async function fingerprintUrl(url: string): Promise<ImageFingerprint | null> {
  const buf = await fetchImage(url);
  if (!buf) return null;
  try {
    return await fingerprintImage(buf);
  } catch {
    return null;
  }
}

function extraQueries(listing: EbayListingForSourcing): string[] {
  const a = listing.aspects;
  const type = a.Type ?? a["Product Type"] ?? a.Model;
  const colour = a.Colour ?? a.Color;
  return type ? [`${type}${colour ? ` ${colour}` : ""}`.trim()] : [];
}

export async function findAliExpressSources(workspaceId: string, url: string): Promise<SourceLookupResult> {
  const started = Date.now();
  const deadline = started + LOOKUP_BUDGET_MS;
  const marketplace = marketplaceFromUrl(url);
  if (!marketplace) throw new Error("Paste an eBay listing link (ebay.co.uk, ebay.com, ebay.de …)");
  const rawId = extractEbayItemId(url);
  if (!rawId) throw new Error("Couldn't find an item number in that link");

  const listing = await createEbayProvider().getItemForSourcing(legacyItemId(rawId), marketplace.marketplaceId, variationIdFromUrl(url));
  if (!listing) throw new Error("eBay didn't return this listing. It may have ended, or the link is for another eBay site.");

  const keyword = buildAliExpressSearchQuery(listing.title);
  const [retrieval, ebayPrints] = await Promise.all([
    retrieveAliExpressCandidates(
      createAliExpressProvider(),
      { title: listing.title, keyword, imageUrl: listing.images[0] ?? null },
      { currency: marketplace.currency, shipToCountry: marketplace.country, maxQueries: 3, extraQueries: extraQueries(listing) },
    ),
    Promise.all(listing.images.slice(0, EBAY_IMAGES).map(fingerprintUrl)),
  ]);
  const references = ebayPrints.filter((p): p is ImageFingerprint => p != null);

  const ebaySide = { title: listing.title, brand: listing.brand ?? undefined, priceMinor: listing.priceMinor, condition: "NEW" };
  const scored = retrieval.products.map((product) => ({
    product,
    text: scoreAliExpressSourceMatch(ebaySide, { title: product.title, priceMinor: product.priceMinor, condition: "NEW" }, keyword),
    byImage: product.meta.warnings.includes("retrieved_by_image"),
  }));
  scored.sort((a, b) => Number(a.text.hardReject) - Number(b.text.hardReject) || b.text.confidence - a.text.confidence);
  const shortlist = [...scored.slice(0, TEXT_SHORTLIST), ...scored.slice(TEXT_SHORTLIST).filter((s) => s.byImage)];

  let fingerprinted = 0;
  let imageFailures = 0;
  const visuals = await mapWithConcurrency(
    shortlist,
    IMAGE_CONCURRENCY,
    async (s) => {
      if (!references.length || !s.product.imageUrl) return null;
      const print = await fingerprintUrl(smallAliExpressImage(s.product.imageUrl));
      if (!print) {
        imageFailures += 1;
        return null;
      }
      fingerprinted += 1;
      return bestComparison(references, print);
    },
    deadline,
  );

  const settings = await loadHuntSettings(workspaceId);
  const candidates: SourceCandidate[] = shortlist.map((s, i) => {
    const visualResult = visuals[i];
    const visual = visualResult?.status === "fulfilled" ? visualResult.value : null;
    const combined = combineConfidence({ text: s.text, visual: visual?.score ?? null, ebayTitle: listing.title, aeTitle: s.product.title });
    // Same shape, different colours: usually another colourway of the same product (AE listings often bundle colours).
    if (visual && visual.edge >= 75 && visual.color < 25) combined.reasons.push("other_colour");
    const gated = gateSource(
      { title: listing.title, priceMinor: listing.priceMinor, shippingMinor: listing.shippingMinor ?? 0 },
      s.product,
      keyword,
      settings,
    );
    return toCandidate(s.product, marketplace.currency, combined, s.text, visual, s.byImage, gated);
  });
  candidates.sort((a, b) => b.confidence - a.confidence || b.textScore - a.textScore || (b.orderCount ?? 0) - (a.orderCount ?? 0));

  const result: SourceLookupResult = {
    ebay: {
      itemId: listing.legacyItemId,
      title: listing.title,
      url: listing.url,
      images: listing.images,
      priceMinor: listing.priceMinor,
      shippingMinor: listing.shippingMinor ?? null,
      currency: listing.currency,
      marketplaceId: listing.marketplaceId,
      brand: listing.brand,
      aspects: listing.aspects,
    },
    candidates: candidates.slice(0, RESULT_LIMIT),
    stats: {
      retrieved: retrieval.products.length,
      shortlisted: shortlist.length,
      fingerprinted,
      imageFailures: imageFailures + (listing.images.length && !references.length ? 1 : 0),
      queries: retrieval.queries,
      durationMs: Date.now() - started,
    },
  };
  if (!references.length) logWarn("source_finder_no_ebay_image", { itemId: listing.legacyItemId });
  return result;
}

function toCandidate(
  product: AliExpressProduct,
  currency: string,
  combined: ReturnType<typeof combineConfidence>,
  text: { confidence: number; hardReject: boolean },
  visual: VisualComparison | null,
  byImage: boolean,
  gated: ReturnType<typeof gateSource>,
): SourceCandidate {
  return {
    productId: product.productId,
    title: product.title,
    url: product.url,
    affiliateUrl: product.affiliateUrl ?? null,
    imageUrl: product.imageUrl ?? null,
    priceMinor: product.priceMinor,
    currency,
    rating: product.rating ?? null,
    reviewCount: product.reviewCount ?? null,
    orderCount: product.orderCount ?? null,
    confidence: combined.confidence,
    tier: combined.tier,
    textScore: text.confidence,
    visual,
    reasons: combined.reasons,
    hardReject: text.hardReject,
    retrievedByImage: byImage,
    estimatedProfitMinor: gated.profit.estimatedProfitMinor,
    marginPct: Math.round(gated.profit.profitMarginPercent * 10) / 10,
    shippingMinor: gated.shippingMinor,
    shippingEstimated: gated.shippingEstimated,
    meetsGate: gated.passed,
    gateReasons: gated.reasons,
  };
}

/** Run a lookup and save it (new row, or overwrite `lookupId` on re-run). Never throws for user errors. */
export async function runSourceLookup(workspaceId: string, url: string, lookupId?: string) {
  const base = { workspaceId, ebayUrl: url.trim() };
  try {
    const result = await findAliExpressSources(workspaceId, url);
    const best = result.candidates[0];
    const data = {
      ...base,
      ebayItemId: result.ebay.itemId,
      marketplaceId: result.ebay.marketplaceId,
      currency: result.ebay.currency,
      title: result.ebay.title,
      imageUrl: result.ebay.images[0] ?? null,
      priceMinor: result.ebay.priceMinor,
      status: best ? "ok" : "no_candidates",
      bestConfidence: best?.confidence ?? null,
      bestTier: best?.tier ?? null,
      resultJson: JSON.stringify(result),
      error: null,
    };
    logInfo("source_lookup", { workspaceId, itemId: result.ebay.itemId, best: best?.confidence, ms: result.stats.durationMs });
    return lookupId ? prisma.sourceLookup.update({ where: { id: lookupId }, data }) : prisma.sourceLookup.create({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof Error && (error.name === "ConfigError" || error.name === "EbayAccessError")) throw error;
    const data = { ...base, status: "failed", error: message.slice(0, 500), bestConfidence: null, bestTier: null };
    return lookupId ? prisma.sourceLookup.update({ where: { id: lookupId }, data }) : prisma.sourceLookup.create({ data });
  }
}
