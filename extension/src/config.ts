/// <reference types="chrome" />

/** Build-time constants injected by scripts/build-extension.ts (esbuild `define`). */
declare const __HUNTER_APP_URL__: string;
declare const __EBAY_ORIGIN__: string;

export const DEFAULT_APP_URL = __HUNTER_APP_URL__;
/** Always https://www.ebay.com in real builds; a local mock origin only in e2e test builds. */
export const EBAY_ORIGIN = __EBAY_ORIGIN__;

export interface Settings {
  appUrl: string;
  token: string;
  autoVerify: boolean;
  bundleSkip: boolean;
  /** Local cap on purchase-history page views per day (the app enforces its own cap too). */
  dailyCap: number;
}

export interface RunState {
  day: string;
  verified: number;
  checked: number;
  pausedUntil: string | null;
  pauseReason: string | null;
  lastRunAt: string | null;
  lastError: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  appUrl: DEFAULT_APP_URL,
  token: "",
  autoVerify: true,
  bundleSkip: true,
  dailyCap: 300,
};

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getSettings(): Promise<Settings> {
  const stored = (await chrome.storage.local.get("settings")).settings as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  next.appUrl = next.appUrl.replace(/\/+$/, "");
  await chrome.storage.local.set({ settings: next });
  return next;
}

export async function getRunState(): Promise<RunState> {
  const stored = (await chrome.storage.local.get("run")).run as RunState | undefined;
  const fresh: RunState = { day: today(), verified: 0, checked: 0, pausedUntil: null, pauseReason: null, lastRunAt: null, lastError: null };
  if (!stored) return fresh;
  // Counters reset daily; a pause carries over until it expires.
  return stored.day === today() ? stored : { ...fresh, pausedUntil: stored.pausedUntil, pauseReason: stored.pauseReason };
}

export async function saveRunState(patch: Partial<RunState>): Promise<RunState> {
  const next = { ...(await getRunState()), ...patch };
  await chrome.storage.local.set({ run: next });
  return next;
}

/** Messages exchanged between popup / content scripts and the background worker. */
export type Message =
  | { type: "status" }
  | { type: "runNow" }
  | { type: "resume" }
  | { type: "lookup"; itemUrl: string }
  | { type: "track"; itemUrl: string }
  | { type: "verifyNow"; itemUrl: string };

export function money(minor: number | null | undefined): string {
  return minor == null ? "—" : `$${(minor / 100).toFixed(2)}`;
}

/** Legacy numeric id from an eBay item URL or id. */
export function ebayItemIdFromUrl(url: string): string | null {
  const path = url.match(/\/itm\/(?:[^/?#]+\/)?(\d{9,15})/);
  if (path) return path[1]!;
  try {
    const id = new URL(url).searchParams.get("item");
    return id && /^\d{9,15}$/.test(id) ? id : null;
  } catch {
    return /^\d{9,15}$/.test(url) ? url : null;
  }
}
