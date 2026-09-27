import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { HuntSettingsValues } from "./providers";

export type ListingView = "winners" | "watching" | "all";
export type ListingSort = "sold" | "profit" | "margin" | "newest";

export interface ListingQuery {
  view: ListingView;
  huntId?: string;
  q?: string;
  minSold?: number;
  minRating?: number;
  sort: ListingSort;
  page: number;
  pageSize: number;
}

export function parseListingQuery(params: URLSearchParams): ListingQuery {
  const view = (["winners", "watching", "all"] as const).find((v) => v === params.get("view")) ?? "winners";
  const sort = (["sold", "profit", "margin", "newest"] as const).find((v) => v === params.get("sort")) ?? "sold";
  const num = (key: string) => {
    const raw = params.get(key);
    if (raw == null || raw === "") return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    view,
    sort,
    huntId: params.get("huntId") || undefined,
    q: params.get("q")?.trim() || undefined,
    minSold: num("minSold"),
    minRating: num("minRating"),
    page: Math.max(1, Math.floor(num("page") ?? 1)),
    pageSize: Math.min(200, Math.max(10, Math.floor(num("pageSize") ?? 50))),
  };
}

export function buildListingWhere(workspaceId: string, query: ListingQuery, settings: HuntSettingsValues): Prisma.TrackedListingWhereInput {
  const minSold = query.minSold ?? settings.minSold30d;
  const minRating = query.minRating ?? settings.minAeRating;
  const qualifyingSource: Prisma.SourceMatchWhereInput = { rating: { gte: minRating } };
  const winner: Prisma.TrackedListingWhereInput = {
    sold30d: { gte: minSold },
    demandTier: { in: ["PROJECTED", "VERIFIED"] },
    sources: { some: qualifyingSource },
  };

  const and: Prisma.TrackedListingWhereInput[] = [{ workspaceId }];
  if (query.huntId) and.push({ huntId: query.huntId });
  if (query.q) and.push({ OR: [{ title: { contains: query.q, mode: "insensitive" } }, { keyword: { contains: query.q, mode: "insensitive" } }] });
  if (query.view === "winners") and.push(winner);
  if (query.view === "watching") and.push({ active: true }, { NOT: winner });
  return { AND: and };
}

function orderBy(sort: ListingSort): Prisma.TrackedListingOrderByWithRelationInput[] {
  if (sort === "newest") return [{ createdAt: "desc" }];
  // Profit / margin sorting happens in memory on the best source (see listListings).
  return [{ sold30d: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }];
}

export async function listListings(workspaceId: string, query: ListingQuery, settings: HuntSettingsValues) {
  const where = buildListingWhere(workspaceId, query, settings);
  const minRating = query.minRating ?? settings.minAeRating;
  const byProfit = query.sort === "profit" || query.sort === "margin";
  // Profit sorting needs the whole filtered set (sorted in memory); cap it to keep the query cheap.
  const skip: number = byProfit ? 0 : (query.page - 1) * query.pageSize;
  const take: number = byProfit ? 1000 : query.pageSize;

  const [total, rows, counts] = await Promise.all([
    prisma.trackedListing.count({ where }),
    prisma.trackedListing.findMany({
      where,
      orderBy: orderBy(query.sort),
      skip,
      take,
      include: {
        sources: { where: { rating: { gte: minRating } }, orderBy: { rank: "asc" }, take: 1 },
        _count: { select: { sources: true, snapshots: true } },
      },
    }),
    Promise.all(
      (["winners", "watching", "all"] as const).map((view) =>
        prisma.trackedListing.count({ where: buildListingWhere(workspaceId, { ...query, view }, settings) }),
      ),
    ),
  ]);

  let items = rows.map(({ sources, _count, ...listing }) => ({
    ...listing,
    bestSource: sources[0] ?? null,
    sourceCount: _count.sources,
    snapshotCount: _count.snapshots,
  }));

  if (byProfit) {
    const key = query.sort === "profit" ? "netProfitMinor" : "marginPct";
    items = items
      .sort((a, b) => (b.bestSource?.[key] ?? Number.NEGATIVE_INFINITY) - (a.bestSource?.[key] ?? Number.NEGATIVE_INFINITY))
      .slice((query.page - 1) * query.pageSize, query.page * query.pageSize);
  }

  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
    counts: { winners: counts[0], watching: counts[1], all: counts[2] },
  };
}
