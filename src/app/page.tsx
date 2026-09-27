"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ChevronLeft, ChevronRight, Download, ExternalLink, Flame, Play, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExtensionChip } from "@/components/hunt/extension-connect";
import { compact, fetchJson, money, relativeTime } from "@/components/hunt/format";
import { HuntProgress, useHuntRunner } from "@/components/hunt/hunt-progress";
import { Thumb } from "@/components/hunt/thumb";
import { TierBadge } from "@/components/hunt/tier-badge";
import type { Hunt, ListingRow } from "@/components/hunt/types";
import { cn } from "@/lib/utils";

type View = "winners" | "watching" | "all";
type Sort = "sold" | "profit" | "margin" | "newest";

interface ListingsResponse {
  items: ListingRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<View, number>;
  settings: { minSold30d: number; minAeRating: number };
}

interface KeywordCatalog {
  niches: string[];
  keywords: Array<{ rank: number; keyword: string; niche: string }>;
}

interface Integrations {
  ebay: boolean;
  aliexpress: boolean;
  cron: boolean;
}

const VIEWS: Array<{ id: View; label: string; hint: string }> = [
  { id: "winners", label: "Winners", hint: "Measured demand ≥ threshold and a qualifying AliExpress source" },
  { id: "watching", label: "Watching", hint: "Tracked daily until demand is measured, or no qualifying source yet" },
  { id: "all", label: "All tracked", hint: "Every listing the hunter is tracking" },
];

export default function HuntPage() {
  const router = useRouter();
  const params = useSearchParams();

  const [keywordsText, setKeywordsText] = useState("");
  const [niche, setNiche] = useState("");
  const [trendingCount, setTrendingCount] = useState(10);
  const [catalog, setCatalog] = useState<KeywordCatalog | null>(null);
  const [integrations, setIntegrations] = useState<Integrations | null>(null);
  const [startError, setStartError] = useState("");
  const [starting, setStarting] = useState(false);
  const [activeHunt, setActiveHunt] = useState<Hunt | null>(null);
  const [recentHunts, setRecentHunts] = useState<Hunt[]>([]);

  const view = (params.get("view") as View) || "winners";
  const sort = (params.get("sort") as Sort) || "sold";
  const q = params.get("q") ?? "";
  const huntId = params.get("huntId") ?? "";
  const page = Number(params.get("page") ?? 1) || 1;
  const [minSold, setMinSold] = useState(params.get("minSold") ?? "");
  const [minRating, setMinRating] = useState(params.get("minRating") ?? "");
  const [search, setSearch] = useState(q);
  const [data, setData] = useState<ListingsResponse | null>(null);
  const [listError, setListError] = useState("");

  const setParam = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v == null || v === "") next.delete(k);
        else next.set(k, v);
      }
      if (!("page" in updates)) next.delete("page");
      router.replace(`/?${next.toString()}`, { scroll: false });
    },
    [params, router],
  );

  const listingQuery = useMemo(() => {
    const qs = new URLSearchParams({ view, sort, page: String(page) });
    if (q) qs.set("q", q);
    if (huntId) qs.set("huntId", huntId);
    if (params.get("minSold")) qs.set("minSold", params.get("minSold")!);
    if (params.get("minRating")) qs.set("minRating", params.get("minRating")!);
    return qs.toString();
  }, [view, sort, page, q, huntId, params]);

  const loadListings = useCallback(
    async (silent = false) => {
      try {
        setListError("");
        setData(await fetchJson<ListingsResponse>(`/api/listings?${listingQuery}`, { silent }));
      } catch (e) {
        setListError(e instanceof Error ? e.message : String(e));
      }
    },
    [listingQuery],
  );

  useEffect(() => {
    void loadListings();
  }, [loadListings]);

  useEffect(() => {
    setSearch(q);
  }, [q]);

  useEffect(() => {
    void fetchJson<KeywordCatalog>("/api/keywords", { silent: true })
      .then(setCatalog)
      .catch(() => undefined);
    void fetchJson<{ integrations: Integrations }>("/api/settings", { silent: true })
      .then((r) => setIntegrations(r.integrations))
      .catch(() => undefined);
    void fetchJson<{ hunts: Hunt[] }>("/api/hunts", { silent: true })
      .then((r) => {
        setRecentHunts(r.hunts);
        const running = r.hunts.find((h) => h.status === "RUNNING");
        if (running) setActiveHunt(running);
      })
      .catch(() => undefined);
  }, []);

  const onProgress = useCallback(
    (h: Hunt) => {
      setRecentHunts((prev) => [h, ...prev.filter((p) => p.id !== h.id)]);
      void loadListings(true);
    },
    [loadListings],
  );
  const runner = useHuntRunner(activeHunt, onProgress);

  const typedKeywords = keywordsText
    .split(/[\n,]/)
    .map((k) => k.trim())
    .filter((k) => k.length >= 2);
  const trendingPreview = useMemo(
    () =>
      (catalog?.keywords ?? [])
        .filter((k) => !niche || k.niche === niche)
        .sort((a, b) => a.rank - b.rank)
        .slice(0, trendingCount)
        .map((k) => k.keyword),
    [catalog, niche, trendingCount],
  );

  async function startHunt() {
    setStarting(true);
    setStartError("");
    try {
      const { hunt } = await fetchJson<{ hunt: Hunt }>("/api/hunts", {
        method: "POST",
        body: JSON.stringify({ keywords: typedKeywords, niche: niche || undefined, trendingCount }),
      });
      setActiveHunt(hunt);
      setRecentHunts((prev) => [hunt, ...prev]);
    } catch (e) {
      setStartError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  }

  const running = runner.hunt?.status === "RUNNING";
  const missingKeys = integrations && (!integrations.ebay || !integrations.aliexpress);
  const exportHref = `/api/listings/export?${listingQuery}`;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const filteredHunt = huntId ? recentHunts.find((h) => h.id === huntId) : null;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Winning product hunter</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Finds eBay listings selling <strong>{data?.settings.minSold30d ?? 20}+ units in the last 30 days</strong> and pairs each with an
            AliExpress source rated <strong>{data?.settings.minAeRating ?? 4.7}★ or higher</strong> that still leaves a profit.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <ExtensionChip />
          <Link href="/import" className="text-sm font-medium text-primary hover:underline">
            Have Terapeak data? Import it →
          </Link>
        </div>
      </header>

      {missingKeys ? (
        <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">API keys missing</p>
            <p className="mt-0.5">
              {!integrations?.ebay ? "Set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET. " : ""}
              {!integrations?.aliexpress ? "Set ALIEXPRESS_APP_KEY, ALIEXPRESS_APP_SECRET and ALIEXPRESS_TRACKING_ID. " : ""}
              Hunts fail until these are configured. The app never shows sample data.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flame className="size-4 text-primary" aria-hidden /> New hunt
            </CardTitle>
            <CardDescription>Enter niches or products, one per line. Leave empty to hunt the trending US keyword list.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={keywordsText}
              onChange={(e) => setKeywordsText(e.target.value)}
              placeholder={"resistance bands\nmouth tape for sleeping\nled strip lights"}
              rows={4}
              disabled={running}
            />
            {typedKeywords.length === 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="niche">Trending niche</Label>
                  <select
                    id="niche"
                    value={niche}
                    onChange={(e) => setNiche(e.target.value)}
                    disabled={running}
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                  >
                    <option value="">All niches</option>
                    {catalog?.niches.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="count">Keywords to hunt</Label>
                  <Input
                    id="count"
                    type="number"
                    min={1}
                    max={50}
                    value={trendingCount}
                    onChange={(e) => setTrendingCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                    disabled={running}
                  />
                </div>
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  <Sparkles className="mr-1 inline size-3" aria-hidden />
                  {trendingPreview.slice(0, 6).join(", ")}
                  {trendingPreview.length > 6 ? ` +${trendingPreview.length - 6} more` : ""}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {typedKeywords.length} keyword(s) · about 200 eBay listings checked per keyword
              </p>
            )}
            {startError ? <p className="text-sm text-destructive">{startError}</p> : null}
            <Button onClick={startHunt} disabled={starting || running} className="w-full sm:w-auto">
              <Play className="size-3.5" /> {running ? "Hunt running…" : starting ? "Starting…" : "Run hunt"}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {runner.hunt ? (
            <HuntProgress hunt={runner.hunt} pollError={runner.pollError} onCancel={() => void runner.cancel()} />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>How demand is measured</CardTitle>
                <CardDescription>
                  eBay has no public “sold in 30 days” API, so every result shows where its number came from.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="flex items-start gap-2">
                  <TierBadge tier="ESTIMATED" />{" "}
                  <span className="text-muted-foreground">Day 0: lifetime sold ÷ listing age. Used only to shortlist.</span>
                </p>
                <p className="flex items-start gap-2">
                  <TierBadge tier="PROJECTED" />{" "}
                  <span className="text-muted-foreground">After 3+ days of daily snapshots, scaled to 30 days.</span>
                </p>
                <p className="flex items-start gap-2">
                  <TierBadge tier="VERIFIED" />{" "}
                  <span className="text-muted-foreground">30 days of snapshots, a listing under 30 days old, or a Terapeak import.</span>
                </p>
                <p className="flex items-start gap-2">
                  <TierBadge tier="VERIFIED" source="purchase_history" />{" "}
                  <span className="text-muted-foreground">
                    Exact count from the listing&apos;s eBay purchase history, via the Chrome extension.
                  </span>
                </p>
              </CardContent>
            </Card>
          )}
          {recentHunts.length > 0 ? (
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="px-1 pb-2 text-xs font-medium text-muted-foreground">Recent hunts</p>
              <ul className="space-y-0.5">
                {recentHunts.slice(0, 5).map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => setParam({ huntId: huntId === h.id ? null : h.id, view: "all" })}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted",
                        huntId === h.id && "bg-accent text-accent-foreground",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{h.label}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {h.status === "RUNNING"
                          ? "running"
                          : h.status === "COMPLETED"
                            ? `${h.winnerCount} winners`
                            : h.status.toLowerCase()}{" "}
                        · {relativeTime(h.startedAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg bg-muted p-[3px]" role="tablist">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                role="tab"
                aria-selected={view === v.id}
                title={v.hint}
                onClick={() => setParam({ view: v.id })}
                className={cn(
                  "rounded-md px-3 py-1 text-sm font-medium text-muted-foreground transition-colors",
                  view === v.id && "bg-card text-foreground shadow-sm",
                )}
              >
                {v.label}
                <span className="ml-1.5 text-xs tabular-nums opacity-70">{data?.counts[v.id] ?? "–"}</span>
              </button>
            ))}
          </div>
          <form
            className="ml-auto flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setParam({ q: search.trim() || null, minSold: minSold || null, minRating: minRating || null });
            }}
          >
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter title or keyword" className="h-8 w-44" />
            <Input
              value={minSold}
              onChange={(e) => setMinSold(e.target.value)}
              placeholder={`Min sold (${data?.settings.minSold30d ?? 20})`}
              inputMode="numeric"
              className="h-8 w-32"
              aria-label="Minimum sold in 30 days"
            />
            <Input
              value={minRating}
              onChange={(e) => setMinRating(e.target.value)}
              placeholder={`Min ★ (${data?.settings.minAeRating ?? 4.7})`}
              inputMode="decimal"
              className="h-8 w-28"
              aria-label="Minimum AliExpress rating"
            />
            <select
              value={sort}
              onChange={(e) => setParam({ sort: e.target.value })}
              className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
              aria-label="Sort"
            >
              <option value="sold">Most sold / 30d</option>
              <option value="profit">Highest profit</option>
              <option value="margin">Highest margin</option>
              <option value="newest">Newest</option>
            </select>
            <Button type="submit" size="sm" variant="outline">
              Apply
            </Button>
            <a
              href={exportHref}
              className="inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-[0.8rem] font-medium text-primary hover:bg-muted"
            >
              <Download className="size-3.5" /> CSV
            </a>
          </form>
        </div>

        {filteredHunt ? (
          <p className="text-xs text-muted-foreground">
            Showing listings from hunt “{filteredHunt.label}” ·{" "}
            <button className="text-primary hover:underline" onClick={() => setParam({ huntId: null })}>
              show all hunts
            </button>
          </p>
        ) : null}

        {listError ? <p className="text-sm text-destructive">{listError}</p> : null}

        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[280px]">eBay listing</TableHead>
                <TableHead className="text-right">Sold / 30d</TableHead>
                <TableHead className="min-w-[260px]">Best AliExpress source</TableHead>
                <TableHead className="text-right">Net profit</TableHead>
                <TableHead className="text-right">Margin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items.map((l) => (
                <TableRow key={l.id} className="cursor-pointer" onClick={() => router.push(`/listings/${l.id}`)}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Thumb src={l.imageUrl} />
                      <div className="min-w-0">
                        <p className="line-clamp-2 max-w-[340px] text-sm font-medium whitespace-normal">{l.title}</p>
                        <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="tabular-nums">{money(l.priceMinor || l.avgSoldPriceMinor)}</span>
                          <span>·</span>
                          <span className="truncate">{l.keyword}</span>
                          {!l.active ? <span className="text-amber-700">· {l.endedReason?.replace(/_/g, " ") ?? "inactive"}</span> : null}
                          <a
                            href={l.url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-0.5 text-primary hover:underline"
                          >
                            eBay <ExternalLink className="size-3" />
                          </a>
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <p className="text-base font-semibold tabular-nums">{compact(l.sold30d)}</p>
                    <TierBadge tier={l.demandTier} source={l.demandSource} className="mt-1" />
                  </TableCell>
                  <TableCell>
                    {l.bestSource ? (
                      <div className="flex items-center gap-3">
                        <Thumb src={l.bestSource.imageUrl} />
                        <div className="min-w-0">
                          <p className="line-clamp-1 max-w-[260px] text-sm whitespace-normal">{l.bestSource.title}</p>
                          <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="tabular-nums">{money(l.bestSource.priceMinor)}</span>
                            <span className="inline-flex items-center gap-0.5 tabular-nums text-foreground">
                              <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden />
                              {l.bestSource.rating.toFixed(2)}
                            </span>
                            <span className="tabular-nums">{compact(l.bestSource.orderCount)} orders</span>
                            <a
                              href={l.bestSource.url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-0.5 text-primary hover:underline"
                            >
                              AE <ExternalLink className="size-3" />
                            </a>
                          </p>
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {l.sourceError
                          ? "Sourcing failed, will retry"
                          : l.sourcedAt
                            ? "No source passed the gate"
                            : (l.sold30d ?? 0) >= (data?.settings.minSold30d ?? 20)
                              ? "Sourcing…"
                              : "Sourced once demand reaches the threshold"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className={cn("text-right tabular-nums", (l.bestSource?.netProfitMinor ?? 0) > 0 && "text-emerald-700")}>
                    {l.bestSource ? money(l.bestSource.netProfitMinor) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{l.bestSource ? `${l.bestSource.marginPct.toFixed(1)}%` : "—"}</TableCell>
                </TableRow>
              ))}
              {data && data.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-sm whitespace-normal text-muted-foreground">
                    {view === "winners"
                      ? data.counts.all > 0
                        ? "No winners yet. Estimated listings become winners once daily snapshots confirm their sales (3+ days), or import Terapeak data for instant verified demand."
                        : "Run a hunt to start tracking eBay listings."
                      : "Nothing here yet."}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

        {data && totalPages > 1 ? (
          <div className="flex items-center justify-end gap-2 text-sm">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setParam({ page: String(page - 1) })}>
              <ChevronLeft className="size-3.5" /> Prev
            </Button>
            <span className="tabular-nums text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setParam({ page: String(page + 1) })}>
              Next <ChevronRight className="size-3.5" />
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
