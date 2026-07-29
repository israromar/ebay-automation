"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const MAX_KEYWORDS = 10;

const KEYWORD_PACKS: { id: string; label: string; keywords: string[] }[] = [
  { id: "kitchen", label: "Kitchen gadgets", keywords: ["portable blender", "air fryer accessories", "silicone cooking utensils", "electric milk frother"] },
  { id: "lighting", label: "LED & lighting", keywords: ["led strip lights", "motion sensor night light", "usb desk lamp", "rgb gaming lights"] },
  { id: "phone", label: "Phone & travel", keywords: ["magnetic phone mount", "portable phone charger", "cable organizer travel", "wireless earbuds case"] },
  { id: "pet", label: "Pet & home", keywords: ["pet water fountain", "automatic pet feeder", "lint remover roller", "door draft stopper"] },
];

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
  aeMatch: {
    title: string | null;
    imageUrl: string | null;
    confidence: number | null;
    visualScore: number | null;
    visualAvailable: boolean;
  } | null;
}

function money(minor: number | null | undefined) {
  if (minor == null) return "—";
  return `$${(minor / 100).toFixed(2)}`;
}

function MatchResultImage({ primary, fallback }: { primary: string | null | undefined; fallback: string | null | undefined }) {
  const [src, setSrc] = useState(primary ?? fallback ?? null);

  useEffect(() => {
    setSrc(primary ?? fallback ?? null);
  }, [primary, fallback]);

  if (!src) {
    return <div className="h-12 w-12 shrink-0 rounded bg-slate-100" aria-hidden="true" />;
  }

  // AliExpress occasionally blocks browser hotlinks, so fall back to the eBay image.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className="h-12 w-12 shrink-0 rounded object-cover" onError={() => setSrc(src !== fallback ? (fallback ?? null) : null)} />;
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

  const recentKeywords = useMemo(() => collectRecentKeywords(runs), [runs]);
  const keywordSet = useMemo(() => new Set(keywords.map(normalizeKeyword)), [keywords]);

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
    setRuns(json.runs ?? []);
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

  useEffect(() => {
    loadRuns();
    loadIdeas();
  }, [loadRuns, loadIdeas]);

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
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywords: keywordList,
          searchLimit: Number(searchLimit) || 40,
          criteria: {
            minEbayPriceMinor: Math.round(Number(minPrice) * 100) || 500,
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
        body: JSON.stringify({ ideaIds: requestedIds }),
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
      <div>
        <h2 className="text-2xl font-semibold">Trending research</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">Opportunity score uses active eBay listings and price spread for your keywords — not sold history. Select ideas, then find AliExpress matches to create platform candidates.</p>
      </div>

      <form onSubmit={startResearch} className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <label htmlFor="keyword-draft" className="text-sm font-medium text-slate-700">
                Seed keywords
              </label>
              <p className="text-xs text-slate-500">Type and press Enter, paste a list, or tap a pack / recent keyword.</p>
            </div>
            <p className="text-xs tabular-nums text-slate-500">
              {keywords.length}/{MAX_KEYWORDS}
            </p>
          </div>

          <div className="flex min-h-[3rem] cursor-text flex-wrap items-center gap-2 rounded-md border border-slate-300 bg-white px-2.5 py-2 focus-within:border-teal-600 focus-within:ring-1 focus-within:ring-teal-600" onClick={() => draftRef.current?.focus()}>
            {keywords.map((keyword, index) => (
              <span key={`${keyword}-${index}`} className="inline-flex max-w-full items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1 text-sm text-teal-900">
                <span className="truncate">{keyword}</span>
                <button
                  type="button"
                  className="rounded-full px-1 text-teal-700 hover:bg-teal-100 hover:text-teal-950"
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
              placeholder={keywords.length === 0 ? "e.g. portable blender" : keywords.length >= MAX_KEYWORDS ? "Limit reached" : "Add another…"}
              className="min-w-[10rem] flex-1 border-0 bg-transparent py-1 text-sm outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
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

          <div className="flex flex-wrap gap-2">
            {KEYWORD_PACKS.map((pack) => (
              <button key={pack.id} type="button" disabled={busy || keywords.length >= MAX_KEYWORDS} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-900 disabled:opacity-50" onClick={() => addKeywords(pack.keywords)} title={pack.keywords.join(", ")}>
                + {pack.label}
              </button>
            ))}
            {keywords.length > 0 && (
              <button type="button" className="rounded-full px-3 py-1 text-xs text-slate-500 hover:text-rose-700" onClick={() => setKeywords([])}>
                Clear all
              </button>
            )}
          </div>

          {recentKeywords.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">Recent</p>
              <div className="flex flex-wrap gap-1.5">
                {recentKeywords.map((keyword) => {
                  const active = keywordSet.has(normalizeKeyword(keyword));
                  return (
                    <button key={keyword} type="button" disabled={busy || active || keywords.length >= MAX_KEYWORDS} className={`rounded-md border px-2 py-1 text-xs ${active ? "border-teal-200 bg-teal-50 text-teal-800" : "border-slate-200 text-slate-600 hover:border-teal-300 hover:text-teal-900"} disabled:opacity-50`} onClick={() => addKeywords([keyword])}>
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
            <input type="number" step="0.01" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} />
          </label>
          <label className="text-sm">
            Max price ($)
            <input type="number" step="0.01" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
          </label>
          <label className="text-sm">
            Min active listings
            <input type="number" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5" value={minListings} onChange={(e) => setMinListings(e.target.value)} />
          </label>
          <label className="text-sm">
            Max active listings
            <input type="number" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5" value={maxListings} onChange={(e) => setMaxListings(e.target.value)} />
          </label>
          <label className="text-sm">
            Browse limit / keyword
            <input type="number" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5" value={searchLimit} onChange={(e) => setSearchLimit(e.target.value)} />
          </label>
        </div>
        <button type="submit" disabled={busy} className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50">
          {busy ? "Working…" : "Run research"}
        </button>
      </form>

      {message && <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{message}</p>}

      {matchSummary && (
        <section className="overflow-hidden rounded-lg border border-emerald-200 bg-emerald-50">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200 px-4 py-3">
            <div>
              <h3 className="font-semibold text-emerald-950">AliExpress matching complete</h3>
              <p className="text-sm text-emerald-800">
                {matchSummary.filter((idea) => idea.status === "AE_MATCHED").length} matched · {matchSummary.filter((idea) => idea.status !== "AE_MATCHED").length} need review
              </p>
            </div>
            <Link href="/candidates" className="text-sm font-medium text-emerald-800 hover:underline">
              View all candidates →
            </Link>
          </div>
          <div className="grid gap-2 p-3 md:grid-cols-2">
            {matchSummary.map((idea) => (
              <div key={idea.id} className="flex min-w-0 items-center gap-3 rounded-md border border-emerald-200 bg-white p-3">
                <MatchResultImage primary={idea.aeMatch?.imageUrl} fallback={idea.imageUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{idea.aeMatch?.title ?? idea.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    <span className={idea.status === "AE_MATCHED" ? "font-medium text-emerald-700" : "font-medium text-amber-700"}>{idea.status === "AE_MATCHED" ? "✓ AE match found" : "Needs review"}</span>
                    {idea.aeMatch?.visualAvailable && idea.aeMatch.visualScore != null && <span className="text-slate-600">Visual {idea.aeMatch.visualScore}/100</span>}
                    {idea.productCandidateId && (
                      <Link href={`/candidates/${idea.productCandidateId}`} className="font-medium text-teal-700 hover:underline">
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
            className="mt-1 block rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={selectedRunId}
            onChange={(e) => {
              const id = e.target.value;
              setSelectedRunId(id);
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
            className="mt-1 block rounded-md border border-slate-300 px-3 py-2 text-sm"
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
        <button type="button" disabled={busy || selected.size === 0} onClick={matchSelected} className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50">
          Find AE match ({selected.size})
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">
                <input type="checkbox" onChange={toggleAllMatchable} aria-label="Select all matchable ideas" />
              </th>
              <th className="px-3 py-2">Score</th>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Keyword</th>
              <th className="px-3 py-2">Price / band</th>
              <th className="px-3 py-2">Active</th>
              <th className="px-3 py-2">Visual match</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {ideas.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                  No ideas yet. Run research with seed keywords.
                </td>
              </tr>
            )}
            {ideas.map((idea) => (
              <tr key={idea.id} className={`border-b align-top transition-colors ${recentlyProcessed.has(idea.id) ? (idea.status === "AE_MATCHED" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50") : "border-slate-100"}`}>
                <td className="px-3 py-3">
                  {idea.status === "AE_MATCHED" ? (
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white" title="AliExpress match found">
                      ✓
                    </span>
                  ) : (
                    <input type="checkbox" checked={selected.has(idea.id)} disabled={!isMatchableIdea(idea)} onChange={() => toggle(idea.id)} />
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
                        <a href={idea.ebayUrl} target="_blank" rel="noreferrer" className="font-medium text-teal-800 hover:underline">
                          {idea.title}
                        </a>
                      ) : (
                        <span className="font-medium">{idea.title}</span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-slate-600">{idea.searchKeyword ?? "—"}</td>
                <td className="px-3 py-3 tabular-nums">
                  {money(idea.priceMinor)}
                  <div className="text-xs text-slate-500">
                    {money(idea.priceMinMinor)}–{money(idea.priceMaxMinor)} · med {money(idea.priceMedianMinor)}
                  </div>
                </td>
                <td className="px-3 py-3 tabular-nums">{idea.activeListingCount}</td>
                <td className="min-w-28 px-3 py-3">
                  {idea.aeMatch?.visualAvailable && idea.aeMatch.visualScore != null ? (
                    <div title="DINOv2 image similarity score">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold tabular-nums text-slate-800">{idea.aeMatch.visualScore}/100</span>
                        <span className="text-slate-500">DINOv2</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
                        <div className={`h-full rounded-full ${idea.aeMatch.visualScore >= 75 ? "bg-emerald-500" : idea.aeMatch.visualScore >= 55 ? "bg-amber-500" : "bg-rose-500"}`} style={{ width: `${idea.aeMatch.visualScore}%` }} />
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">Not available</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${idea.status === "AE_MATCHED" ? "bg-emerald-100 text-emerald-800" : idea.status === "REJECTED" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>{idea.status === "AE_MATCHED" ? "✓ AE matched" : idea.status === "REJECTED" ? "Needs review" : idea.status.replaceAll("_", " ")}</span>
                  {idea.productCandidateId && (
                    <div className="mt-1">
                      <Link href={`/candidates/${idea.productCandidateId}`} className="text-xs text-teal-700 hover:underline">
                        View candidate
                      </Link>
                    </div>
                  )}
                </td>
                <td className="px-3 py-3">
                  {idea.status === "DISCOVERED" && (
                    <button type="button" className="text-xs text-slate-600 hover:underline" onClick={() => dismissIdea(idea.id)}>
                      Dismiss
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
