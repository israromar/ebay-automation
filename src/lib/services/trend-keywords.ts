import { prisma } from "@/lib/db";
import { US_TRENDING_KEYWORD_CATALOG } from "@/lib/research/us-trending-keywords";

export interface TrendLibraryKeyword {
  id: string;
  rank: number;
  keyword: string;
  niche: string;
  momentum: string;
  sources: string[];
  why: string;
}

export interface TrendLibraryResponse {
  market: string;
  version: string;
  researchedAt: string;
  sources: string[];
  snapshotId: string;
  keywords: TrendLibraryKeyword[];
}

function parseJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function toResponse(snapshot: { id: string; market: string; version: string; researchedAt: Date; sourcesJson: string; keywords: { id: string; rank: number; keyword: string; niche: string; momentum: string; sourcesJson: string; why: string }[] }): TrendLibraryResponse {
  return {
    market: snapshot.market,
    version: snapshot.version,
    researchedAt: snapshot.researchedAt.toISOString(),
    sources: parseJsonArray(snapshot.sourcesJson),
    snapshotId: snapshot.id,
    keywords: snapshot.keywords
      .slice()
      .sort((a, b) => a.rank - b.rank)
      .map((entry) => ({
        id: entry.id,
        rank: entry.rank,
        keyword: entry.keyword,
        niche: entry.niche,
        momentum: entry.momentum,
        sources: parseJsonArray(entry.sourcesJson),
        why: entry.why,
      })),
  };
}

export async function refreshTrendKeywordsFromCatalog(market = "US"): Promise<TrendLibraryResponse> {
  const catalog = US_TRENDING_KEYWORD_CATALOG;
  if (catalog.market !== market) {
    throw new Error(`No curated catalog for market ${market}`);
  }

  const snapshot = await prisma.$transaction(async (tx) => {
    const created = await tx.trendKeywordSnapshot.create({
      data: {
        market: catalog.market,
        version: catalog.version,
        researchedAt: new Date(catalog.researchedAt),
        sourcesJson: JSON.stringify(catalog.sources),
        keywords: {
          create: catalog.keywords.map((entry) => ({
            rank: entry.rank,
            keyword: entry.keyword,
            niche: entry.niche,
            momentum: entry.momentum,
            sourcesJson: JSON.stringify(entry.sources),
            why: entry.why,
          })),
        },
      },
      include: { keywords: true },
    });
    return created;
  });

  return toResponse(snapshot);
}

export async function getLatestTrendKeywords(market = "US"): Promise<TrendLibraryResponse> {
  const existing = await prisma.trendKeywordSnapshot.findFirst({
    where: { market },
    orderBy: { createdAt: "desc" },
    include: { keywords: true },
  });

  if (existing && existing.keywords.length > 0) {
    return toResponse(existing);
  }

  return refreshTrendKeywordsFromCatalog(market);
}
