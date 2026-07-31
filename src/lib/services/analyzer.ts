import { z } from "zod";
import {
  aggregateNiches,
  aggregateSellers,
  buildAnalyzerView,
  type AnalyzerNicheRow,
  type AnalyzerProductRow,
  type AnalyzerSellerRow,
  type AnalyzerView,
} from "@/lib/domain/analyzer";
import { prisma } from "@/lib/db";
import { extractEbayItemId } from "@/lib/domain/ebay-sold-history";
import { createEbayProvider, loadWorkspaceRules } from "@/lib/services/providers";
import { getLatestTrendKeywords } from "@/lib/services/trend-keywords";

export const inspectBodySchema = z.object({
  query: z.string().min(1),
  ideaId: z.string().optional(),
  candidateId: z.string().optional(),
});

function keywordFromTitle(title: string): string {
  return title
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .slice(0, 6)
    .join(" ");
}

export async function inspectMarketItem(input: {
  workspaceId: string;
  query: string;
  ideaId?: string;
  candidateId?: string;
}): Promise<AnalyzerView> {
  const ebay = createEbayProvider();
  const rules = await loadWorkspaceRules(input.workspaceId);

  let idea =
    input.ideaId
      ? await prisma.trendIdea.findFirst({
          where: { id: input.ideaId, run: { workspaceId: input.workspaceId } },
          include: {
            productCandidate: true,
          },
        })
      : null;

  let candidate =
    input.candidateId
      ? await prisma.productCandidate.findFirst({
          where: { id: input.candidateId, scan: { project: { workspaceId: input.workspaceId } } },
        })
      : idea?.productCandidate ?? null;

  const rawQuery = input.query.trim();
  const itemId =
    extractEbayItemId(rawQuery) ??
    idea?.ebayItemId ??
    candidate?.ebayItemId ??
    null;

  if (!itemId && !idea) {
    // Keyword-only: search and take top listing as seed.
    const results = await ebay.searchProducts({ keyword: rawQuery, limit: 20 });
    if (results.length === 0) {
      throw new Error("No eBay listings found for that query.");
    }
    const seed = results[0]!;
    const demand = await ebay.getMarketDemand({ keyword: rawQuery, itemId: seed.itemId });
    const linkedIdea = await prisma.trendIdea.findFirst({
      where: { ebayItemId: seed.itemId, run: { workspaceId: input.workspaceId } },
      orderBy: { createdAt: "desc" },
      include: { productCandidate: true },
    });
    return buildAnalyzerView({
      listing: seed,
      clusterListings: results,
      searchKeyword: rawQuery,
      demand,
      soldLast30Days: linkedIdea?.soldLast30Days ?? null,
      soldCountSource: linkedIdea?.soldCountSource ?? null,
      demandVerified: linkedIdea?.productCandidate?.demandVerified ?? false,
      supplier: linkedIdea?.productCandidate
        ? {
            productId: linkedIdea.productCandidate.aliexpressProductId,
            title: linkedIdea.productCandidate.productName,
            url: linkedIdea.productCandidate.aliexpressUrl,
            priceMinor: linkedIdea.productCandidate.aliexpressPriceMinor,
            shippingMinor: linkedIdea.productCandidate.aliexpressShippingMinor,
            rating: linkedIdea.productCandidate.rating,
            reviewCount: linkedIdea.productCandidate.reviewCount,
            orderCount: linkedIdea.productCandidate.orderCount,
            matchConfidence: linkedIdea.productCandidate.matchConfidence,
          }
        : null,
      rules,
      ideaId: linkedIdea?.id ?? null,
      candidateId: linkedIdea?.productCandidateId ?? null,
      activeListingCount: linkedIdea?.activeListingCount ?? results.length,
      priceMinMinor: linkedIdea?.priceMinMinor,
      priceMaxMinor: linkedIdea?.priceMaxMinor,
      priceMedianMinor: linkedIdea?.priceMedianMinor,
      overallScoreOverride: linkedIdea?.score,
    });
  }

  const resolvedId = itemId ?? idea!.ebayItemId;
  let listing;
  try {
    listing = await ebay.getListingDetails(resolvedId);
  } catch {
    if (idea) {
      listing = {
        itemId: idea.ebayItemId,
        title: idea.title,
        url: idea.ebayUrl ?? `https://www.ebay.com/itm/${idea.ebayItemId}`,
        imageUrl: idea.imageUrl ?? undefined,
        priceMinor: idea.priceMinor,
        currency: idea.currency,
        categoryId: idea.categoryId ?? undefined,
        meta: {
          source: "trend_idea",
          confidence: 0.5,
          collectedAt: new Date().toISOString(),
          completeness: "partial" as const,
          warnings: ["Browse getItem failed; using stored trend idea"],
        },
      };
    } else {
      throw new Error("Unable to load eBay listing details.");
    }
  }

  if (!idea) {
    idea = await prisma.trendIdea.findFirst({
      where: { ebayItemId: listing.itemId, run: { workspaceId: input.workspaceId } },
      orderBy: { createdAt: "desc" },
      include: { productCandidate: true },
    });
    if (idea?.productCandidate) candidate = idea.productCandidate;
  }

  if (!candidate) {
    candidate = await prisma.productCandidate.findFirst({
      where: {
        ebayItemId: listing.itemId,
        scan: { project: { workspaceId: input.workspaceId } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  const searchKeyword = idea?.searchKeyword ?? keywordFromTitle(listing.title);
  const cluster = searchKeyword
    ? await ebay.searchProducts({ keyword: searchKeyword, limit: 25 }).catch(() => [])
    : [];

  const demand = await ebay.getMarketDemand({
    keyword: searchKeyword,
    itemId: listing.itemId,
    categoryId: listing.categoryId,
  });

  return buildAnalyzerView({
    listing,
    clusterListings: cluster.length > 0 ? cluster : [listing],
    searchKeyword,
    demand,
    soldLast30Days: candidate?.soldLast30Days ?? idea?.soldLast30Days ?? null,
    soldCountSource: idea?.soldCountSource ?? null,
    demandVerified: candidate?.demandVerified ?? false,
    supplier: candidate
      ? {
          productId: candidate.aliexpressProductId,
          title: candidate.productName,
          url: candidate.aliexpressUrl,
          priceMinor: candidate.aliexpressPriceMinor,
          shippingMinor: candidate.aliexpressShippingMinor,
          rating: candidate.rating,
          reviewCount: candidate.reviewCount,
          orderCount: candidate.orderCount,
          matchConfidence: candidate.matchConfidence,
        }
      : null,
    rules,
    ideaId: idea?.id ?? null,
    candidateId: candidate?.id ?? null,
    activeListingCount: idea?.activeListingCount ?? (cluster.length || 1),
    priceMinMinor: idea?.priceMinMinor,
    priceMaxMinor: idea?.priceMaxMinor,
    priceMedianMinor: idea?.priceMedianMinor,
    overallScoreOverride: idea?.score,
  });
}

export async function getAnalyzerMarket(workspaceId: string): Promise<{
  niches: AnalyzerNicheRow[];
  products: AnalyzerProductRow[];
  sellers: AnalyzerSellerRow[];
}> {
  const [library, ideas, listings] = await Promise.all([
    getLatestTrendKeywords("US").catch(() => null),
    prisma.trendIdea.findMany({
      where: { run: { workspaceId } },
      orderBy: [{ score: "desc" }, { createdAt: "desc" }],
      take: 60,
      select: {
        id: true,
        title: true,
        ebayItemId: true,
        ebayUrl: true,
        imageUrl: true,
        searchKeyword: true,
        score: true,
        priceMinor: true,
        activeListingCount: true,
        soldLast30Days: true,
        soldCountSource: true,
        status: true,
        productCandidateId: true,
      },
    }),
    prisma.ebayListing.findMany({
      where: { candidate: { scan: { project: { workspaceId } } } },
      orderBy: { collectedAt: "desc" },
      take: 500,
      select: {
        sellerUsername: true,
        priceMinor: true,
        title: true,
        itemId: true,
        url: true,
      },
    }),
  ]);

  const niches = library
    ? aggregateNiches(
        library.keywords.map((k) => ({
          niche: k.niche,
          keyword: k.keyword,
          momentum: k.momentum,
          rank: k.rank,
        })),
      )
    : [];

  const products: AnalyzerProductRow[] = ideas.map((idea) => ({
    id: idea.id,
    title: idea.title,
    ebayItemId: idea.ebayItemId,
    ebayUrl: idea.ebayUrl,
    imageUrl: idea.imageUrl,
    searchKeyword: idea.searchKeyword,
    score: idea.score,
    priceMinor: idea.priceMinor,
    activeListingCount: idea.activeListingCount,
    soldLast30Days: idea.soldLast30Days,
    soldCountSource: idea.soldCountSource,
    status: idea.status,
    productCandidateId: idea.productCandidateId,
  }));

  const sellers = aggregateSellers(listings);

  return { niches, products, sellers };
}
