import { buildEbayPurchaseHistoryUrl, extractNumericEbayItemId } from "@/lib/domain/ebay-sold-history";
import { parseEbayPurchaseHistoryHtml, type EbayPurchaseHistoryParseResult } from "@/lib/domain/ebay-purchase-history";

export type EbayPurchaseHistoryFetchResult = EbayPurchaseHistoryParseResult & {
  available: boolean;
  source: "playwright" | "http";
  reason?: string;
};

function fetchEnabled() {
  return process.env.EBAY_PURCHASE_HISTORY_FETCH_ENABLED !== "false";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sessionCookieHeader(): string | undefined {
  const raw = process.env.EBAY_PURCHASE_HISTORY_COOKIE?.trim();
  return raw || undefined;
}

async function fetchHtmlWithHttp(url: string): Promise<string> {
  const cookie = sessionCookieHeader();
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
      Accept: "text/html,application/xhtml+xml",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    redirect: "follow",
    signal: AbortSignal.timeout(25_000),
  });
  return res.text();
}

async function fetchHtmlWithPlaywright(url: string): Promise<string> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      locale: "en-US",
    });
    const cookie = sessionCookieHeader();
    if (cookie) {
      const pairs = cookie
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean);
      await context.addCookies(
        pairs
          .map((pair) => {
            const eq = pair.indexOf("=");
            if (eq <= 0) return null;
            return {
              name: pair.slice(0, eq).trim(),
              value: pair.slice(eq + 1).trim(),
              domain: ".ebay.com",
              path: "/",
            };
          })
          .filter((c): c is NonNullable<typeof c> => c != null),
      );
    }
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await sleep(1500);
    await page.waitForSelector("text=Recent purchases", { timeout: 8_000 }).catch(() => undefined);
    return await page.content();
  } finally {
    await browser.close().catch(() => undefined);
  }
}

/**
 * Operator-assisted purchase-history fetch.
 * Not used as an unattended scheduler default; may hit login walls / bot checks.
 */
export async function fetchEbayPurchaseHistory(input: {
  itemIdOrUrl: string;
  windowDays?: number;
  now?: Date;
}): Promise<EbayPurchaseHistoryFetchResult> {
  if (!fetchEnabled()) {
    return {
      available: false,
      source: "http",
      reason: "purchase_history_fetch_disabled",
      itemId: extractNumericEbayItemId(input.itemIdOrUrl),
      evidenceUrl: buildEbayPurchaseHistoryUrl(input.itemIdOrUrl),
      purchases: [],
      soldLast30Days: 0,
      avgCompletedSaleMinor: null,
      medianCompletedSaleMinor: null,
      windowDays: input.windowDays ?? 30,
      warnings: ["purchase_history_fetch_disabled"],
    };
  }

  const evidenceUrl = buildEbayPurchaseHistoryUrl(input.itemIdOrUrl);
  if (!evidenceUrl) {
    return {
      available: false,
      source: "http",
      reason: "missing_ebay_item_id",
      itemId: null,
      evidenceUrl: null,
      purchases: [],
      soldLast30Days: 0,
      avgCompletedSaleMinor: null,
      medianCompletedSaleMinor: null,
      windowDays: input.windowDays ?? 30,
      warnings: ["missing_ebay_item_id"],
    };
  }

  let html = "";
  let source: "playwright" | "http" = "http";
  try {
    html = await fetchHtmlWithHttp(evidenceUrl);
    const firstPass = parseEbayPurchaseHistoryHtml(html, {
      itemIdOrUrl: input.itemIdOrUrl,
      windowDays: input.windowDays,
      now: input.now,
    });
    if (firstPass.purchases.length > 0 && !firstPass.warnings.includes("login_wall_detected")) {
      return { ...firstPass, available: true, source: "http" };
    }
  } catch {
    /* fall through to Playwright */
  }

  try {
    source = "playwright";
    html = await fetchHtmlWithPlaywright(evidenceUrl);
  } catch (error) {
    return {
      available: false,
      source,
      reason: error instanceof Error ? error.message : String(error),
      itemId: extractNumericEbayItemId(input.itemIdOrUrl),
      evidenceUrl,
      purchases: [],
      soldLast30Days: 0,
      avgCompletedSaleMinor: null,
      medianCompletedSaleMinor: null,
      windowDays: input.windowDays ?? 30,
      warnings: ["purchase_history_fetch_failed"],
    };
  }

  const parsed = parseEbayPurchaseHistoryHtml(html, {
    itemIdOrUrl: input.itemIdOrUrl,
    windowDays: input.windowDays,
    now: input.now,
  });

  if (parsed.warnings.includes("login_wall_detected") && parsed.purchases.length === 0) {
    return {
      ...parsed,
      available: false,
      source,
      reason: "login_required",
    };
  }

  if (parsed.purchases.length === 0) {
    return {
      ...parsed,
      available: false,
      source,
      reason: "no_purchase_rows_parsed",
    };
  }

  return { ...parsed, available: true, source };
}
