import { scoreAliExpressSourceMatch, type MatchResult } from "./matching";
import { calculateProfit } from "./profit";
import type { AliExpressProduct, ProfitResult } from "./types";

export interface SourcingRules {
  minAeRating: number;
  minAeReviews: number;
  minAeOrders: number;
  minMatchConfidence: number;
  minMarginPct: number;
  ebayFeeRate: number;
  /** Used when the Affiliate API does not return shipping (it usually doesn't). */
  aeShippingEstimateMinor: number;
  extraCostMinor: number;
}

export const DEFAULT_SOURCING_RULES: SourcingRules = {
  minAeRating: 4.7,
  minAeReviews: 20,
  minAeOrders: 50,
  minMatchConfidence: 70,
  minMarginPct: 10,
  ebayFeeRate: 0.1325,
  aeShippingEstimateMinor: 300,
  extraCostMinor: 0,
};

export const GATE_REASONS = [
  "rating_missing",
  "rating_below_min",
  "reviews_below_min",
  "orders_below_min",
  "match_rejected",
  "match_below_min",
  "price_missing",
  "cost_not_below_ebay",
  "margin_below_min",
] as const;
export type GateReason = (typeof GATE_REASONS)[number];

export interface EbaySide {
  title: string;
  priceMinor: number;
  shippingMinor?: number | null;
}

export interface GatedSource {
  product: AliExpressProduct;
  passed: boolean;
  reasons: GateReason[];
  match: MatchResult;
  shippingMinor: number;
  shippingEstimated: boolean;
  profit: ProfitResult;
}

/** Hard gate for one AliExpress candidate against one eBay listing. Missing rating is a fail. */
export function gateSource(ebay: EbaySide, product: AliExpressProduct, searchKeyword: string, rules: SourcingRules): GatedSource {
  const reasons: GateReason[] = [];

  if (product.rating == null || !Number.isFinite(product.rating)) reasons.push("rating_missing");
  else if (product.rating < rules.minAeRating) reasons.push("rating_below_min");

  if ((product.reviewCount ?? 0) < rules.minAeReviews) reasons.push("reviews_below_min");
  if ((product.orderCount ?? 0) < rules.minAeOrders) reasons.push("orders_below_min");

  const match = scoreAliExpressSourceMatch(
    { title: ebay.title, priceMinor: ebay.priceMinor, condition: "NEW" },
    { title: product.title, priceMinor: product.priceMinor, condition: "NEW" },
    searchKeyword,
  );
  if (match.hardReject) reasons.push("match_rejected");
  else if (match.confidence < rules.minMatchConfidence) reasons.push("match_below_min");

  const shippingKnown = typeof product.shippingMinor === "number" && Number.isFinite(product.shippingMinor) && product.shippingMinor >= 0;
  const shippingMinor = shippingKnown ? product.shippingMinor! : rules.aeShippingEstimateMinor;

  if (!(product.priceMinor > 0)) reasons.push("price_missing");

  const profit = calculateProfit({
    aliexpressItemPriceMinor: product.priceMinor,
    aliexpressShippingCostMinor: shippingMinor,
    additionalSourcingCostMinor: rules.extraCostMinor,
    expectedSellingPriceMinor: ebay.priceMinor,
    buyerShippingRevenueMinor: ebay.shippingMinor ?? 0,
    ebayFeeRate: rules.ebayFeeRate,
    promotedListingRate: 0,
    expectedReturnCostMinor: 0,
    expectedRefundCostMinor: 0,
    otherFixedCostsMinor: 0,
  });

  if (product.priceMinor > 0) {
    if (product.priceMinor + shippingMinor >= ebay.priceMinor + (ebay.shippingMinor ?? 0)) reasons.push("cost_not_below_ebay");
    else if (profit.profitMarginPercent < rules.minMarginPct) reasons.push("margin_below_min");
  }

  return {
    product,
    passed: reasons.length === 0,
    reasons,
    match,
    shippingMinor,
    shippingEstimated: !shippingKnown,
    profit,
  };
}

/** Gate every candidate and return the best `limit` that pass, ranked by match then margin. */
export function selectTopSources(
  ebay: EbaySide,
  candidates: AliExpressProduct[],
  searchKeyword: string,
  rules: SourcingRules,
  limit = 3,
): { passed: GatedSource[]; rejected: Record<GateReason, number>; considered: number } {
  const rejected = Object.fromEntries(GATE_REASONS.map((r) => [r, 0])) as Record<GateReason, number>;
  const seen = new Set<string>();
  const passed: GatedSource[] = [];

  for (const product of candidates) {
    if (!product.productId || seen.has(product.productId)) continue;
    seen.add(product.productId);
    const gated = gateSource(ebay, product, searchKeyword, rules);
    if (gated.passed) passed.push(gated);
    else for (const reason of gated.reasons) rejected[reason] += 1;
  }

  passed.sort(
    (a, b) =>
      b.match.confidence - a.match.confidence ||
      b.profit.profitMarginPercent - a.profit.profitMarginPercent ||
      (b.product.orderCount ?? 0) - (a.product.orderCount ?? 0),
  );

  return { passed: passed.slice(0, limit), rejected, considered: seen.size };
}
