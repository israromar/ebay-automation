import type { ProfitInput, ProfitResult } from "./types";

/** All monetary math uses integer minor units (e.g. cents). */
export function calculateProfit(input: ProfitInput): ProfitResult {
  const buyerShipping = input.buyerShippingRevenueMinor ?? 0;
  const adjustedSourceCostMinor = input.aliexpressItemPriceMinor + input.aliexpressShippingCostMinor + input.additionalSourcingCostMinor;

  const grossRevenueMinor = input.expectedSellingPriceMinor + buyerShipping;
  const marketplaceFeesMinor = Math.round(grossRevenueMinor * input.ebayFeeRate);
  const promotedListingFeeMinor = Math.round(grossRevenueMinor * input.promotedListingRate);
  const otherPctMinor = Math.round(grossRevenueMinor * (input.otherPercentageCost ?? 0));

  const totalEstimatedCostMinor =
    adjustedSourceCostMinor +
    marketplaceFeesMinor +
    promotedListingFeeMinor +
    input.expectedReturnCostMinor +
    input.expectedRefundCostMinor +
    input.otherFixedCostsMinor +
    otherPctMinor;

  const estimatedProfitMinor = grossRevenueMinor - totalEstimatedCostMinor;
  const profitMarginPercent = grossRevenueMinor > 0 ? (estimatedProfitMinor / grossRevenueMinor) * 100 : 0;
  const returnOnCostPercent = totalEstimatedCostMinor > 0 ? (estimatedProfitMinor / totalEstimatedCostMinor) * 100 : 0;
  const grossMarginPercent = grossRevenueMinor > 0 ? ((grossRevenueMinor - adjustedSourceCostMinor) / grossRevenueMinor) * 100 : 0;

  return {
    adjustedSourceCostMinor,
    grossRevenueMinor,
    marketplaceFeesMinor,
    promotedListingFeeMinor,
    totalEstimatedCostMinor,
    estimatedProfitMinor,
    profitMarginPercent,
    returnOnCostPercent,
    grossMarginPercent,
  };
}

export function formatMinor(amountMinor: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountMinor / 100);
}
