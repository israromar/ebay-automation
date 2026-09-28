import { extractEbayItemId, legacyItemId } from "./ebay-ids";

/**
 * Parser for eBay's per-listing purchase history page (`/bin/purchaseHistory?item=…`), the page the
 * "eBay Sold History Button" style extensions open. It only renders for signed-in users, so the
 * companion extension fetches it with the operator's session and the server parses it here.
 */

/** eBay shows at most this many recent purchases; a full page may not reach back 30 days. */
export const PURCHASE_HISTORY_PAGE_ROWS = 100;

export function buildEbayPurchaseHistoryUrl(itemIdOrUrl?: string | null): string | null {
  const raw = itemIdOrUrl?.trim();
  if (!raw) return null;
  const id = legacyItemId(extractEbayItemId(raw) ?? raw);
  return /^\d{9,15}$/.test(id) ? `https://www.ebay.com/bin/purchaseHistory?item=${id}` : null;
}

export function dollarsToMinor(value: string | number): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 100);
  const cleaned = String(value).replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

export type PurchaseHistoryBlock = "login_required" | "blocked";

/** Sign-in redirects and bot-check interstitials: the extension must pause, never work around them. */
export function detectPurchaseHistoryBlock(html: string, finalUrl?: string | null): PurchaseHistoryBlock | null {
  if (finalUrl && /signin\.ebay\./i.test(finalUrl)) return "login_required";
  const lower = html.toLowerCase();
  if (/pardon our interruption|captcha|splashui\/challenge|are you a human|access denied/.test(lower)) return "blocked";
  if (/date of purchase|recent purchases|purchase history/i.test(html) && /<table/i.test(html)) return null;
  if (lower.includes("signin.ebay.") && /sign in|log in/.test(lower)) return "login_required";
  return null;
}

export type EbayPurchaseRow = {
  buyerMasked?: string;
  priceMinor: number;
  quantity: number;
  purchasedAt: Date;
  rawDate: string;
};

export type EbayPurchaseHistoryParseResult = {
  itemId: string | null;
  evidenceUrl: string | null;
  purchases: EbayPurchaseRow[];
  soldLast30Days: number;
  /** Null when no purchase rows were parsed. */
  sold7d: number | null;
  /** Null unless the oldest parsed sale is at least 90 days old. */
  sold90d: number | null;
  /** Null unless the oldest parsed sale is at least 365 days old. */
  sold365d: number | null;
  avgCompletedSaleMinor: number | null;
  medianCompletedSaleMinor: number | null;
  windowDays: number;
  /** True when eBay's page was full and every row is inside the window: the real count may be higher. */
  soldLast30DaysIsLowerBound: boolean;
  warnings: string[];
};

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

const TZ_OFFSET_MINUTES: Record<string, number> = {
  PDT: -7 * 60,
  PST: -8 * 60,
  EDT: -4 * 60,
  EST: -5 * 60,
  CDT: -5 * 60,
  CST: -6 * 60,
  MDT: -6 * 60,
  MST: -7 * 60,
  UTC: 0,
  GMT: 0,
};

function toUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  ampm: string,
  tzRaw: string,
  now: Date,
) {
  if (ampm === "pm" && hour < 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;
  const offset = TZ_OFFSET_MINUTES[tzRaw.toUpperCase()];
  const date =
    offset == null
      ? new Date(year, month, day, hour, minute, second)
      : new Date(Date.UTC(year, month, day, hour, minute, second) - offset * 60_000);
  if (Number.isNaN(date.getTime())) return null;
  // Guard absurd future dates from bad parses.
  if (date.getTime() - now.getTime() > 2 * 24 * 60 * 60 * 1000) return null;
  return date;
}

/**
 * Parse purchase-history dates. eBay has used both
 * `28 Jul 2024 at 10:26:24am PDT` and `Jul 28, 2024 10:26:24 AM PDT`.
 */
export function parseEbayPurchaseDate(raw: string, now = new Date()): Date | null {
  const cleaned = raw
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const dayFirst = cleaned.match(
    /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})\s+(?:at\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)\s*([A-Z]{2,4})?$/i,
  );
  const monthFirst = cleaned.match(
    /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\s+(?:at\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)\s*([A-Z]{2,4})?$/i,
  );
  const m = dayFirst
    ? {
        day: dayFirst[1],
        mon: dayFirst[2],
        year: dayFirst[3],
        h: dayFirst[4],
        mi: dayFirst[5],
        s: dayFirst[6],
        ap: dayFirst[7],
        tz: dayFirst[8],
      }
    : monthFirst
      ? {
          day: monthFirst[2],
          mon: monthFirst[1],
          year: monthFirst[3],
          h: monthFirst[4],
          mi: monthFirst[5],
          s: monthFirst[6],
          ap: monthFirst[7],
          tz: monthFirst[8],
        }
      : null;
  if (!m) return null;
  const month = MONTHS[m.mon!.toLowerCase()];
  if (month == null) return null;
  return toUtc(Number(m.year), month, Number(m.day), Number(m.h), Number(m.mi), Number(m.s ?? 0), m.ap!.toLowerCase(), m.tz ?? "", now);
}

export function medianMinor(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
  }
  return sorted[mid]!;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"');
}

function stripTags(html: string): string {
  return decodeHtml(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse eBay `/bin/purchaseHistory` HTML for recent purchases.
 * Works on table markup; also accepts plain-text rows for fixtures.
 */
export function parseEbayPurchaseHistoryHtml(
  html: string,
  options?: { itemIdOrUrl?: string | null; windowDays?: number; now?: Date },
): EbayPurchaseHistoryParseResult {
  const now = options?.now ?? new Date();
  const windowDays = options?.windowDays ?? 30;
  const evidenceUrl = buildEbayPurchaseHistoryUrl(options?.itemIdOrUrl ?? null);
  const itemId = evidenceUrl?.match(/item=(\d+)/)?.[1] ?? null;
  const warnings: string[] = [];

  const lower = html.toLowerCase();
  if (
    (lower.includes("signin.ebay.") || lower.includes("sign in") || lower.includes("log in")) &&
    !lower.includes("recent purchases") &&
    !/date of purchase/i.test(html)
  ) {
    warnings.push("login_wall_detected");
  }

  const purchases: EbayPurchaseRow[] = [];
  const rowRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(html))) {
    const rowHtml = rowMatch[1] ?? "";
    const cells = [...rowHtml.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => stripTags(m[1] ?? ""));
    if (cells.length < 3) continue;
    const joined = cells.join(" | ");
    if (/user id|date of purchase|buy it now price/i.test(joined) && !/\d{4}/.test(joined)) {
      continue;
    }

    const dateCell = cells.find((c) => parseEbayPurchaseDate(c, now) != null);
    const priceCell = cells.find((c) => /(?:US\s*)?\$\s*\d/.test(c));
    const qtyCell = cells.find((c) => /^\d+$/.test(c.trim()));
    if (!dateCell || !priceCell) continue;

    const purchasedAt = parseEbayPurchaseDate(dateCell, now);
    const priceMinor = dollarsToMinor(priceCell);
    if (!purchasedAt || priceMinor == null) continue;

    purchases.push({
      buyerMasked: cells.find((c) => /\*/.test(c)),
      priceMinor,
      quantity: Math.max(1, Number(qtyCell ?? "1") || 1),
      purchasedAt,
      rawDate: dateCell,
    });
  }

  // Fallback: scan full text for date+price pairs when markup is unusual.
  if (purchases.length === 0) {
    const text = stripTags(html);
    const pairRegex =
      /((?:US\s*)?\$\s*\d+(?:\.\d{1,2})?).{0,80}?((?:\d{1,2}\s+[A-Za-z]{3}\s+\d{4}|[A-Za-z]{3}\s+\d{1,2},?\s+\d{4})\s+(?:at\s+)?\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)\s*[A-Z]{0,4})/gi;
    let pair: RegExpExecArray | null;
    while ((pair = pairRegex.exec(text))) {
      const priceMinor = dollarsToMinor(pair[1] ?? "");
      const purchasedAt = parseEbayPurchaseDate(pair[2] ?? "", now);
      if (!purchasedAt || priceMinor == null) continue;
      purchases.push({
        priceMinor,
        quantity: 1,
        purchasedAt,
        rawDate: pair[2] ?? "",
      });
    }
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const unitsSince = (days: number) => {
    const cutoff = now.getTime() - days * dayMs;
    return purchases.filter((p) => p.purchasedAt.getTime() >= cutoff).reduce((sum, p) => sum + p.quantity, 0);
  };
  const windowMs = windowDays * dayMs;
  const cutoff = now.getTime() - windowMs;
  const recent = purchases.filter((p) => p.purchasedAt.getTime() >= cutoff);
  const soldLast30Days = recent.reduce((sum, p) => sum + p.quantity, 0);
  const unitPrices = recent.flatMap((p) => Array.from({ length: p.quantity }, () => p.priceMinor));
  const avgCompletedSaleMinor = unitPrices.length > 0 ? Math.round(unitPrices.reduce((a, b) => a + b, 0) / unitPrices.length) : null;

  const oldest = purchases.reduce<number | null>((min, row) => {
    const time = row.purchasedAt.getTime();
    return min == null || time < min ? time : min;
  }, null);
  const coverageDays = oldest == null ? 0 : (now.getTime() - oldest) / dayMs;
  const sold7d = purchases.length > 0 ? unitsSince(7) : null;
  const sold90d = coverageDays >= 90 ? unitsSince(90) : null;
  const sold365d = coverageDays >= 365 ? unitsSince(365) : null;

  const soldLast30DaysIsLowerBound = purchases.length >= PURCHASE_HISTORY_PAGE_ROWS && coverageDays < windowDays;
  if (soldLast30DaysIsLowerBound) warnings.push("page_full_lower_bound");
  if (purchases.length === 0) warnings.push("no_purchase_rows_parsed");
  else if (recent.length === 0) warnings.push("no_sales_in_window");
  if (purchases.length > 0 && sold90d == null) warnings.push("window_90d_not_covered");
  if (purchases.length > 0 && sold365d == null) warnings.push("window_365d_not_covered");

  return {
    itemId,
    evidenceUrl,
    purchases,
    soldLast30Days,
    sold7d,
    sold90d,
    sold365d,
    avgCompletedSaleMinor,
    medianCompletedSaleMinor: medianMinor(unitPrices),
    windowDays,
    soldLast30DaysIsLowerBound,
    warnings,
  };
}
