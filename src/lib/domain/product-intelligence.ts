import { calculateMaxAcceptableSupplierCost, calculateProfit } from "@/lib/domain/profit";
import { isKnownShippingCost } from "@/lib/domain/source-ranking";
import type { CandidateStatus, QualificationRules } from "@/lib/domain/types";

export const OPPORTUNITY_WEIGHTS = {
  demand: 0.25,
  sellThrough: 0.15,
  competition: 0.15,
  profit: 0.2,
  supplier: 0.1,
  trend: 0.1,
  listingOpportunity: 0.05,
} as const;

export const RISK_PENALTY_WEIGHT = 0.15;

export const RESTRICTED_TITLE_PATTERNS: RegExp[] = [
  /\b(vape|vaping|e-?cigarette|nicotine)\b/i,
  /\b(cbd|thc|cannabis|marijuana)\b/i,
  /\b(counterfeit|replica|knock-?off)\b/i,
  /\b(prescription|rx only)\b/i,
  /\b(firearm|ammunition|\bammo\b)\b/i,
  /\bgift\s*cards?\b/i,
];

export const RESTRICTED_CATEGORY_IDS = new Set<string>();

const FRAGILE_PATTERNS = [/\b(glass|ceramic|porcelain|crystal)\b/i];
const HEAVY_PATTERNS = [/\b(furniture|treadmill|dumbbell)\b/i, /\b(oversized|oversize)\b/i];
const RETURN_COMPLEX_PATTERNS = [/\bcompatible with\b/i, /\boem\b/i];
const SEASON_PATTERNS = [/\b(halloween|christmas|easter|valentines?|valentine's|thanksgiving)\b/i];
const BRAND_MARK = /[®™]/;

export type TrendLabel = "accelerating" | "stable" | "declining" | "highly_seasonal" | "insufficient_data";
export type IntelligenceClassification = "strong_candidate" | "investigate" | "weak_candidate" | "reject";
export type IntelligenceStatus = "qualified" | "rejected" | "needs_evidence";

export interface SalesWindows {
  sold7d: number | null;
  sold30d: number | null;
  sold90d: number | null;
  sold365d: number | null;
}

export interface ProductResearchSnapshot {
  status: IntelligenceStatus;
  classification: IntelligenceClassification | null;
  opportunityScore: number | null;
  matchConfidence: number | null;
  demandScore: number | null;
  competitionScore: number | null;
  profitScore: number | null;
  supplierScore: number | null;
  trendScore: number | null;
  riskScore: number | null;
  sellThroughScore: number | null;
  listingOpportunityScore: number | null;
  ebay: {
    productId: string;
    title: string;
    expectedSellingPrice: number | null;
    sold30d: number | null;
    sold7d: number | null;
    sold90d: number | null;
    sold365d: number | null;
    salesVelocity30d: number | null;
    sellThroughRate: number | null;
    activeListings: number | null;
    sellerCount: number | null;
    topSellerListingShare: number | null;
    trend: TrendLabel;
  };
  supplier: {
    productId: string;
    title: string;
    rating: number | null;
    price: number | null;
    shipping: number | null;
    landedCost: number | null;
  } | null;
  economics: {
    estimatedFees: number | null;
    estimatedNetProfit: number | null;
    estimatedMargin: number | null;
    maxAcceptableSupplierCost: number | null;
  };
  reasons: string[];
  warnings: string[];
  rejectReasons: string[];
  rejectIds: string[];
}

export interface EbayQualificationInput {
  ebayItemId: string;
  ebayTitle: string;
  categoryId?: string | null;
  listingPriceMinor: number;
  priceMinMinor?: number | null;
  priceMaxMinor?: number | null;
  priceMedianMinor?: number | null;
  medianCompletedSaleMinor?: number | null;
  avgCompletedSaleMinor?: number | null;
  demandAvailable: boolean;
  demandSource?: string | null;
  sales: SalesWindows;
  activeListingCount?: number | null;
  sellerCount?: number | null;
  topSellerListingShare?: number | null;
  rules: QualificationRules;
}

export interface SupplierQualificationInput {
  productId: string;
  title: string;
  rating?: number | null;
  reviewCount?: number | null;
  orderCount?: number | null;
  priceMinor: number;
  shippingMinor?: number | null;
  matchConfidence: number;
  matchHardReject: boolean;
  matchRejectReasons: string[];
}

export interface EbaySideGate {
  proceed: boolean;
  expectedSellingPriceMinor: number;
  maxAcceptableSupplierCostMinor: number;
  sellThroughRate: number | null;
  trend: TrendLabel;
  rules: QualificationRules;
  snapshot: ProductResearchSnapshot;
}

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function isVerifiedDemandSource(source: string | null | undefined): boolean {
  if (!source) return false;
  const normalized = source.toLowerCase();
  if (normalized.includes("browse") || normalized.includes("estimate")) return false;
  return (
    normalized.includes("insight") || normalized.includes("purchase") || normalized.includes("manual") || normalized.includes("verified")
  );
}

export function resolveExpectedSellingPrice(input: {
  medianCompletedSaleMinor?: number | null;
  priceMedianMinor?: number | null;
  listingPriceMinor: number;
}): number {
  if (input.medianCompletedSaleMinor != null && input.medianCompletedSaleMinor > 0) return input.medianCompletedSaleMinor;
  if (input.priceMedianMinor != null && input.priceMedianMinor > 0) return input.priceMedianMinor;
  return input.listingPriceMinor;
}

export function sellThroughRate(sold30d: number | null, activeListingCount: number | null | undefined): number | null {
  if (sold30d == null || activeListingCount == null || activeListingCount <= 0) return null;
  return sold30d / activeListingCount;
}

export function classifySalesTrend(sales: SalesWindows): TrendLabel {
  if (sales.sold365d != null && sales.sold30d != null && sales.sold365d > 0 && sales.sold30d / sales.sold365d >= 0.35) {
    return "highly_seasonal";
  }
  if (sales.sold7d == null || sales.sold30d == null) return "insufficient_data";
  const rate7 = sales.sold7d / 7;
  const rate30 = sales.sold30d / 30;
  let trend: TrendLabel = "stable";
  if (rate30 === 0) trend = rate7 > 0 ? "accelerating" : "stable";
  else if (rate7 > rate30 * 1.25) trend = "accelerating";
  else if (rate7 < rate30 * 0.75) trend = "declining";
  if (sales.sold90d != null && sales.sold90d > 0) {
    const rate90 = sales.sold90d / 90;
    if (rate30 < rate90 * 0.75 && trend !== "accelerating") trend = "declining";
  }
  return trend;
}

export function findRestrictedMatch(title: string, categoryId?: string | null): string | null {
  if (categoryId && RESTRICTED_CATEGORY_IDS.has(categoryId)) return "restricted_category";
  for (const pattern of RESTRICTED_TITLE_PATTERNS) {
    if (pattern.test(title)) return pattern.source;
  }
  return null;
}

function emptyScores(): Pick<
  ProductResearchSnapshot,
  | "opportunityScore"
  | "matchConfidence"
  | "demandScore"
  | "competitionScore"
  | "profitScore"
  | "supplierScore"
  | "trendScore"
  | "riskScore"
  | "sellThroughScore"
  | "listingOpportunityScore"
> {
  return {
    opportunityScore: null,
    matchConfidence: null,
    demandScore: null,
    competitionScore: null,
    profitScore: null,
    supplierScore: null,
    trendScore: null,
    riskScore: null,
    sellThroughScore: null,
    listingOpportunityScore: null,
  };
}

function budgetFor(rules: QualificationRules, expectedSellingPriceMinor: number) {
  return calculateMaxAcceptableSupplierCost({
    expectedSellingPriceMinor,
    additionalSourcingCostMinor: rules.additionalSourcingCostMinor,
    ebayFeeRate: rules.ebayFeeRate,
    promotedListingRate: rules.promotedListingRate,
    expectedReturnCostMinor: rules.expectedReturnCostMinor,
    expectedRefundCostMinor: rules.expectedRefundCostMinor,
    otherFixedCostsMinor: rules.otherFixedCostsMinor,
    otherPercentageCost: rules.otherPercentageCost,
    minimumNetMarginPercent: rules.minimumNetMarginPercent,
    minimumProfitMinor: rules.minimumProfitMinor,
  });
}

function baseSnapshot(input: {
  ebay: EbayQualificationInput;
  expectedSellingPriceMinor: number;
  maxAcceptableSupplierCostMinor: number;
  sellThrough: number | null;
  trend: TrendLabel;
  verifiedSold30: number | null;
  warnings: string[];
}): ProductResearchSnapshot {
  const { ebay, verifiedSold30, sellThrough, trend } = input;
  return {
    status: "needs_evidence",
    classification: null,
    ...emptyScores(),
    ebay: {
      productId: ebay.ebayItemId,
      title: ebay.ebayTitle,
      expectedSellingPrice: input.expectedSellingPriceMinor,
      sold30d: verifiedSold30,
      sold7d: ebay.sales.sold7d,
      sold90d: ebay.sales.sold90d,
      sold365d: ebay.sales.sold365d,
      salesVelocity30d: verifiedSold30 == null ? null : verifiedSold30 / 30,
      sellThroughRate: sellThrough,
      activeListings: ebay.activeListingCount && ebay.activeListingCount > 0 ? ebay.activeListingCount : null,
      sellerCount: ebay.sellerCount ?? null,
      topSellerListingShare: ebay.topSellerListingShare ?? null,
      trend,
    },
    supplier: null,
    economics: {
      estimatedFees: null,
      estimatedNetProfit: null,
      estimatedMargin: null,
      maxAcceptableSupplierCost: input.maxAcceptableSupplierCostMinor,
    },
    reasons: [],
    warnings: input.warnings,
    rejectReasons: [],
    rejectIds: [],
  };
}

function contextWarnings(ebay: EbayQualificationInput, trend: TrendLabel): string[] {
  const warnings: string[] = [];
  if (SEASON_PATTERNS.some((pattern) => pattern.test(ebay.ebayTitle))) warnings.push("seasonal_keyword");
  if (ebay.sellerCount != null) warnings.push("seller_concentration_is_listing_share");
  if (trend === "insufficient_data") warnings.push("trend_insufficient_data");
  if (ebay.sales.sold90d == null) warnings.push("window_90d_unavailable");
  if (ebay.sales.sold365d == null) warnings.push("window_365d_unavailable");
  return warnings;
}

export function qualifyEbaySide(input: EbayQualificationInput): EbaySideGate {
  const expectedSellingPriceMinor = resolveExpectedSellingPrice(input);
  const maxAcceptableSupplierCostMinor = budgetFor(input.rules, expectedSellingPriceMinor);
  const verified = input.demandAvailable && isVerifiedDemandSource(input.demandSource);
  const verifiedSold30 = verified ? (input.sales.sold30d ?? null) : null;
  const trend = classifySalesTrend({
    sold7d: verified ? input.sales.sold7d : null,
    sold30d: verifiedSold30,
    sold90d: verified ? input.sales.sold90d : null,
    sold365d: verified ? input.sales.sold365d : null,
  });
  const active = input.activeListingCount && input.activeListingCount > 0 ? input.activeListingCount : null;
  const sellThrough = sellThroughRate(verifiedSold30, active);
  const warnings = contextWarnings(input, trend);
  if (sellThrough == null) warnings.push("sell_through_unavailable");

  const snapshot = baseSnapshot({
    ebay: input,
    expectedSellingPriceMinor,
    maxAcceptableSupplierCostMinor,
    sellThrough,
    trend,
    verifiedSold30,
    warnings,
  });

  const restricted = findRestrictedMatch(input.ebayTitle, input.categoryId);
  if (restricted) {
    snapshot.status = "rejected";
    snapshot.classification = "reject";
    snapshot.rejectIds = ["RESTRICTED_PRODUCT"];
    snapshot.rejectReasons = [`Restricted product signal: ${restricted}`];
    return {
      proceed: false,
      expectedSellingPriceMinor,
      maxAcceptableSupplierCostMinor,
      sellThroughRate: sellThrough,
      trend,
      rules: input.rules,
      snapshot,
    };
  }

  if (!verified || verifiedSold30 == null) {
    snapshot.status = "needs_evidence";
    snapshot.rejectIds = ["EBAY_SOLD_HISTORY_UNAVAILABLE"];
    snapshot.rejectReasons = ["Verified 30-day sales are unavailable. Browse lifetime estimates do not qualify."];
    snapshot.warnings.push("demand_not_verified");
    return {
      proceed: false,
      expectedSellingPriceMinor,
      maxAcceptableSupplierCostMinor,
      sellThroughRate: sellThrough,
      trend,
      rules: input.rules,
      snapshot,
    };
  }

  if (verifiedSold30 < input.rules.minimumRecentSales) {
    snapshot.status = "rejected";
    snapshot.classification = "reject";
    snapshot.rejectIds = ["EBAY_RECENT_SALES_TOO_LOW"];
    snapshot.rejectReasons = [`Verified 30-day sales ${verifiedSold30} are below ${input.rules.minimumRecentSales}.`];
    return {
      proceed: false,
      expectedSellingPriceMinor,
      maxAcceptableSupplierCostMinor,
      sellThroughRate: sellThrough,
      trend,
      rules: input.rules,
      snapshot,
    };
  }

  if (sellThrough != null && sellThrough < input.rules.minSellThroughRate) {
    snapshot.status = "rejected";
    snapshot.classification = "reject";
    snapshot.rejectIds = ["SELL_THROUGH_TOO_LOW"];
    snapshot.rejectReasons = [
      `Sell-through ${(sellThrough * 100).toFixed(1)}% is below ${(input.rules.minSellThroughRate * 100).toFixed(1)}%.`,
    ];
    return {
      proceed: false,
      expectedSellingPriceMinor,
      maxAcceptableSupplierCostMinor,
      sellThroughRate: sellThrough,
      trend,
      rules: input.rules,
      snapshot,
    };
  }

  if (maxAcceptableSupplierCostMinor <= 0) {
    snapshot.status = "rejected";
    snapshot.classification = "reject";
    snapshot.rejectIds = ["ECONOMICS_IMPOSSIBLE"];
    snapshot.rejectReasons = ["Fees, allowance, and minimum profit leave no room for a supplier."];
    return {
      proceed: false,
      expectedSellingPriceMinor,
      maxAcceptableSupplierCostMinor,
      sellThroughRate: sellThrough,
      trend,
      rules: input.rules,
      snapshot,
    };
  }

  snapshot.status = "qualified";
  snapshot.reasons.push("ebay_side_qualified");
  return {
    proceed: true,
    expectedSellingPriceMinor,
    maxAcceptableSupplierCostMinor,
    sellThroughRate: sellThrough,
    trend,
    rules: input.rules,
    snapshot,
  };
}

function demandScore(sold30d: number, minimum: number, trend: TrendLabel): number {
  const ratio = sold30d / Math.max(minimum, 1);
  let score = clamp(40 + Math.min(50, (ratio - 0.5) * 30));
  if (trend === "accelerating") score = clamp(score + 10);
  if (trend === "declining") score = clamp(score - 15);
  return score;
}

function sellThroughScore(rate: number, minimum: number): number {
  const above = (rate - minimum) / Math.max(minimum, 0.01);
  return clamp(60 + above * 20);
}

function competitionScore(active: number | null, sellerCount: number | null, topShare: number | null): number | null {
  if (active == null) return null;
  let score = active <= 5 ? 85 : active <= 15 ? 75 : active <= 40 ? 55 : 30;
  if (topShare != null) {
    if (topShare >= 0.7) score -= 25;
    else if (topShare >= 0.5) score -= 12;
  }
  if (sellerCount != null) {
    if (sellerCount <= 1) score -= 15;
    else if (sellerCount >= 3 && sellerCount <= 12) score += 5;
  }
  return clamp(score);
}

function listingOpportunityScore(topShare: number | null): number | null {
  if (topShare == null) return null;
  return clamp((1 - topShare) * 100);
}

function profitScore(marginPercent: number, minimumMargin: number): number {
  return clamp(50 + (marginPercent - minimumMargin) * 2.5);
}

function supplierScore(input: {
  rating: number | null;
  orderCount: number | null;
  preferredOrderCount: number;
  matchConfidence: number | null;
}): number | null {
  const parts: Array<{ value: number; weight: number }> = [];
  if (input.rating != null) {
    parts.push({ value: clamp(60 + ((input.rating - 4.7) / 0.3) * 40), weight: 0.7 });
  }
  if (input.orderCount != null) {
    parts.push({
      value: clamp(Math.min(100, (input.orderCount / Math.max(input.preferredOrderCount, 1)) * 100)),
      weight: 0.15,
    });
  }
  if (input.matchConfidence != null) parts.push({ value: clamp(input.matchConfidence), weight: 0.15 });
  if (parts.length === 0) return null;
  const weight = parts.reduce((sum, part) => sum + part.weight, 0);
  return clamp(parts.reduce((sum, part) => sum + part.value * part.weight, 0) / weight);
}

function trendScore(trend: TrendLabel): number | null {
  switch (trend) {
    case "accelerating":
      return 85;
    case "stable":
      return 70;
    case "declining":
      return 35;
    case "highly_seasonal":
      return 60;
    default:
      return null;
  }
}

function riskAssessment(titles: string[]): { score: number; warnings: string[] } {
  const warnings: string[] = [];
  let penalty = 0;
  const text = titles.join(" \n ");
  if (FRAGILE_PATTERNS.some((pattern) => pattern.test(text))) {
    penalty += 20;
    warnings.push("fragile_product");
  }
  if (HEAVY_PATTERNS.some((pattern) => pattern.test(text))) {
    penalty += 20;
    warnings.push("heavy_or_oversized");
  }
  if (RETURN_COMPLEX_PATTERNS.some((pattern) => pattern.test(text))) {
    penalty += 10;
    warnings.push("compatibility_or_return_complexity");
  }
  if (BRAND_MARK.test(text)) {
    penalty += 15;
    warnings.push("possible_brand_or_ip_signal");
  }
  return { score: clamp(100 - penalty), warnings };
}

function weightedOpportunity(parts: {
  demand: number | null;
  sellThrough: number | null;
  competition: number | null;
  profit: number | null;
  supplier: number | null;
  trend: number | null;
  listingOpportunity: number | null;
}): { score: number; dropped: string[] } {
  let weightSum = 0;
  let acc = 0;
  const dropped: string[] = [];
  (Object.keys(OPPORTUNITY_WEIGHTS) as Array<keyof typeof OPPORTUNITY_WEIGHTS>).forEach((key) => {
    const value = parts[key];
    if (value == null) {
      dropped.push(key);
      return;
    }
    weightSum += OPPORTUNITY_WEIGHTS[key];
    acc += value * OPPORTUNITY_WEIGHTS[key];
  });
  if (weightSum === 0) return { score: 0, dropped };
  return { score: Math.round(acc / weightSum), dropped };
}

export function classifyOpportunityScore(score: number): IntelligenceClassification {
  if (score >= 80) return "strong_candidate";
  if (score >= 60) return "investigate";
  if (score >= 40) return "weak_candidate";
  return "reject";
}

function rejectSnapshot(
  snapshot: ProductResearchSnapshot,
  rejectIds: string[],
  rejectReasons: string[],
  matchConfidence: number | null = null,
): ProductResearchSnapshot {
  return {
    ...snapshot,
    status: "rejected",
    classification: "reject",
    ...emptyScores(),
    matchConfidence,
    rejectIds,
    rejectReasons,
  };
}

export function finalizeProductIntelligence(gate: EbaySideGate, supplier: SupplierQualificationInput | null): ProductResearchSnapshot {
  if (!gate.proceed) return gate.snapshot;

  const snapshot = gate.snapshot;
  if (!supplier) {
    return {
      ...snapshot,
      status: "needs_evidence",
      classification: null,
      ...emptyScores(),
      rejectIds: ["NO_QUALIFIED_ALIEXPRESS_SOURCE"],
      rejectReasons: ["No AliExpress source passed retrieval and hard filters."],
    };
  }

  const titles = [snapshot.ebay.title, supplier.title];
  const restricted = findRestrictedMatch(supplier.title);
  if (restricted) {
    return rejectSnapshot(
      snapshot,
      ["RESTRICTED_PRODUCT"],
      [`Supplier title matched a restricted pattern: ${restricted}`],
      supplier.matchConfidence,
    );
  }
  if (supplier.matchHardReject) {
    return rejectSnapshot(
      snapshot,
      supplier.matchRejectReasons.length ? supplier.matchRejectReasons : ["MATCH_HARD_REJECT"],
      ["AliExpress item is not the same product kit."],
      supplier.matchConfidence,
    );
  }

  return applySupplierGates(snapshot, gate, supplier, titles);
}

function applySupplierGates(
  snapshot: ProductResearchSnapshot,
  gate: EbaySideGate,
  supplier: SupplierQualificationInput,
  titles: string[],
): ProductResearchSnapshot {
  const rules = gate.rules;
  if (supplier.rating != null && supplier.rating < rules.minimumRating) {
    return rejectSnapshot(
      snapshot,
      ["ALIEXPRESS_RATING_TOO_LOW"],
      [`AliExpress rating ${supplier.rating} is below ${rules.minimumRating}.`],
      supplier.matchConfidence,
    );
  }
  if (supplier.reviewCount != null && supplier.reviewCount < rules.minimumReviewCount) {
    return rejectSnapshot(
      snapshot,
      ["ALIEXPRESS_REVIEWS_TOO_LOW"],
      ["AliExpress review count is below the minimum."],
      supplier.matchConfidence,
    );
  }
  if (supplier.orderCount != null && supplier.orderCount < rules.minimumOrderCount) {
    return rejectSnapshot(
      snapshot,
      ["ALIEXPRESS_ORDERS_TOO_LOW"],
      ["AliExpress order count is below the minimum."],
      supplier.matchConfidence,
    );
  }
  if (supplier.matchConfidence < rules.minimumMatchConfidence) {
    return rejectSnapshot(
      snapshot,
      ["MATCH_CONFIDENCE_TOO_LOW"],
      ["Product-match confidence is below the minimum. This is sameness, not demand."],
      supplier.matchConfidence,
    );
  }

  const shippingCost = isKnownShippingCost(supplier.shippingMinor) ? supplier.shippingMinor : null;
  const landed = shippingCost == null ? null : supplier.priceMinor + shippingCost;
  const withSupplier: ProductResearchSnapshot = {
    ...snapshot,
    matchConfidence: supplier.matchConfidence,
    supplier: {
      productId: supplier.productId,
      title: supplier.title,
      rating: supplier.rating ?? null,
      price: supplier.priceMinor,
      shipping: shippingCost,
      landedCost: landed == null ? null : landed + rules.additionalSourcingCostMinor,
    },
  };

  if (supplier.rating == null || supplier.reviewCount == null || supplier.orderCount == null) {
    return {
      ...withSupplier,
      status: "needs_evidence",
      classification: null,
      ...emptyScores(),
      matchConfidence: supplier.matchConfidence,
      rejectIds: ["MANUAL_INTERVENTION_REQUIRED"],
      rejectReasons: ["Supplier rating, reviews, or orders are missing."],
      warnings: [...withSupplier.warnings, "supplier_fields_incomplete"],
    };
  }

  if (shippingCost == null || landed == null) {
    return {
      ...withSupplier,
      status: "needs_evidence",
      classification: null,
      ...emptyScores(),
      matchConfidence: supplier.matchConfidence,
      rejectIds: ["MISSING_SHIPPING_COST"],
      rejectReasons: ["AliExpress shipping is unknown and was not treated as free."],
    };
  }

  if (landed > gate.maxAcceptableSupplierCostMinor) {
    return rejectSnapshot(
      { ...withSupplier, matchConfidence: supplier.matchConfidence },
      ["SUPPLIER_COST_ABOVE_MAX"],
      ["AliExpress landed cost is above the maximum acceptable supplier cost."],
      supplier.matchConfidence,
    );
  }

  const profit = calculateProfit({
    aliexpressItemPriceMinor: supplier.priceMinor,
    aliexpressShippingCostMinor: shippingCost,
    additionalSourcingCostMinor: rules.additionalSourcingCostMinor,
    expectedSellingPriceMinor: gate.expectedSellingPriceMinor,
    ebayFeeRate: rules.ebayFeeRate,
    promotedListingRate: rules.promotedListingRate,
    expectedReturnCostMinor: rules.expectedReturnCostMinor,
    expectedRefundCostMinor: rules.expectedRefundCostMinor,
    otherFixedCostsMinor: rules.otherFixedCostsMinor,
    otherPercentageCost: rules.otherPercentageCost,
  });
  const economics = {
    estimatedFees: profit.marketplaceFeesMinor + profit.promotedListingFeeMinor,
    estimatedNetProfit: profit.estimatedProfitMinor,
    estimatedMargin: profit.profitMarginPercent,
    maxAcceptableSupplierCost: gate.maxAcceptableSupplierCostMinor,
  };
  if (profit.profitMarginPercent < rules.minimumNetMarginPercent) {
    return rejectSnapshot(
      { ...withSupplier, economics, matchConfidence: supplier.matchConfidence },
      ["MARGIN_TOO_LOW"],
      ["Net margin is below the configured minimum."],
      supplier.matchConfidence,
    );
  }

  const risk = riskAssessment(titles);
  const scores = {
    demand: demandScore(snapshot.ebay.sold30d ?? 0, rules.minimumRecentSales, snapshot.ebay.trend),
    sellThrough: snapshot.ebay.sellThroughRate == null ? null : sellThroughScore(snapshot.ebay.sellThroughRate, rules.minSellThroughRate),
    competition: competitionScore(snapshot.ebay.activeListings, snapshot.ebay.sellerCount, snapshot.ebay.topSellerListingShare),
    profit: profitScore(profit.profitMarginPercent, rules.minimumNetMarginPercent),
    supplier: supplierScore({
      rating: supplier.rating ?? null,
      orderCount: supplier.orderCount ?? null,
      preferredOrderCount: rules.preferredOrderCount,
      matchConfidence: supplier.matchConfidence,
    }),
    trend: trendScore(snapshot.ebay.trend),
    listingOpportunity: listingOpportunityScore(snapshot.ebay.topSellerListingShare),
  };
  const weighted = weightedOpportunity(scores);
  const penalty = Math.round((100 - risk.score) * RISK_PENALTY_WEIGHT);
  const opportunityScore = clamp(weighted.score - penalty);
  const classification = classifyOpportunityScore(opportunityScore);
  const warnings = [...withSupplier.warnings, ...risk.warnings, ...weighted.dropped.map((key) => `score_partial:${key}`)];

  return {
    ...withSupplier,
    status: classification === "reject" ? "rejected" : "qualified",
    classification,
    opportunityScore,
    matchConfidence: supplier.matchConfidence,
    demandScore: scores.demand,
    competitionScore: scores.competition,
    profitScore: scores.profit,
    supplierScore: scores.supplier,
    trendScore: scores.trend,
    riskScore: risk.score,
    sellThroughScore: scores.sellThrough,
    listingOpportunityScore: scores.listingOpportunity,
    economics,
    warnings,
    reasons: ["Scores use verified inputs only. matchConfidence measures product sameness, not demand.", `Trend: ${snapshot.ebay.trend}.`],
    rejectReasons: classification === "reject" ? ["Opportunity score is below 40."] : [],
    rejectIds: classification === "reject" ? ["OPPORTUNITY_SCORE_LOW"] : [],
  };
}

export function candidateStatusFromSnapshot(snapshot: ProductResearchSnapshot, shippingKnown: boolean): CandidateStatus {
  if (snapshot.status === "needs_evidence") return "NEEDS_MANUAL_VALIDATION";
  const ids = new Set(snapshot.rejectIds);
  if (ids.has("EBAY_RECENT_SALES_TOO_LOW") || ids.has("SELL_THROUGH_TOO_LOW")) return "DEMAND_NOT_VERIFIED";
  if (
    ids.has("ECONOMICS_IMPOSSIBLE") ||
    ids.has("SUPPLIER_COST_ABOVE_MAX") ||
    ids.has("MARGIN_TOO_LOW") ||
    ids.has("SOURCE_PRICE_NOT_BELOW_EBAY")
  ) {
    return "UNPROFITABLE";
  }
  if (
    ids.has("ALIEXPRESS_RATING_TOO_LOW") ||
    ids.has("ALIEXPRESS_REVIEWS_TOO_LOW") ||
    ids.has("ALIEXPRESS_ORDERS_TOO_LOW") ||
    ids.has("RESTRICTED_PRODUCT")
  ) {
    return "ALIEXPRESS_REJECTED";
  }
  if (snapshot.classification === "strong_candidate" && snapshot.status === "qualified" && shippingKnown) return "APPROVED";
  return "NEEDS_MANUAL_VALIDATION";
}
