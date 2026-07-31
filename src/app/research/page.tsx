"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

const MAX_KEYWORDS = 10;
const RESEARCH_STATE_KEY = "ebay-automation:research-state:v2";
const HIGH_QUALITY_MIN_EBAY_DOLLARS = 25;

interface TrendLibraryKeyword {
  id: string;
  rank: number;
  keyword: string;
  niche: string;
  momentum: string;
  sources: string[];
  why: string;
}

interface TrendLibrary {
  market: string;
  version: string;
  researchedAt: string;
  sources: string[];
  snapshotId: string;
  keywords: TrendLibraryKeyword[];
}

interface TrendRun {
  id: string;
  keywordsJson: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  _count: { ideas: number };
}

interface TrendIdea {
  id: string;
  runId: string;
  ebayItemId: string;
  title: string;
  ebayUrl: string | null;
  imageUrl: string | null;
  priceMinor: number;
  searchKeyword: string | null;
  clusterKey: string;
  activeListingCount: number;
  priceMinMinor: number | null;
  priceMaxMinor: number | null;
  priceMedianMinor: number | null;
  score: number;
  status: string;
  productCandidateId: string | null;
  soldLast30Days?: number | null;
  soldCountSource?: string | null;
  demandVerified?: boolean;
  aeMatch: {
    title: string | null;
    imageUrl: string | null;
    confidence: number | null;
    visualScore: number | null;
    visualAvailable: boolean;
  } | null;
}

interface PersistedResearchState {
  keywords: string[];
  draft: string;
  minPrice: string;
  maxPrice: string;
  minListings: string;
  maxListings: string;
  searchLimit: string;
  selectedRunId: string;
  statusFilter: string;
  selectedIds: string[];
  recentlyProcessedIds: string[];
  highQualityFilter?: boolean;
}

function readPersistedResearchState(): PersistedResearchState | null {
  try {
    const raw = window.localStorage.getItem(RESEARCH_STATE_KEY) ?? window.localStorage.getItem("ebay-automation:research-state:v1");
    return raw ? (JSON.parse(raw) as PersistedResearchState) : null;
  } catch {
    return null;
  }
}

function persistResearchState(state: PersistedResearchState) {
  try {
    window.localStorage.setItem(RESEARCH_STATE_KEY, JSON.stringify(state));
  } catch {
    // Research remains usable when browser storage is unavailable.
  }
}

function money(minor: number | null | undefined) {
  if (minor == null) return "—";
  return `$${(minor / 100).toFixed(2)}`;
}

function MatchResultImage({ src: imageUrl }: { src: string | null | undefined }) {
  const [src, setSrc] = useState(imageUrl ?? null);

  useEffect(() => {
    setSrc(imageUrl ?? null);
  }, [imageUrl]);

  if (!src) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-muted text-[10px] text-muted-foreground">No AE image</div>
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className="h-12 w-12 shrink-0 rounded object-cover" onError={() => setSrc(null)} />;
}

function isMatchableIdea(idea: TrendIdea) {
  return idea.status === "DISCOVERED" || idea.status === "REJECTED";
}

function parseKeywordTokens(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((k) => k.trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

function normalizeKeyword(keyword: string) {
  return keyword.trim().replace(/\s+/g, " ").toLowerCase();
}

function collectRecentKeywords(runs: TrendRun[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const run of runs) {
    let parsed: unknown = [];
    try {
      parsed = JSON.parse(run.keywordsJson);
    } catch {
      continue;
    }
    if (!Array.isArray(parsed)) continue;
    for (const item of parsed) {
      if (typeof item !== "string") continue;
      const keyword = item.trim().replace(/\s+/g, " ");
      const key = normalizeKeyword(keyword);
      if (!keyword || seen.has(key)) continue;
      seen.add(key);
      out.push(keyword);
      if (out.length >= 12) return out;
    }
  }
  return out;
}

export default function ResearchPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading research…</p>}>
      <ResearchPageInner />
    </Suspense>
  );
}

function ResearchPageInner() {
  const searchParams = useSearchParams();
  const [keywords, setKeywords] = useState<string[]>(["portable blender", "led strip lights"]);
  const [draft, setDraft] = useState("");
  const draftRef = useRef<HTMLInputElement>(null);
  const [minPrice, setMinPrice] = useState("5");
  const [maxPrice, setMaxPrice] = useState("150");
  const [minListings, setMinListings] = useState("2");
  const [maxListings, setMaxListings] = useState("40");
  const [searchLimit, setSearchLimit] = useState("40");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [runs, setRuns] = useState<TrendRun[]>([]);
  const [ideas, setIdeas] = useState<TrendIdea[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [recentlyProcessed, setRecentlyProcessed] = useState<Set<string>>(new Set());
  const [matchSummary, setMatchSummary] = useState<TrendIdea[] | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [stateRestored, setStateRestored] = useState(false);
  const [trendLibrary, setTrendLibrary] = useState<TrendLibrary | null>(null);
  const [trendNicheFilter, setTrendNicheFilter] = useState("");
  const [trendsBusy, setTrendsBusy] = useState(false);
  const [highQualityFilter, setHighQualityFilter] = useState(false);

  const recentKeywords = useMemo(() => collectRecentKeywords(runs), [runs]);
  const keywordSet = useMemo(() => new Set(keywords.map(normalizeKeyword)), [keywords]);
  const trendNiches = useMemo(() => {
    if (!trendLibrary) return [] as string[];
    return [...new Set(trendLibrary.keywords.map((entry) => entry.niche))];
  }, [trendLibrary]);
  const filteredTrendKeywords = useMemo(() => {
    if (!trendLibrary) return [] as TrendLibraryKeyword[];
    if (!trendNicheFilter) return trendLibrary.keywords;
    return trendLibrary.keywords.filter((entry) => entry.niche === trendNicheFilter);
  }, [trendLibrary, trendNicheFilter]);

  const addKeywords = useCallback((incoming: string[]) => {
    setKeywords((prev) => {
      const next = [...prev];
      const existing = new Set(prev.map(normalizeKeyword));
      for (const raw of incoming) {
        if (next.length >= MAX_KEYWORDS) break;
        const keyword = raw.trim().replace(/\s+/g, " ");
        const key = normalizeKeyword(keyword);
        if (!keyword || existing.has(key)) continue;
        existing.add(key);
        next.push(keyword);
      }
      return next;
    });
  }, []);

  const commitDraft = useCallback(() => {
    const tokens = parseKeywordTokens(draft);
    if (tokens.length === 0) return;
    addKeywords(tokens);
    setDraft("");
  }, [addKeywords, draft]);

  const removeKeyword = useCallback((index: number) => {
    setKeywords((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const loadRuns = useCallback(async () => {
    const res = await fetch("/api/research");
    const json = await res.json();
    const nextRuns = (json.runs ?? []) as TrendRun[];
    setRuns(nextRuns);
    return nextRuns;
  }, []);

  const loadIdeas = useCallback(async (runId?: string, status?: string) => {
    const params = new URLSearchParams();
    if (runId) params.set("runId", runId);
    if (status) params.set("status", status);
    const res = await fetch(`/api/research/ideas?${params}`);
    const json = await res.json();
    const nextIdeas = (json.ideas ?? []) as TrendIdea[];
    setIdeas(nextIdeas);
    setSelected(new Set());
    return nextIdeas;
  }, []);

  const loadTrendLibrary = useCallback(async () => {
    const res = await fetch("/api/research/trends");
    const json = await res.json();
    if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Failed to load trend library");
    setTrendLibrary(json as TrendLibrary);
    return json as TrendLibrary;
  }, []);

  async function refreshTrendLibrary() {
    setTrendsBusy(true);
    try {
      const res = await fetch("/api/research/trends/refresh", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setMessage(typeof json.error === "string" ? json.error : JSON.stringify(json.error ?? json));
        return;
      }
      setTrendLibrary(json as TrendLibrary);
      setMessage(`Trend library refreshed (${(json as TrendLibrary).keywords.length} US seeds, v${(json as TrendLibrary).version}).`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setTrendsBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function restoreResearchState() {
      const saved = readPersistedResearchState();
      const availableRuns = await loadRuns();
      try {
        await loadTrendLibrary();
      } catch {
        // Trend library can be refreshed manually if auto-seed fails.
      }
      const savedRunExists = saved?.selectedRunId && availableRuns.some((run) => run.id === saved.selectedRunId);
      const runId = savedRunExists ? saved.selectedRunId : "";
      const status = saved?.statusFilter ?? "";

      if (saved) {
        setKeywords(Array.isArray(saved.keywords) ? saved.keywords.slice(0, MAX_KEYWORDS) : []);
        setDraft(saved.draft ?? "");
        setMinPrice(saved.minPrice ?? "5");
        setMaxPrice(saved.maxPrice ?? "150");
        setMinListings(saved.minListings ?? "2");
        setMaxListings(saved.maxListings ?? "40");
        setSearchLimit(saved.searchLimit ?? "40");
        setSelectedRunId(runId);
        setStatusFilter(status);
        setHighQualityFilter(Boolean(saved.highQualityFilter));
      }

      const seed = searchParams.get("seed")?.trim();
      if (seed) {
        setKeywords([seed]);
        setDraft("");
      }

      const loadedIdeas = await loadIdeas(runId || undefined, status || undefined);
      if (cancelled) return;

      const savedSelected = new Set(saved?.selectedIds ?? []);
      setSelected(new Set(loadedIdeas.filter((idea) => savedSelected.has(idea.id) && isMatchableIdea(idea)).map((idea) => idea.id)));

      const savedRecent = new Set(saved?.recentlyProcessedIds ?? []);
      const restoredSummary = loadedIdeas.filter((idea) => savedRecent.has(idea.id));
      setRecentlyProcessed(savedRecent);
      setMatchSummary(restoredSummary.length > 0 ? restoredSummary : null);
      setStateRestored(true);
    }

    void restoreResearchState();
    return () => {
      cancelled = true;
    };
  }, [loadRuns, loadIdeas, loadTrendLibrary, searchParams]);

  useEffect(() => {
    if (!stateRestored) return;
    persistResearchState({
      keywords,
      draft,
      minPrice,
      maxPrice,
      minListings,
      maxListings,
      searchLimit,
      selectedRunId,
      statusFilter,
      selectedIds: [...selected],
      recentlyProcessedIds: [...recentlyProcessed],
      highQualityFilter,
    });
  }, [
    draft,
    highQualityFilter,
    keywords,
    maxListings,
    maxPrice,
    minListings,
    minPrice,
    recentlyProcessed,
    searchLimit,
    selected,
    selectedRunId,
    stateRestored,
    statusFilter,
  ]);

  async function startResearch(e: React.FormEvent) {
    e.preventDefault();
    const pending = parseKeywordTokens(draft);
    const keywordList = [...keywords];
    for (const token of pending) {
      if (keywordList.length >= MAX_KEYWORDS) break;
      if (!keywordList.some((k) => normalizeKeyword(k) === normalizeKeyword(token))) {
        keywordList.push(token);
      }
    }
    if (keywordList.length === 0) {
      setMessage("Add at least one seed keyword.");
      draftRef.current?.focus();
      return;
    }
    if (pending.length > 0) {
      setKeywords(keywordList);
      setDraft("");
    }
    setBusy(true);
    setMessage(null);
    try {
      const requestedMin = Math.round(Number(minPrice) * 100) || 500;
      const hqMin = HIGH_QUALITY_MIN_EBAY_DOLLARS * 100;
      const effectiveMin = highQualityFilter ? Math.max(requestedMin, hqMin) : requestedMin;
      if (highQualityFilter && effectiveMin > requestedMin) {
        setMinPrice(String(HIGH_QUALITY_MIN_EBAY_DOLLARS));
      }
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywords: keywordList,
          searchLimit: Number(searchLimit) || 40,
          criteria: {
            minEbayPriceMinor: effectiveMin,
            maxEbayPriceMinor: Math.round(Number(maxPrice) * 100) || 15000,
            minActiveListings: Number(minListings) || 2,
            maxActiveListings: Number(maxListings) || 40,
            topNPerKeyword: 15,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage(JSON.stringify(json.error ?? json));
        return;
      }
      setMessage(`Found ${json.ideas?.length ?? 0} ideas (run ${json.runId}).`);
      setRecentlyProcessed(new Set());
      setMatchSummary(null);
      setSelectedRunId(json.runId);
      await loadRuns();
      await loadIdeas(json.runId, statusFilter);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function matchSelected() {
    if (selected.size === 0) return;
    const requestedIds = [...selected];
    setBusy(true);
    setMessage(null);
    setMatchSummary(null);
    try {
      const res = await fetch("/api/research/ideas/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideaIds: requestedIds, highQualityFilter }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage(JSON.stringify(json.error ?? json));
        return;
      }
      setRecentlyProcessed(new Set(requestedIds));
      const refreshed = await loadIdeas(selectedRunId || undefined, statusFilter);

      let resultIdeas = refreshed;
      if (statusFilter) {
        const params = new URLSearchParams();
        if (selectedRunId) params.set("runId", selectedRunId);
        const ideasRes = await fetch(`/api/research/ideas?${params}`);
        const ideasJson = await ideasRes.json();
        resultIdeas = (ideasJson.ideas ?? []) as TrendIdea[];
      }
      const requested = new Set(requestedIds);
      setMatchSummary(resultIdeas.filter((idea) => requested.has(idea.id)));
      const hqNote =
        highQualityFilter && typeof json.highQualityRejected === "number" && json.highQualityRejected > 0
          ? ` High-margin filter rejected ${json.highQualityRejected}.`
          : highQualityFilter
            ? " High-margin filter on."
            : "";
      setMessage(`Matched ${requestedIds.length} idea(s).${hqNote}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function refreshSoldCounts() {
    const ids = (selected.size > 0 ? [...selected] : ideas.map((idea) => idea.id)).slice(0, 40);
    if (ids.length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/research/ideas/enrich-sold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideaIds: ids }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage(JSON.stringify(json.error ?? json));
        return;
      }
      await loadIdeas(selectedRunId || undefined, statusFilter);
      setMessage(`Updated sold counts on ${json.updated ?? 0} of ${json.total ?? ids.length} idea(s).`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function dismissIdea(id: string) {
    await fetch(`/api/research/ideas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "DISMISSED" }),
    });
    await loadIdeas(selectedRunId || undefined, statusFilter);
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllMatchable() {
    const matchable = ideas.filter(isMatchableIdea);
    if (matchable.every((i) => selected.has(i.id))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(matchable.map((i) => i.id)));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Research</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Identify high-potential inventory with eBay Browse clustering. Opportunity score uses active listings and price
            spread — not verified 30-day sold. Select ideas, then find AliExpress matches.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/candidates">
            <button type="button" className="h-8 rounded-lg border border-input bg-card px-3 text-sm font-medium hover:bg-muted">
              Open candidates
            </button>
          </Link>
        </div>
      </div>

      <form onSubmit={startResearch} className="space-y-4 rounded-lg border border-border bg-card p-4">
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <label htmlFor="keyword-draft" className="text-sm font-medium text-foreground/80">
                Seed keywords
              </label>
              <p className="text-xs text-muted-foreground">Type and press Enter, paste a list, or tap a trending / recent keyword.</p>
            </div>
            <p className="text-xs tabular-nums text-muted-foreground">
              {keywords.length}/{MAX_KEYWORDS}
            </p>
          </div>

          <div
            className="flex min-h-[3rem] cursor-text flex-wrap items-center gap-2 rounded-md border border-input bg-card px-2.5 py-2 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring"
            onClick={() => draftRef.current?.focus()}
          >
            {keywords.map((keyword, index) => (
              <span
                key={`${keyword}-${index}`}
                className="inline-flex max-w-full items-center gap-1 rounded-full bg-accent/50 px-2.5 py-1 text-sm text-primary"
              >
                <span className="truncate">{keyword}</span>
                <button
                  type="button"
                  className="rounded-full px-1 text-primary hover:bg-accent hover:text-accent-foreground"
                  aria-label={`Remove ${keyword}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeKeyword(index);
                  }}
                >
                  ×
                </button>
              </span>
            ))}
            <input
              id="keyword-draft"
              ref={draftRef}
              value={draft}
              disabled={keywords.length >= MAX_KEYWORDS}
              placeholder={
                keywords.length === 0 ? "e.g. portable blender" : keywords.length >= MAX_KEYWORDS ? "Limit reached" : "Add another…"
              }
              className="min-w-[10rem] flex-1 border-0 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitDraft}
              onPaste={(e) => {
                const text = e.clipboardData.getData("text");
                const tokens = parseKeywordTokens(text);
                if (tokens.length <= 1) return;
                e.preventDefault();
                addKeywords(tokens);
                setDraft("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  commitDraft();
                  return;
                }
                if (e.key === "Backspace" && draft.length === 0 && keywords.length > 0) {
                  e.preventDefault();
                  removeKeyword(keywords.length - 1);
                }
              }}
            />
          </div>

          {keywords.length > 0 && (
            <div className="flex justify-end">
              <button
                type="button"
                className="rounded-full px-3 py-1 text-xs text-muted-foreground hover:text-rose-700"
                onClick={() => setKeywords([])}
              >
                Clear all
              </button>
            </div>
          )}

          <div className="overflow-hidden rounded-lg border border-border bg-muted">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
              <div>
                <p className="text-sm font-medium text-foreground">US trending library</p>
                <p className="text-xs text-muted-foreground">
                  {trendLibrary
                    ? `Top ${trendLibrary.keywords.length} · v${trendLibrary.version} · researched ${new Date(trendLibrary.researchedAt).toLocaleDateString()}`
                    : "Loading curated seeds…"}
                </p>
              </div>
              <button
                type="button"
                disabled={busy || trendsBusy}
                onClick={() => void refreshTrendLibrary()}
                className="rounded-md border border-input bg-card px-3 py-1.5 text-xs font-medium text-foreground/80 hover:border-primary hover:text-primary disabled:opacity-50"
              >
                {trendsBusy ? "Refreshing…" : "Refresh Trends"}
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5 border-b border-border px-3 py-2">
              <button
                type="button"
                className={`rounded-full px-2.5 py-1 text-xs ${trendNicheFilter === "" ? "bg-primary text-white" : "bg-card text-muted-foreground hover:bg-accent/50"}`}
                onClick={() => setTrendNicheFilter("")}
              >
                All niches
              </button>
              {trendNiches.map((niche) => (
                <button
                  key={niche}
                  type="button"
                  className={`rounded-full px-2.5 py-1 text-xs ${trendNicheFilter === niche ? "bg-primary text-white" : "bg-card text-muted-foreground hover:bg-accent/50"}`}
                  onClick={() => setTrendNicheFilter(niche)}
                >
                  {niche}
                </button>
              ))}
            </div>

            <div className="max-h-64 overflow-y-auto">
              {filteredTrendKeywords.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">No trending keywords yet. Click Refresh Trends.</p>
              ) : (
                <ul className="divide-y divide-slate-200">
                  {filteredTrendKeywords.map((entry) => {
                    const active = keywordSet.has(normalizeKeyword(entry.keyword));
                    return (
                      <li key={entry.id} className="flex items-start gap-3 px-3 py-2">
                        <span className="w-6 shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">#{entry.rank}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{entry.keyword}</span>
                            <span className="rounded bg-card px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                              {entry.niche}
                            </span>
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{entry.momentum}</span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">{entry.why}</p>
                        </div>
                        <button
                          type="button"
                          disabled={busy || active || keywords.length >= MAX_KEYWORDS}
                          className={`shrink-0 rounded-md border px-2 py-1 text-xs ${active ? "border-accent bg-accent/50 text-primary" : "border-input bg-card text-foreground/80 hover:border-primary hover:text-primary"} disabled:opacity-50`}
                          onClick={() => addKeywords([entry.keyword])}
                          title={entry.sources.join(", ")}
                        >
                          {active ? "Added" : "Add"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {recentKeywords.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent</p>
              <div className="flex flex-wrap gap-1.5">
                {recentKeywords.map((keyword) => {
                  const active = keywordSet.has(normalizeKeyword(keyword));
                  return (
                    <button
                      key={keyword}
                      type="button"
                      disabled={busy || active || keywords.length >= MAX_KEYWORDS}
                      className={`rounded-md border px-2 py-1 text-xs ${active ? "border-accent bg-accent/50 text-primary" : "border-border text-muted-foreground hover:border-primary hover:text-primary"} disabled:opacity-50`}
                      onClick={() => addKeywords([keyword])}
                    >
                      {active ? "✓ " : "+ "}
                      {keyword}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-sm">
            Min price ($)
            <input
              type="number"
              step="0.01"
              className="mt-1 w-full rounded-md border border-input px-2 py-1.5"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Max price ($)
            <input
              type="number"
              step="0.01"
              className="mt-1 w-full rounded-md border border-input px-2 py-1.5"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Min active listings
            <input
              type="number"
              className="mt-1 w-full rounded-md border border-input px-2 py-1.5"
              value={minListings}
              onChange={(e) => setMinListings(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Max active listings
            <input
              type="number"
              className="mt-1 w-full rounded-md border border-input px-2 py-1.5"
              value={maxListings}
              onChange={(e) => setMaxListings(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Browse limit / keyword
            <input
              type="number"
              className="mt-1 w-full rounded-md border border-input px-2 py-1.5"
              value={searchLimit}
              onChange={(e) => setSearchLimit(e.target.value)}
            />
          </label>
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-muted px-3 py-2 text-sm">
          <input type="checkbox" className="mt-1" checked={highQualityFilter} onChange={(e) => setHighQualityFilter(e.target.checked)} />
          <span>
            <span className="font-medium text-foreground">High-margin opportunity filter</span>
            <span className="mt-1 block text-muted-foreground">
              Optional. Raises min eBay price to ${HIGH_QUALITY_MIN_EBAY_DOLLARS}+ on research, then AE match requires cheap landed cost
              (≤50% of eBay), ≥15% net margin, and 100+ AE orders.
            </span>
          </span>
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/80 disabled:opacity-50"
        >
          {busy ? "Working…" : "Run research"}
        </button>
      </form>

      {message && <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground/80">{message}</p>}

      {matchSummary && (
        <section className="overflow-hidden rounded-lg border border-emerald-200 bg-emerald-50">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200 px-4 py-3">
            <div>
              <h3 className="font-semibold text-emerald-950">AliExpress matching complete</h3>
              <p className="text-sm text-emerald-800">
                {matchSummary.filter((idea) => idea.status === "AE_MATCHED").length} matched ·{" "}
                {matchSummary.filter((idea) => idea.status !== "AE_MATCHED").length} need review
              </p>
            </div>
            <Link href="/candidates" className="text-sm font-medium text-emerald-800 hover:underline">
              View all candidates →
            </Link>
          </div>
          <div className="grid gap-2 p-3 md:grid-cols-2">
            {matchSummary.map((idea) => (
              <div key={idea.id} className="flex min-w-0 items-center gap-3 rounded-md border border-emerald-200 bg-card p-3">
                <MatchResultImage src={idea.aeMatch?.imageUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{idea.aeMatch?.title ?? idea.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    <span className={idea.status === "AE_MATCHED" ? "font-medium text-emerald-700" : "font-medium text-amber-700"}>
                      {idea.status === "AE_MATCHED" ? "✓ AE match found" : "Needs review"}
                    </span>
                    {idea.aeMatch?.visualAvailable && idea.aeMatch.visualScore != null && (
                      <span className="text-muted-foreground">Visual {idea.aeMatch.visualScore}/100</span>
                    )}
                    {idea.productCandidateId && (
                      <Link href={`/candidates/${idea.productCandidateId}`} className="font-medium text-primary hover:underline">
                        Open candidate
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Run
          <select
            className="mt-1 block rounded-md border border-input px-3 py-2 text-sm"
            value={selectedRunId}
            onChange={(e) => {
              const id = e.target.value;
              setSelectedRunId(id);
              setRecentlyProcessed(new Set());
              setMatchSummary(null);
              loadIdeas(id || undefined, statusFilter);
            }}
          >
            <option value="">All runs</option>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {new Date(r.startedAt).toLocaleString()} · {r.status} · {r._count.ideas} ideas
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Status
          <select
            className="mt-1 block rounded-md border border-input px-3 py-2 text-sm"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              loadIdeas(selectedRunId || undefined, e.target.value);
            }}
          >
            <option value="">All</option>
            <option value="DISCOVERED">Discovered</option>
            <option value="AE_MATCHED">AE matched</option>
            <option value="REJECTED">Rejected</option>
            <option value="DISMISSED">Dismissed</option>
          </select>
        </label>
        <button
          type="button"
          disabled={busy || selected.size === 0}
          onClick={matchSelected}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/80 disabled:opacity-50"
        >
          Find AE match ({selected.size}){highQualityFilter ? " · HQ" : ""}
        </button>
        <button
          type="button"
          disabled={busy || ideas.length === 0}
          onClick={refreshSoldCounts}
          className="rounded-md border border-input bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
        >
          Refresh sold counts
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-muted text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">
                <input type="checkbox" onChange={toggleAllMatchable} aria-label="Select all matchable ideas" />
              </th>
              <th className="px-3 py-2">Score</th>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Keyword</th>
              <th className="px-3 py-2">Price / band</th>
              <th className="px-3 py-2">Active</th>
              <th
                className="px-3 py-2"
                title="life est = Browse lifetime estimated sold on this listing (not purchase-history last 30 days). Verified 30d needs Insights or purchase-history cookie."
              >
                Sold
              </th>
              <th className="px-3 py-2">Visual match</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {ideas.length === 0 && (
              <tr>
                <td colSpan={10} className="p-0">
                  <div className="relative m-3 overflow-hidden rounded-xl">
                    <Image
                      src="/media/overview-empty.jpg"
                      alt="Research workspace"
                      width={1200}
                      height={400}
                      className="h-40 w-full object-cover"
                    />
                    <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 to-transparent p-4 text-white">
                      <p className="font-medium">No ideas yet</p>
                      <p className="text-xs text-white/80">Add seed keywords above and run research to fill this table.</p>
                    </div>
                  </div>
                </td>
              </tr>
            )}
            {ideas.map((idea) => (
              <tr
                key={idea.id}
                className={`border-b align-top transition-colors ${recentlyProcessed.has(idea.id) ? (idea.status === "AE_MATCHED" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50") : "border-border/70"}`}
              >
                <td className="px-3 py-3">
                  {idea.status === "AE_MATCHED" ? (
                    <span
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white"
                      title="AliExpress match found"
                    >
                      ✓
                    </span>
                  ) : (
                    <input
                      type="checkbox"
                      checked={selected.has(idea.id)}
                      disabled={!isMatchableIdea(idea)}
                      onChange={() => toggle(idea.id)}
                    />
                  )}
                </td>
                <td className="px-3 py-3 tabular-nums font-medium">{idea.score}</td>
                <td className="px-3 py-3">
                  <div className="flex gap-2">
                    {idea.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={idea.imageUrl} alt="" className="h-12 w-12 rounded object-cover" />
                    )}
                    <div>
                      {idea.ebayUrl ? (
                        <a href={idea.ebayUrl} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                          {idea.title}
                        </a>
                      ) : (
                        <span className="font-medium">{idea.title}</span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-muted-foreground">{idea.searchKeyword ?? "—"}</td>
                <td className="px-3 py-3 tabular-nums">
                  {money(idea.priceMinor)}
                  <div className="text-xs text-muted-foreground">
                    {money(idea.priceMinMinor)}–{money(idea.priceMaxMinor)} · med {money(idea.priceMedianMinor)}
                  </div>
                </td>
                <td className="px-3 py-3 tabular-nums">{idea.activeListingCount}</td>
                <td className="px-3 py-3 tabular-nums">
                  {typeof idea.soldLast30Days === "number" ? (
                    <span
                      className={
                        idea.soldLast30Days >= 5
                          ? "font-semibold text-emerald-800"
                          : idea.soldLast30Days > 0
                            ? "font-medium text-foreground"
                            : "text-muted-foreground"
                      }
                      title={
                        idea.soldCountSource === "browse_estimate"
                          ? "Browse estimated lifetime sold on this listing — NOT the last-30-day count from purchase history"
                          : idea.soldCountSource === "purchase_history"
                            ? "From eBay purchase history (last ~30 days)"
                            : idea.soldCountSource === "insights"
                              ? "From Marketplace Insights (last ~30 days)"
                              : "Sold count"
                      }
                    >
                      {idea.soldLast30Days}
                      {idea.soldCountSource === "browse_estimate" ? (
                        <span className="ml-1 text-[10px] font-normal uppercase tracking-wide text-muted-foreground">life est</span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground" title="Sold count not fetched yet — use Refresh sold">
                      —
                    </span>
                  )}
                </td>
                <td className="min-w-28 px-3 py-3">
                  {idea.aeMatch?.visualAvailable && idea.aeMatch.visualScore != null ? (
                    <div title="DINOv2 image similarity score">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold tabular-nums text-foreground">{idea.aeMatch.visualScore}/100</span>
                        <span className="text-muted-foreground">DINOv2</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className={`h-full rounded-full ${idea.aeMatch.visualScore >= 75 ? "bg-emerald-500" : idea.aeMatch.visualScore >= 55 ? "bg-amber-500" : "bg-rose-500"}`}
                          style={{ width: `${idea.aeMatch.visualScore}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Not available</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${idea.status === "AE_MATCHED" ? "bg-emerald-100 text-emerald-800" : idea.status === "REJECTED" ? "bg-amber-100 text-amber-800" : "bg-muted text-foreground/80"}`}
                  >
                    {idea.status === "AE_MATCHED"
                      ? "✓ AE matched"
                      : idea.status === "REJECTED"
                        ? "Needs review"
                        : idea.status.replaceAll("_", " ")}
                  </span>
                  {idea.productCandidateId && (
                    <div className="mt-1">
                      <Link href={`/candidates/${idea.productCandidateId}`} className="text-xs text-primary hover:underline">
                        View candidate
                      </Link>
                    </div>
                  )}
                </td>
                <td className="px-3 py-3">
                  {idea.status === "DISCOVERED" && (
                    <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => dismissIdea(idea.id)}>
                      Dismiss
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm ring-1 ring-black/5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold">Active-listing proxy</p>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-800">Browse</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Opportunity score uses price band + active competition — not verified 30-day sold. Use Refresh sold / Insights for true
            demand.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm ring-1 ring-black/5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold">Match gate</p>
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-900">Action</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Select ideas → Find AE match. Visual DINOv2 scores appear when image search runs. HQ filter prefers higher ASP seeds.
          </p>
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-[#0b1f4d] text-white shadow-sm ring-1 ring-black/5">
          <div className="relative p-4">
            <Image
              src="/media/product-tech.jpg"
              alt=""
              width={400}
              height={120}
              className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-25"
            />
            <div className="relative">
              <p className="text-sm font-semibold">Auto-research</p>
              <p className="mt-2 text-xs leading-relaxed text-blue-100/90">
                Prefer hands-off? Start an Automation run — same matching stack with approval before export.
              </p>
              <Link
                href="/automation"
                className="mt-3 inline-flex rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-[#0b1f4d] hover:bg-blue-50"
              >
                Open Automation
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
