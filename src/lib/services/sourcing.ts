import { prisma } from "@/lib/db";
import { buildAliExpressSearchQueries } from "@/lib/domain/matching";
import { selectTopSources, type GatedSource, type GateReason, type SourcingRules } from "@/lib/domain/sourcing";
import type { AliExpressProduct } from "@/lib/domain/types";
import { logWarn } from "@/lib/logger";
import type { AliExpressProvider } from "@/lib/providers/types";

const MAX_QUERIES = 2;

/**
 * Pull AliExpress candidates for one eBay title. Calls run in parallel so a listing
 * sources in ~2–4s (serverless requests are capped at 60s).
 */
export async function retrieveAliExpressCandidates(
  ae: AliExpressProvider,
  input: { title: string; keyword: string; imageUrl?: string | null },
): Promise<{ products: AliExpressProduct[]; queries: string[]; errors: string[] }> {
  const queries = buildAliExpressSearchQueries(input.title, input.keyword).slice(0, MAX_QUERIES);
  const calls: Array<Promise<AliExpressProduct[]>> = [];

  for (const query of queries) {
    calls.push(ae.searchProducts({ keyword: query, limit: 50, shipToCountry: "US", currency: "USD" }));
    if (process.env.ALIEXPRESS_HOTPRODUCT_ENABLED !== "false" && ae.searchHotProducts) {
      calls.push(ae.searchHotProducts({ keyword: query, limit: 25, shipToCountry: "US", currency: "USD" }));
    }
  }
  if (process.env.ALIEXPRESS_SMARTMATCH_ENABLED !== "false" && ae.searchSmartMatch && queries[0]) {
    calls.push(ae.searchSmartMatch({ keywords: queries[0], limit: 20, shipToCountry: "US", currency: "USD" }));
  }
  if (process.env.ALIEXPRESS_IMAGE_SEARCH_ENABLED === "true" && input.imageUrl && ae.searchProductsByImage) {
    calls.push(ae.searchProductsByImage({ imageUrl: input.imageUrl, limit: 50, shipToCountry: "US", currency: "USD" }));
  }

  const settled = await Promise.allSettled(calls);
  const products = new Map<string, AliExpressProduct>();
  const errors: string[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") {
      for (const p of result.value) if (p.productId && !products.has(p.productId)) products.set(p.productId, p);
    } else {
      errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
    }
  }
  // Every call failing means AliExpress is down or misconfigured — surface it instead of "no sources".
  if (products.size === 0 && errors.length === settled.length && errors.length > 0) {
    throw new Error(`AliExpress search failed: ${errors[0]}`);
  }
  if (errors.length) logWarn("aliexpress_partial_failure", { title: input.title, errors: errors.slice(0, 3) });
  return { products: [...products.values()], queries, errors };
}

export interface SourcingOutcome {
  listingId: string;
  sourced: number;
  considered: number;
  rejected: Record<GateReason, number>;
}

/** Find, gate and persist the top 3 AliExpress sources for one tracked listing. */
export async function sourceListing(
  ae: AliExpressProvider,
  listing: { id: string; title: string; keyword: string; imageUrl: string | null; priceMinor: number; shippingMinor: number | null; avgSoldPriceMinor: number | null },
  rules: SourcingRules,
): Promise<SourcingOutcome> {
  // Terapeak rows without a live listing carry only an average sold price.
  const sellPrice = listing.priceMinor > 0 ? listing.priceMinor : (listing.avgSoldPriceMinor ?? 0);
  const { products } = await retrieveAliExpressCandidates(ae, listing);
  const { passed, rejected, considered } = selectTopSources(
    { title: listing.title, priceMinor: sellPrice, shippingMinor: listing.priceMinor > 0 ? listing.shippingMinor : 0 },
    products,
    listing.keyword,
    rules,
  );
  await saveSources(listing.id, passed);
  return { listingId: listing.id, sourced: passed.length, considered, rejected };
}

export async function saveSources(listingId: string, sources: GatedSource[]) {
  const now = new Date();
  await prisma.$transaction([
    prisma.sourceMatch.deleteMany({ where: { listingId } }),
    prisma.sourceMatch.createMany({
      data: sources.map((s, index) => ({
        listingId,
        rank: index + 1,
        aeProductId: s.product.productId,
        title: s.product.title,
        url: s.product.url,
        imageUrl: s.product.imageUrl ?? null,
        priceMinor: s.product.priceMinor,
        shippingMinor: s.shippingMinor,
        shippingEstimated: s.shippingEstimated,
        rating: s.product.rating ?? 0,
        reviewCount: s.product.reviewCount ?? 0,
        orderCount: s.product.orderCount ?? 0,
        matchConfidence: s.match.confidence,
        matchReasonsJson: JSON.stringify(s.match.reasons),
        totalCostMinor: s.profit.totalEstimatedCostMinor,
        feesMinor: s.profit.marketplaceFeesMinor,
        netProfitMinor: s.profit.estimatedProfitMinor,
        marginPct: Math.round(s.profit.profitMarginPercent * 10) / 10,
        checkedAt: now,
      })),
    }),
    prisma.trackedListing.update({ where: { id: listingId }, data: { sourcedAt: now } }),
  ]);
}

/** Run async work over items with bounded concurrency, stopping new work after the deadline. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
  deadline = Number.POSITIVE_INFINITY,
): Promise<Array<PromiseSettledResult<R> | undefined>> {
  const results: Array<PromiseSettledResult<R> | undefined> = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length && Date.now() < deadline) {
      const index = next++;
      try {
        results[index] = { status: "fulfilled", value: await fn(items[index]!) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
