"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

type GlobalLoaderContextValue = {
  begin: (label?: string) => void;
  end: () => void;
  track: <T>(promise: Promise<T>, label?: string) => Promise<T>;
  busy: boolean;
};

const GlobalLoaderContext = createContext<GlobalLoaderContextValue | null>(null);

const SHOW_DELAY_MS = 220;
const MIN_VISIBLE_MS = 280;
const ROUTE_MAX_MS = 4000;

function headerSaysSilent(init?: RequestInit, input?: RequestInfo | URL): boolean {
  const fromInit = init?.headers;
  if (fromInit) {
    if (fromInit instanceof Headers) return fromInit.get("x-pulse-silent") === "1";
    if (Array.isArray(fromInit)) return fromInit.some(([k, v]) => k.toLowerCase() === "x-pulse-silent" && v === "1");
    const record = fromInit as Record<string, string>;
    const key = Object.keys(record).find((k) => k.toLowerCase() === "x-pulse-silent");
    if (key && record[key] === "1") return true;
  }
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.headers.get("x-pulse-silent") === "1";
  }
  return false;
}

function isTrackableRequest(input: RequestInfo | URL, init?: RequestInit): boolean {
  if (headerSaysSilent(init, input)) return false;
  const method = (init?.method ?? (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method === "HEAD" || method === "OPTIONS") return false;

  let url: string;
  try {
    if (typeof input === "string") url = input;
    else if (input instanceof URL) url = input.href;
    else url = input.url;
  } catch {
    return false;
  }

  if (url.startsWith("/api/")) return true;
  if (typeof window !== "undefined") {
    try {
      const parsed = new URL(url, window.location.origin);
      return parsed.origin === window.location.origin && parsed.pathname.startsWith("/api/");
    } catch {
      return false;
    }
  }
  return false;
}

function isInternalNavAnchor(anchor: HTMLAnchorElement): boolean {
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return false;
  try {
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin) return false;
    const next = `${url.pathname}${url.search}`;
    const cur = `${window.location.pathname}${window.location.search}`;
    return next !== cur;
  } catch {
    return false;
  }
}

export function GlobalLoaderProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [fetchCount, setFetchCount] = useState(0);
  const [routePending, setRoutePending] = useState(false);
  const [label, setLabel] = useState("Loading");
  const [visible, setVisible] = useState(false);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shownAt = useRef(0);
  const labelStack = useRef<string[]>([]);

  const busy = routePending || fetchCount > 0;

  const clearRoutePending = useCallback(() => {
    if (routeTimer.current) {
      clearTimeout(routeTimer.current);
      routeTimer.current = null;
    }
    setRoutePending(false);
  }, []);

  const begin = useCallback((nextLabel = "Loading") => {
    labelStack.current.push(nextLabel);
    setLabel(nextLabel);
    setFetchCount((c) => c + 1);
  }, []);

  const end = useCallback(() => {
    labelStack.current.pop();
    setLabel(labelStack.current[labelStack.current.length - 1] ?? (routePending ? "Opening page" : "Loading"));
    setFetchCount((c) => Math.max(0, c - 1));
  }, [routePending]);

  const track = useCallback(
    async <T,>(promise: Promise<T>, nextLabel?: string) => {
      begin(nextLabel);
      try {
        return await promise;
      } finally {
        end();
      }
    },
    [begin, end],
  );

  const startRoute = useCallback(() => {
    setLabel("Opening page");
    setRoutePending(true);
    if (routeTimer.current) clearTimeout(routeTimer.current);
    routeTimer.current = setTimeout(() => {
      routeTimer.current = null;
      setRoutePending(false);
    }, ROUTE_MAX_MS);
  }, []);

  // Debounced visibility
  useEffect(() => {
    if (busy) {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      if (!visible && !showTimer.current) {
        showTimer.current = setTimeout(() => {
          showTimer.current = null;
          shownAt.current = Date.now();
          setVisible(true);
        }, SHOW_DELAY_MS);
      }
      return;
    }

    if (showTimer.current) {
      clearTimeout(showTimer.current);
      showTimer.current = null;
    }
    if (!visible) return;

    const elapsed = Date.now() - shownAt.current;
    const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);
    hideTimer.current = setTimeout(() => {
      hideTimer.current = null;
      setVisible(false);
      setLabel("Loading");
    }, wait);

    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [busy, visible]);

  // Sidebar / Link clicks — non-blocking top bar only for routes.
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!anchor || !(anchor instanceof HTMLAnchorElement)) return;
      if (!isInternalNavAnchor(anchor)) return;
      startRoute();
    }

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [startRoute]);

  const routeKey = `${pathname}?${searchParams?.toString() ?? ""}`;
  useEffect(() => {
    clearRoutePending();
  }, [routeKey, clearRoutePending]);

  // Escape dismisses a stuck indicator.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      clearRoutePending();
      labelStack.current = [];
      setFetchCount(0);
      setVisible(false);
      setLabel("Loading");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clearRoutePending]);

  useEffect(() => {
    const original = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const trackable = isTrackableRequest(input, init);
      if (!trackable) return original(input, init);
      begin("Fetching data");
      try {
        return await original(input, init);
      } finally {
        end();
      }
    };
    return () => {
      window.fetch = original;
    };
  }, [begin, end]);

  const value = useMemo(
    () => ({
      begin,
      end,
      track,
      busy,
    }),
    [begin, end, track, busy],
  );

  const displayLabel = routePending ? "Opening page" : label;

  return (
    <GlobalLoaderContext.Provider value={value}>
      {children}
      <GlobalLoaderChrome visible={visible} label={displayLabel} routeOnly={routePending && fetchCount === 0} />
    </GlobalLoaderContext.Provider>
  );
}

export function useGlobalLoader() {
  const ctx = useContext(GlobalLoaderContext);
  if (!ctx) {
    return {
      begin: () => undefined,
      end: () => undefined,
      track: async <T,>(promise: Promise<T>) => promise,
      busy: false,
    } satisfies GlobalLoaderContextValue;
  }
  return ctx;
}

/**
 * Never captures clicks — sidebar and page stay usable.
 * Route-only: slim top bar. Data fetches: soft card + top bar.
 */
function GlobalLoaderChrome({
  visible,
  label,
  routeOnly,
}: {
  visible: boolean;
  label: string;
  routeOnly: boolean;
}) {
  return (
    <>
      <div
        aria-hidden={!visible}
        className={cn(
          "pointer-events-none fixed top-0 right-0 left-0 z-[210] h-0.5 overflow-hidden bg-transparent transition-opacity duration-200",
          visible ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="h-full w-1/3 animate-[pulse-slide_1.1s_ease-in-out_infinite] rounded-r-full bg-primary shadow-[0_0_12px_rgba(37,99,235,0.65)]" />
      </div>

      {!routeOnly ? (
        <div
          aria-live="polite"
          aria-busy={visible}
          className={cn(
            "pointer-events-none fixed inset-0 z-[200] flex items-center justify-center transition-opacity duration-200",
            visible ? "opacity-100" : "opacity-0",
          )}
        >
          <div
            className={cn(
              "absolute inset-0 bg-[#0b1f4d]/15 backdrop-blur-[1px] transition-opacity duration-300",
              visible ? "opacity-100" : "opacity-0",
            )}
          />
          <div
            className={cn(
              "relative flex min-w-[200px] flex-col items-center gap-4 rounded-2xl border border-white/40 bg-white/95 px-8 py-7 shadow-2xl shadow-[#0b1f4d]/15 ring-1 ring-black/5",
              "transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
              visible ? "translate-y-0 scale-100" : "translate-y-2 scale-95",
            )}
            role="status"
          >
            <div className="relative size-12">
              <span className="absolute inset-0 rounded-full border-2 border-[#dbe1ff]" />
              <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary border-r-primary/40" />
              <span className="absolute inset-2 animate-pulse rounded-full bg-primary/10" />
              <span className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold tracking-tight text-foreground">{label}</p>
              <p className="mt-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Pulse Analytics</p>
              <p className="mt-2 text-[10px] text-muted-foreground">Press Esc to dismiss</p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
