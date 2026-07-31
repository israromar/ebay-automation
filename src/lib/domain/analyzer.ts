import { calculateProfit } from "@/lib/domain/profit";
import { opportunityScore } from "@/lib/domain/trend-scoring";
import type { EbayDemandResult, EbayListing, QualificationRules } from "@/lib/domain/types";

export type SoldSourceLabel = "verified_30d" | "insights" | "browse_estimate" | "unavailable";

export type AnalyzerMatrixKey =
  | "demand"
  | "competition"
  | "marketTrend"
  | "profitability"
  | "supplierStability"
  | "risk";

export interface AnalyzerMatrixRow {
  key: AnalyzerMatrixKey;
  label: string;
  score: number; // 0–100
  tone: "good" | "warn" | "bad" | "neutral";
  note: string;
}

export interface AnalyzerListingView {
  itemId: string;
  title: string;
  url: string;
  imageUrl: string | null;
  priceMinor: number;
  shippingMinor: number | null;
  currency: string;
  condition: string | null;
  sellerUsername: string | null;
  sellerLocation: string | null;
  categoryId: string | null;
  estimatedSoldQuantity: number | null;
}

export interface AnalyzerMarketContext {
  activeListingCount: number;
  priceMinMinor: number | null;
  priceMaxMinor: number | null;
  priceMedianMinor: number | null;
  avgPriceMinor: number | null;
  searchKeyword: string | null;
}

export interface AnalyzerDemandView {
  soldLast30Days: number | null;
  avgCompletedSaleMinor: number | null;
  medianCompletedSaleMinor: number | null;
  source: SoldSourceLabel;
  demandVerified: boolean;
  note: string;
}

export interface AnalyzerSupplierView {
  productId: string | null;
  title: string | null;
  url: string | null;
  priceMinor: number | null;
  shippingMinor: number | null;
  rating: number | null;
  reviewCount: number | null;
  orderCount: number | null;
  matchConfidence: number | null;
}

export interface AnalyzerProfitView {
  ebayPriceMinor: number;
  cogsMinor: number;
  shippingMinor: number;
  feesMinor: number;
  netProfitMinor: number;
  marginPercent: number;
  roiPercent: number;
  feeRate: number;
}

export interface AnalyzerView {
  listing: AnalyzerListingView;
  overallScore: number;
  scoreLabel: string;
  scoreNote: string;
  matrix: AnalyzerMatrixRow[];
  market: AnalyzerMarketContext;
  demand: AnalyzerDemandView;
  supplier: AnalyzerSupplierView | null;
  profit: AnalyzerProfitView | null;
  guidance: string;
  ideaId: string | null;
  candidateId: string | null;
}

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function toneFor(score: number, invert = false): AnalyzerMatrixRow["tone"] {
  const s = invert ? 100 - score : score;
  if (s >= 70) return "good";
  if (s >= 40) return "warn";
  if (s > 0) return "bad";
  return "neutral";
}

export function labelSoldSource(source: string | null | undefined, demandVerified: boolean): SoldSourceLabel {
  if (demandVerified) return "verified_30d";
  if (!source) return "unavailable";
  const s = source.toLowerCase();
  if (s.includes("insight")) return "insights";
  if (s.includes("browse") || s.includes("estimate")) return "browse_estimate";
  if (s.includes("purchase") || s.includes("manual") || s.includes("verified")) return "verified_30d";
  return "unavailable";
}

export function demandNote(source: SoldSourceLabel): string {
  switch (source) {
    case "verified_30d":
      return "Verified 30-day sold (Insights, purchase history, or manual).";
    case "insights":
      return "Marketplace Insights sold signal — treat as provisional until confirmed.";
    case "browse_estimate":
      return "Browse lifetime sold estimate — not last-30-day sales.";
    default:
      return "Demand not verified. Insights unavailable; use purchase-history fetch or manual entry.";
  }
}

export function buildOpportunityMatrix(input: {
  overallScore: number;
  activeListingCount: number;
  demandSold: number | null;
  demandSource: SoldSourceLabel;
  marginPercent: number | null;
  supplierRating: number | null;
  supplierOrders: number | null;
  hasSupplier: boolean;
}): AnalyzerMatrixRow[] {
  const competitionRaw = input.activeListingCount <= 0 ? 0 : clamp(100 - Math.min(90, input.activeListingCount * 2));
  const demandRaw =
    input.demandSource === "unavailable"
      ? clamp(input.overallScore * 0.55)
      : input.demandSold == null
        ? clamp(input.overallScore * 0.6)
        : clamp(20 + Math.min(80, input.demandSold * 3));

  const trendRaw = clamp(input.overallScore * 0.9 + (input.demandSource === "browse_estimate" ? -5 : 5));
  const profitRaw = input.marginPercent == null ? 0 : clamp(input.marginPercent * 2.5);
  const supplierRaw = !input.hasSupplier
    ? 0
    : clamp(
        (input.supplierRating != null ? (input.supplierRating / 5) * 60 : 20) +
          (input.supplierOrders != null ? Math.min(40, input.supplierOrders / 50) : 10),
      );
  // Soft risk: high competition + no verified demand raises risk score (higher = worse in UI).
  const riskRaw = clamp(
    (input.activeListingCount > 40 ? 35 : input.activeListingCount > 20 ? 20 : 10) +
      (input.demandSource === "unavailable" ? 40 : input.demandSource === "browse_estimate" ? 25 : 5) +
      (!input.hasSupplier ? 15 : 0),
  );

  return [
    {
      key: "demand",
      label: "Demand",
      score: demandRaw,
      tone: toneFor(demandRaw),
      note: input.demandSource === "unavailable" ? "Proxy until sold verified" : "From sold / proxy signals",
    },
    {
      key: "competition",
      label: "Competition",
      score: competitionRaw,
      tone: toneFor(competitionRaw),
      note: `${input.activeListingCount || "—"} active listings in cluster`,
    },
    {
      key: "marketTrend",
      label: "Market trend",
      score: trendRaw,
      tone: toneFor(trendRaw),
      note: "Derived from opportunity score + demand source",
    },
    {
      key: "profitability",
      label: "Profitability",
      score: profitRaw,
      tone: toneFor(profitRaw),
      note: input.marginPercent == null ? "Needs AE source + costs" : `Est. margin ${input.marginPercent.toFixed(1)}%`,
    },
    {
      key: "supplierStability",
      label: "Supplier stability",
      score: supplierRaw,
      tone: toneFor(supplierRaw),
      note: input.hasSupplier ? "From AliExpress rating / orders" : "No AE match yet",
    },
    {
      key: "risk",
      label: "Risk assessment",
      score: riskRaw,
      tone: toneFor(riskRaw, true),
      note: "Soft operational risk — not VeRO/trademark",
    },
  ];
}

export function scoreLabel(score: number, demandVerified: boolean): string {
  if (demandVerified && score >= 70) return "Promising opportunity";
  if (score >= 70) return "Promising (unverified demand)";
  if (score >= 45) return "Needs review";
  return "Weak / crowded";
}

export function buildGuidance(view: Pick<AnalyzerView, "overallScore" | "demand" | "supplier" | "profit" | "market">): string {
  const parts: string[] = [];
  if (view.demand.source === "unavailable") {
    parts.push("Verify 30-day sold (Insights or purchase history) before approving.");
  } else if (view.demand.source === "browse_estimate") {
    parts.push("Sold shown as Browse life estimate — confirm true 30d demand before sourcing.");
  }
  if (!view.supplier) {
    parts.push("Run AE match to estimate supplier cost and net margin.");
  } else if (view.profit && view.profit.marginPercent < 10) {
    parts.push("Margin looks thin after fees — renegotiate shipping or skip.");
  } else if (view.profit && view.profit.marginPercent >= 15) {
    parts.push("Economics look workable if demand holds — sample order and watch top comps.");
  }
  if (view.market.activeListingCount > 40) {
    parts.push("Cluster is competitive; differentiation or a tighter keyword may help.");
  }
  if (parts.length === 0) {
    parts.push(
      view.overallScore >= 70
        ? "Solid Browse proxy score — confirm demand and kit match, then track in Candidates."
        : "Moderate signal — compare comps and supplier options before committing inventory.",
    );
  }
  return parts.join(" ");
}

export function buildAnalyzerProfit(input: {
  ebayPriceMinor: number;
  cogsMinor: number;
  shippingMinor: number;
  rules: Pick<QualificationRules, "ebayFeeRate" | "promotedListingRate" | "additionalSourcingCostMinor" | "expectedReturnCostMinor" | "expectedRefundCostMinor" | "otherFixedCostsMinor" | "otherPercentageCost">;
}): AnalyzerProfitView {
  const result = calculateProfit({
    expectedSellingPriceMinor: input.ebayPriceMinor,
    aliexpressItemPriceMinor: input.cogsMinor,
    aliexpressShippingCostMinor: input.shippingMinor,
    additionalSourcingCostMinor: input.rules.additionalSourcingCostMinor,
    ebayFeeRate: input.rules.ebayFeeRate,
    promotedListingRate: input.rules.promotedListingRate,
    expectedReturnCostMinor: input.rules.expectedReturnCostMinor,
    expectedRefundCostMinor: input.rules.expectedRefundCostMinor,
    otherFixedCostsMinor: input.rules.otherFixedCostsMinor,
    otherPercentageCost: input.rules.otherPercentageCost,
  });
  return {
    ebayPriceMinor: input.ebayPriceMinor,
    cogsMinor: input.cogsMinor,
    shippingMinor: input.shippingMinor,
    feesMinor: result.marketplaceFeesMinor + result.promotedListingFeeMinor,
    netProfitMinor: result.estimatedProfitMinor,
    marginPercent: result.profitMarginPercent,
    roiPercent: result.returnOnCostPercent,
    feeRate: input.rules.ebayFeeRate,
  };
}

export function buildAnalyzerView(input: {
  listing: EbayListing;
  clusterListings?: EbayListing[];
  searchKeyword?: string | null;
  demand?: EbayDemandResult | null;
  soldLast30Days?: number | null;
  soldCountSource?: string | null;
  demandVerified?: boolean;
  supplier?: {
    productId?: string | null;
    title?: string | null;
    url?: string | null;
    priceMinor?: number | null;
    shippingMinor?: number | null;
    rating?: number | null;
    reviewCount?: number | null;
    orderCount?: number | null;
    matchConfidence?: number | null;
  } | null;
  rules?: QualificationRules | null;
  ideaId?: string | null;
  candidateId?: string | null;
  /** Override Browse cluster size when known from TrendIdea. */
  activeListingCount?: number | null;
  priceMinMinor?: number | null;
  priceMaxMinor?: number | null;
  priceMedianMinor?: number | null;
  overallScoreOverride?: number | null;
}): AnalyzerView {
  const cluster = input.clusterListings ?? [];
  const prices = cluster.map((l) => l.priceMinor).filter((p) => p > 0);
  const priceMin = input.priceMinMinor ?? (prices.length ? Math.min(...prices) : input.listing.priceMinor);
  const priceMax = input.priceMaxMinor ?? (prices.length ? Math.max(...prices) : input.listing.priceMinor);
  const priceMedian =
    input.priceMedianMinor ??
    (prices.length
      ? [...prices].sort((a, b) => a - b)[Math.floor(prices.length / 2)]!
      : input.listing.priceMinor);
  const activeListingCount = input.activeListingCount ?? (cluster.length || 1);
  const avgPriceMinor = prices.length
    ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
    : input.listing.priceMinor;

  const overallScore =
    typeof input.overallScoreOverride === "number"
      ? clamp(input.overallScoreOverride)
      : opportunityScore({
          clusterSize: activeListingCount,
          priceMinMinor: priceMin,
          priceMaxMinor: priceMax,
          priceMedianMinor: priceMedian,
          listingPriceMinor: input.listing.priceMinor,
        });

  const demandVerified = Boolean(input.demandVerified);
  let soldLast30Days = input.soldLast30Days ?? null;
  let soldSource = labelSoldSource(input.soldCountSource, demandVerified);

  if (soldLast30Days == null && input.demand?.available && typeof input.demand.soldLast30Days === "number") {
    soldLast30Days = input.demand.soldLast30Days;
    soldSource = labelSoldSource(input.demand.source ?? "insights", false);
  }
  if (soldLast30Days == null && typeof input.listing.estimatedSoldQuantity === "number") {
    soldLast30Days = input.listing.estimatedSoldQuantity;
    soldSource = "browse_estimate";
  }
  if (soldLast30Days == null) soldSource = demandVerified ? "verified_30d" : "unavailable";

  const supplier = input.supplier?.url || input.supplier?.productId
    ? {
        productId: input.supplier.productId ?? null,
        title: input.supplier.title ?? null,
        url: input.supplier.url ?? null,
        priceMinor: input.supplier.priceMinor ?? null,
        shippingMinor: input.supplier.shippingMinor ?? null,
        rating: input.supplier.rating ?? null,
        reviewCount: input.supplier.reviewCount ?? null,
        orderCount: input.supplier.orderCount ?? null,
        matchConfidence: input.supplier.matchConfidence ?? null,
      }
    : null;

  const profit =
    supplier && typeof supplier.priceMinor === "number" && input.rules
      ? buildAnalyzerProfit({
          ebayPriceMinor: input.listing.priceMinor,
          cogsMinor: supplier.priceMinor,
          shippingMinor: typeof supplier.shippingMinor === "number" ? supplier.shippingMinor : 0,
          rules: input.rules,
        })
      : null;

  const demand: AnalyzerDemandView = {
    soldLast30Days,
    avgCompletedSaleMinor: input.demand?.avgCompletedSaleMinor ?? null,
    medianCompletedSaleMinor: input.demand?.medianCompletedSaleMinor ?? null,
    source: soldSource,
    demandVerified,
    note: demandNote(soldSource),
  };

  const market: AnalyzerMarketContext = {
    activeListingCount,
    priceMinMinor: priceMin,
    priceMaxMinor: priceMax,
    priceMedianMinor: priceMedian,
    avgPriceMinor,
    searchKeyword: input.searchKeyword ?? null,
  };

  const matrix = buildOpportunityMatrix({
    overallScore,
    activeListingCount,
    demandSold: demand.source === "browse_estimate" ? null : demand.soldLast30Days,
    demandSource: demand.source,
    marginPercent: profit?.marginPercent ?? null,
    supplierRating: supplier?.rating ?? null,
    supplierOrders: supplier?.orderCount ?? null,
    hasSupplier: Boolean(supplier),
  });

  const listing: AnalyzerListingView = {
    itemId: input.listing.itemId,
    title: input.listing.title,
    url: input.listing.url,
    imageUrl: input.listing.imageUrl ?? null,
    priceMinor: input.listing.priceMinor,
    shippingMinor: input.listing.shippingMinor ?? null,
    currency: input.listing.currency,
    condition: input.listing.condition ?? null,
    sellerUsername: input.listing.sellerUsername ?? null,
    sellerLocation: input.listing.sellerLocation ?? null,
    categoryId: input.listing.categoryId ?? null,
    estimatedSoldQuantity: input.listing.estimatedSoldQuantity ?? null,
  };

  const base = {
    listing,
    overallScore,
    scoreLabel: scoreLabel(overallScore, demandVerified),
    scoreNote: demandVerified
      ? "Score with verified demand context"
      : "Browse proxy score — not verified 30-day sales velocity",
    matrix,
    market,
    demand,
    supplier,
    profit,
    ideaId: input.ideaId ?? null,
    candidateId: input.candidateId ?? null,
    guidance: "",
  };
  return { ...base, guidance: buildGuidance(base) };
}

export interface AnalyzerNicheRow {
  niche: string;
  keywordCount: number;
  topKeyword: string;
  momentum: string;
}

export interface AnalyzerProductRow {
  id: string;
  title: string;
  ebayItemId: string;
  ebayUrl: string | null;
  imageUrl: string | null;
  searchKeyword: string | null;
  score: number;
  priceMinor: number;
  activeListingCount: number;
  soldLast30Days: number | null;
  soldCountSource: string | null;
  status: string;
  productCandidateId: string | null;
}

export interface AnalyzerSellerRow {
  sellerUsername: string;
  listingCount: number;
  avgPriceMinor: number;
  minPriceMinor: number;
  maxPriceMinor: number;
  sampleTitle: string | null;
  sampleItemId: string | null;
  sampleUrl: string | null;
}

export function aggregateNiches(
  keywords: Array<{ niche: string; keyword: string; momentum: string; rank: number }>,
): AnalyzerNicheRow[] {
  const map = new Map<string, { count: number; topKeyword: string; momentum: string; bestRank: number }>();
  for (const k of keywords) {
    const niche = k.niche.trim() || "Uncategorized";
    const cur = map.get(niche);
    if (!cur || k.rank < cur.bestRank) {
      map.set(niche, {
        count: (cur?.count ?? 0) + 1,
        topKeyword: k.keyword,
        momentum: k.momentum,
        bestRank: k.rank,
      });
    } else {
      cur.count += 1;
    }
  }
  return [...map.entries()]
    .map(([niche, v]) => ({
      niche,
      keywordCount: v.count,
      topKeyword: v.topKeyword,
      momentum: v.momentum,
    }))
    .sort((a, b) => b.keywordCount - a.keywordCount);
}

export function aggregateSellers(
  listings: Array<{
    sellerUsername: string | null;
    priceMinor: number;
    title: string;
    itemId: string;
    url: string | null;
  }>,
): AnalyzerSellerRow[] {
  const map = new Map<
    string,
    { count: number; sum: number; min: number; max: number; sampleTitle: string; sampleItemId: string; sampleUrl: string | null }
  >();
  for (const row of listings) {
    const name = row.sellerUsername?.trim();
    if (!name) continue;
    const cur = map.get(name);
    if (!cur) {
      map.set(name, {
        count: 1,
        sum: row.priceMinor,
        min: row.priceMinor,
        max: row.priceMinor,
        sampleTitle: row.title,
        sampleItemId: row.itemId,
        sampleUrl: row.url,
      });
    } else {
      cur.count += 1;
      cur.sum += row.priceMinor;
      cur.min = Math.min(cur.min, row.priceMinor);
      cur.max = Math.max(cur.max, row.priceMinor);
    }
  }
  return [...map.entries()]
    .map(([sellerUsername, v]) => ({
      sellerUsername,
      listingCount: v.count,
      avgPriceMinor: Math.round(v.sum / v.count),
      minPriceMinor: v.min,
      maxPriceMinor: v.max,
      sampleTitle: v.sampleTitle,
      sampleItemId: v.sampleItemId,
      sampleUrl: v.sampleUrl,
    }))
    .sort((a, b) => b.listingCount - a.listingCount || b.avgPriceMinor - a.avgPriceMinor);
}
