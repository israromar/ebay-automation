import type { ProfitInput, ProfitResult } from "./types";

export interface SupplierBudgetInput {
  expectedSellingPriceMinor: number;
  buyerShippingRevenueMinor?: number;
  additionalSourcingCostMinor: number;
  ebayFeeRate: number;
  promotedListingRate: number;
  expectedReturnCostMinor: number;
  expectedRefundCostMinor: number;
  otherFixedCostsMinor: number;
  otherPercentageCost?: number;
  minimumNetMarginPercent: number;
  minimumProfitMinor: number;
}

/** Maximum AliExpress item + shipping (minor units) that still clears fees, allowance, and minimum profit. */
export function calculateMaxAcceptableSupplierCost(input: SupplierBudgetInput): number {
  const buyerShipping = input.buyerShippingRevenueMinor ?? 0;
  const gross = input.expectedSellingPriceMinor + buyerShipping;
  const feeRate = input.ebayFeeRate + input.promotedListingRate + (input.otherPercentageCost ?? 0);
  const fees = Math.round(gross * feeRate);
  const allowance = input.expectedReturnCostMinor + input.expectedRefundCostMinor + input.otherFixedCostsMinor;
  const marginProfit = Math.round((gross * input.minimumNetMarginPercent) / 100);
  const minProfit = Math.max(input.minimumProfitMinor, marginProfit);
  return gross - fees - allowance - input.additionalSourcingCostMinor - minProfit;
}

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
