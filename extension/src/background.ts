import { api, ApiError } from "./api";
import { EBAY_ORIGIN, ebayItemIdFromUrl, getRunState, getSettings, saveRunState, type Message } from "./config";

/**
 * Hunter Companion background worker.
 *
 * Every minute it asks the Hunter app which tracked eBay listings need an exact 30-day sold count,
 * opens each listing's purchase-history page (`/bin/purchaseHistory?item=…`) with the operator's own
 * signed-in eBay session, and sends the page to the app, which parses it. It paces requests like a
 * person (one every 4–7 s, a few per minute, a daily cap) and stops for 6 hours as soon as eBay shows
 * a sign-in page or a bot check. It never tries to get around either.
 */

const ALARM = "hunter-tick";
const ITEMS_PER_TICK = 5;
const MIN_GAP_MS = 4000;
const JITTER_MS = 3000;
const LOCK_KEY = "runningUntil";

interface QueueResponse {
  items: Array<{ id: string; ebayItemId: string; title: string; url: string }>;
  pauseUntil: string | null;
  pauseReason: string | null;
  remainingToday: number;
  verifiedToday: number;
  dailyCap: number;
  pending: number;
}

type HistoryOutcome =
  | { status: "ok"; sold30d: number; lowerBound: boolean; winner: boolean }
  | { status: "no_rows" | "not_tracked" }
  | { status: "login_required" | "blocked"; pause: true; pauseUntil: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function purchaseHistoryUrl(itemId: string) {
  return `${EBAY_ORIGIN}/bin/purchaseHistory?item=${itemId}`;
}

async function setBadge() {
  const run = await getRunState();
  const settings = await getSettings();
  if (!settings.token) {
    await chrome.action.setBadgeText({ text: "off" });
    await chrome.action.setBadgeBackgroundColor({ color: "#737686" });
  } else if (run.pausedUntil && new Date(run.pausedUntil) > new Date()) {
    await chrome.action.setBadgeText({ text: "!" });
    await chrome.action.setBadgeBackgroundColor({ color: "#ba1a1a" });
  } else {
    await chrome.action.setBadgeText({ text: run.verified ? String(run.verified) : "" });
    await chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
  }
}

/** Fetch one purchase-history page with the operator's cookies and hand it to the app. */
async function verifyOne(itemId: string): Promise<HistoryOutcome> {
  const res = await fetch(purchaseHistoryUrl(itemId), { credentials: "include", redirect: "follow", cache: "no-store" });
  const html = await res.text();
  const outcome = await api<HistoryOutcome>("/api/extension/purchase-history", {
    method: "POST",
    body: { itemId, html, finalUrl: res.url },
  });
  const run = await getRunState();
  if (outcome.status === "login_required" || outcome.status === "blocked") {
    await saveRunState({ pausedUntil: outcome.pauseUntil, pauseReason: outcome.status, checked: run.checked + 1 });
  } else {
    await saveRunState({ checked: run.checked + 1, verified: run.verified + (outcome.status === "ok" ? 1 : 0), lastError: null });
  }
  await setBadge();
  return outcome;
}

async function withLock<T>(fn: () => Promise<T>): Promise<T | null> {
  const { [LOCK_KEY]: until } = await chrome.storage.session.get(LOCK_KEY);
  if (typeof until === "number" && until > Date.now()) return null;
  await chrome.storage.session.set({ [LOCK_KEY]: Date.now() + 90_000 });
  try {
    return await fn();
  } finally {
    await chrome.storage.session.remove(LOCK_KEY);
  }
}

/** One background pass: pull a few queued listings and verify them, paced. */
async function tick(options?: { force?: boolean }) {
  const settings = await getSettings();
  if (!settings.token || (!settings.autoVerify && !options?.force)) return setBadge();
  const run = await getRunState();
  if (run.pausedUntil && new Date(run.pausedUntil) > new Date()) return setBadge();
  if (run.checked >= settings.dailyCap) return setBadge();

  await withLock(async () => {
    try {
      const queue = await api<QueueResponse>(`/api/extension/queue?limit=${ITEMS_PER_TICK}`);
      await saveRunState({
        lastRunAt: new Date().toISOString(),
        lastError: null,
        pausedUntil: queue.pauseUntil,
        pauseReason: queue.pauseReason,
      });
      for (const [i, item] of queue.items.entries()) {
        if (i > 0) await sleep(MIN_GAP_MS + Math.random() * JITTER_MS);
        const outcome = await verifyOne(item.ebayItemId);
        if ("pause" in outcome) break;
        if ((await getRunState()).checked >= settings.dailyCap) break;
      }
    } catch (error) {
      await saveRunState({ lastError: error instanceof Error ? error.message : String(error), lastRunAt: new Date().toISOString() });
    }
  });
  await setBadge();
}

async function ensureAlarm() {
  const existing = await chrome.alarms.get(ALARM);
  if (!existing) await chrome.alarms.create(ALARM, { periodInMinutes: 1, delayInMinutes: 0.1 });
}

async function applyBundleSkip() {
  const { bundleSkip } = await getSettings();
  await chrome.declarativeNetRequest.updateEnabledRulesets(
    bundleSkip ? { enableRulesetIds: ["bundle_skip"] } : { disableRulesetIds: ["bundle_skip"] },
  );
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await ensureAlarm();
  await applyBundleSkip();
  await setBadge();
  if (details.reason === "install") await chrome.runtime.openOptionsPage();
});
chrome.runtime.onStartup.addListener(async () => {
  await ensureAlarm();
  await setBadge();
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) void tick();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.settings) {
    void applyBundleSkip();
    void setBadge();
  }
});

async function handle(message: Message): Promise<unknown> {
  switch (message.type) {
    case "status": {
      const [settings, run] = await Promise.all([getSettings(), getRunState()]);
      let server: unknown = null;
      if (settings.token) {
        try {
          server = await api("/api/extension/status");
        } catch (error) {
          server = { error: error instanceof Error ? error.message : String(error) };
        }
      }
      return { settings: { ...settings, token: settings.token ? "set" : "" }, run, server };
    }
    case "runNow":
      await tick({ force: true });
      return { ok: true };
    case "resume":
      await saveRunState({ pausedUntil: null, pauseReason: null });
      await setBadge();
      await tick({ force: true });
      return { ok: true };
    case "lookup":
      return api(`/api/extension/listing?item=${encodeURIComponent(message.itemUrl)}`);
    case "track":
      return api("/api/extension/track", { method: "POST", body: { url: message.itemUrl } });
    case "verifyNow": {
      const itemId = ebayItemIdFromUrl(message.itemUrl);
      if (!itemId) throw new Error("Not an eBay item page");
      const run = await getRunState();
      if (run.pausedUntil && new Date(run.pausedUntil) > new Date()) {
        throw new Error(
          `Paused until ${new Date(run.pausedUntil).toLocaleTimeString()} (${run.pauseReason}). Sign in to eBay, then Resume.`,
        );
      }
      let outcome = await verifyOne(itemId);
      if (outcome.status === "not_tracked") {
        await api("/api/extension/track", { method: "POST", body: { url: message.itemUrl } });
        outcome = await verifyOne(itemId);
      }
      return outcome;
    }
  }
}

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  handle(message)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error: unknown) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        status: error instanceof ApiError ? error.status : undefined,
      }),
    );
  return true;
});
