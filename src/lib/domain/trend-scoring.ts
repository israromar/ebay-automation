import { jaccardSimilarity, normalizeTitle, tokenSet } from "./matching";
import type { EbayListing } from "./types";

export interface TrendResearchCriteria {
  minEbayPriceMinor?: number;
  maxEbayPriceMinor?: number;
  minActiveListings?: number;
  maxActiveListings?: number;
  clusterSimilarity?: number;
  topNPerKeyword?: number;
}

export const DEFAULT_TREND_CRITERIA: Required<TrendResearchCriteria> = {
  minEbayPriceMinor: 500,
  maxEbayPriceMinor: 15000,
  minActiveListings: 2,
  maxActiveListings: 40,
  clusterSimilarity: 0.45,
  topNPerKeyword: 15,
};

export interface ListingCluster {
  clusterKey: string;
  listings: EbayListing[];
  priceMinMinor: number;
  priceMaxMinor: number;
  priceMedianMinor: number;
}

export interface ScoredTrendIdea {
  ebayItemId: string;
  title: string;
  ebayUrl: string;
  imageUrl?: string;
  priceMinor: number;
  currency: string;
  categoryId?: string;
  searchKeyword: string;
  clusterKey: string;
  activeListingCount: number;
  priceMinMinor: number;
  priceMaxMinor: number;
  priceMedianMinor: number;
  score: number;
}

/**
 * Opportunity score (0–100) from Browse proxies — not sold counts.
 * - Cluster size: market signal / competition
 * - Price spread: clearer markets score higher
 * - Distance from median: better seed listing near typical price
 */
export function opportunityScore(input: {
  clusterSize: number;
  priceMinMinor: number;
  priceMaxMinor: number;
  priceMedianMinor: number;
  listingPriceMinor: number;
}): number {
  const sizePts = Math.min(40, input.clusterSize * 4);
  const median = Math.max(input.priceMedianMinor, 1);
  const spread = (input.priceMaxMinor - input.priceMinMinor) / median;
  const spreadPts = spread < 0.3 ? 30 : spread < 0.8 ? 20 : 10;
  const deviation = Math.abs(input.listingPriceMinor - input.priceMedianMinor) / median;
  const medianPts = Math.max(0, 30 * (1 - deviation * 2));
  return Math.round(Math.max(0, Math.min(100, sizePts + spreadPts + medianPts)));
}

export function clusterKeyFromTitle(title: string): string {
  return normalizeTitle(title)
    .split(" ")
    .filter((t) => t.length > 2)
    .slice(0, 5)
    .join("_");
}

export function medianMinor(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return sorted[mid];
}

/** Greedy clustering by Jaccard title similarity against cluster representative. */
export function clusterListings(listings: EbayListing[], similarityThreshold = DEFAULT_TREND_CRITERIA.clusterSimilarity): ListingCluster[] {
  const clusters: Array<{ key: string; repTokens: Set<string>; listings: EbayListing[] }> = [];

  for (const listing of listings) {
    const tokens = tokenSet(listing.title);
    let assigned = false;
    for (const cluster of clusters) {
      if (jaccardSimilarity(tokens, cluster.repTokens) >= similarityThreshold) {
        cluster.listings.push(listing);
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      clusters.push({
        key: clusterKeyFromTitle(listing.title) || listing.itemId,
        repTokens: tokens,
        listings: [listing],
      });
    }
  }

  return clusters.map((c) => {
    const prices = c.listings.map((l) => l.priceMinor);
    return {
      clusterKey: c.key,
      listings: c.listings,
      priceMinMinor: Math.min(...prices),
      priceMaxMinor: Math.max(...prices),
      priceMedianMinor: medianMinor(prices),
    };
  });
}

export function scoreClustersForKeyword(keyword: string, listings: EbayListing[], criteria: TrendResearchCriteria = {}): ScoredTrendIdea[] {
  const c = { ...DEFAULT_TREND_CRITERIA, ...criteria };
  const priced = listings.filter((l) => l.priceMinor >= c.minEbayPriceMinor && l.priceMinor <= c.maxEbayPriceMinor);
  const clusters = clusterListings(priced, c.clusterSimilarity);
  const ideas: ScoredTrendIdea[] = [];

  for (const cluster of clusters) {
    const active = cluster.listings.length;
    if (active < c.minActiveListings || active > c.maxActiveListings) continue;

    // Seed = listing closest to median price
    const seed = [...cluster.listings].sort(
      (a, b) => Math.abs(a.priceMinor - cluster.priceMedianMinor) - Math.abs(b.priceMinor - cluster.priceMedianMinor),
    )[0];
    if (!seed) continue;

    ideas.push({
      ebayItemId: seed.itemId,
      title: seed.title,
      ebayUrl: seed.url,
      imageUrl: seed.imageUrl,
      priceMinor: seed.priceMinor,
      currency: seed.currency,
      categoryId: seed.categoryId,
      searchKeyword: keyword,
      clusterKey: cluster.clusterKey,
      activeListingCount: active,
      priceMinMinor: cluster.priceMinMinor,
      priceMaxMinor: cluster.priceMaxMinor,
      priceMedianMinor: cluster.priceMedianMinor,
      score: opportunityScore({
        clusterSize: active,
        priceMinMinor: cluster.priceMinMinor,
        priceMaxMinor: cluster.priceMaxMinor,
        priceMedianMinor: cluster.priceMedianMinor,
        listingPriceMinor: seed.priceMinor,
      }),
    });
  }

  return ideas.sort((a, b) => b.score - a.score).slice(0, c.topNPerKeyword);
}
