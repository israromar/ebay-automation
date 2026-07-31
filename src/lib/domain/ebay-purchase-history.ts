import { buildEbayPurchaseHistoryUrl, dollarsToMinor } from "@/lib/domain/ebay-sold-history";

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
  avgCompletedSaleMinor: number | null;
  medianCompletedSaleMinor: number | null;
  windowDays: number;
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

/** Parse eBay purchase-history date strings like `28 Jul 2024 at 10:26:24am PDT`. */
export function parseEbayPurchaseDate(raw: string, now = new Date()): Date | null {
  const cleaned = raw.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  const match = cleaned.match(
    /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+at\s+(\d{1,2}):(\d{2}):(\d{2})\s*(am|pm)\s*([A-Z]{2,4})?$/i,
  );
  if (!match) return null;

  const day = Number(match[1]);
  const month = MONTHS[match[2].toLowerCase()];
  const year = Number(match[3]);
  let hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const ampm = match[7].toLowerCase();
  const tz = (match[8] ?? "").toUpperCase();

  if (month == null || !Number.isFinite(day) || !Number.isFinite(year)) return null;
  if (ampm === "pm" && hour < 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;

  const offset = TZ_OFFSET_MINUTES[tz];
  if (offset == null) {
    // Fall back to local interpretation when TZ is unknown.
    const local = new Date(year, month, day, hour, minute, second);
    return Number.isNaN(local.getTime()) ? null : local;
  }

  const utcMs = Date.UTC(year, month, day, hour, minute, second) - offset * 60_000;
  const date = new Date(utcMs);
  if (Number.isNaN(date.getTime())) return null;
  // Guard absurd future dates from bad parses.
  if (date.getTime() - now.getTime() > 2 * 24 * 60 * 60 * 1000) return null;
  return date;
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
  return decodeHtml(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
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
    if (/user id|date of purchase|buy it now price/i.test(joined) && !/\d{1,2}\s+[A-Za-z]{3}\s+\d{4}/.test(joined)) {
      continue;
    }

    const dateCell = cells.find((c) => /\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\s+at\s+/i.test(c));
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
      /((?:US\s*)?\$\s*\d+(?:\.\d{1,2})?).{0,80}?(\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\s+at\s+\d{1,2}:\d{2}:\d{2}\s*(?:am|pm)\s*[A-Z]{0,4})/gi;
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

  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  const cutoff = now.getTime() - windowMs;
  const recent = purchases.filter((p) => p.purchasedAt.getTime() >= cutoff);
  const soldLast30Days = recent.reduce((sum, p) => sum + p.quantity, 0);
  const unitPrices = recent.flatMap((p) => Array.from({ length: p.quantity }, () => p.priceMinor));
  const avgCompletedSaleMinor =
    unitPrices.length > 0 ? Math.round(unitPrices.reduce((a, b) => a + b, 0) / unitPrices.length) : null;

  if (purchases.length === 0) warnings.push("no_purchase_rows_parsed");
  else if (recent.length === 0) warnings.push("no_sales_in_window");

  return {
    itemId,
    evidenceUrl,
    purchases,
    soldLast30Days,
    avgCompletedSaleMinor,
    medianCompletedSaleMinor: medianMinor(unitPrices),
    windowDays,
    warnings,
  };
}
