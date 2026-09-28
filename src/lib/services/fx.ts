import { logWarn } from "@/lib/logger";

/**
 * USD → other currency rates for converting fixed-money settings (min profit, AE shipping estimate,
 * extra cost) into the currency of the eBay listing being sourced. Daily ECB rates via Frankfurter
 * (free, no key), cached in memory; conservative built-in rates if it can't be reached.
 */

const TTL_MS = 12 * 60 * 60 * 1000;
const FX_URL = "https://api.frankfurter.app/latest?from=USD";

export const FALLBACK_USD_RATES: Record<string, number> = { USD: 1, GBP: 0.79, EUR: 0.92, AUD: 1.52, CAD: 1.37 };

export interface UsdRate {
  currency: string;
  rate: number;
  source: "live" | "fallback";
}

let cache: { rates: Record<string, number>; fetchedAt: number } | null = null;

/** Test hook. */
export function resetFxCache() {
  cache = null;
}

async function liveRates(): Promise<Record<string, number> | null> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.rates;
  try {
    const res = await fetch(FX_URL, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { rates?: Record<string, number> };
    if (!json.rates || typeof json.rates.GBP !== "number") throw new Error("unexpected response");
    cache = { rates: { USD: 1, ...json.rates }, fetchedAt: Date.now() };
    return cache.rates;
  } catch (error) {
    logWarn("fx_rates_unavailable", { reason: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

export async function usdTo(currency: string): Promise<UsdRate> {
  const code = currency.toUpperCase();
  if (code === "USD") return { currency: code, rate: 1, source: "live" };
  const rates = await liveRates();
  const live = rates?.[code];
  if (typeof live === "number" && live > 0) return { currency: code, rate: live, source: "live" };
  return { currency: code, rate: FALLBACK_USD_RATES[code] ?? 1, source: "fallback" };
}

/** Convert a USD minor-unit amount (cents) into the target currency's minor units. */
export function convertUsdMinor(minorUsd: number, rate: UsdRate): number {
  return Math.round(minorUsd * rate.rate);
}
