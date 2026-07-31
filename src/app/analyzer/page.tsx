"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Gauge, PackageSearch, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AnalyzerView } from "@/lib/domain/analyzer";
import { buildAnalyzerProfit } from "@/lib/domain/analyzer";
import { DEFAULT_RULES } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

type MarketPayload = {
  niches: Array<{ niche: string; keywordCount: number; topKeyword: string; momentum: string }>;
  products: Array<{
    id: string;
    title: string;
    ebayItemId: string;
    ebayUrl: string | null;
    imageUrl: string | null;
    searchKeyword: string | null;
    score: number;
    priceMinor: number;
    activeListingCount: number;
    soldLast30Days: number | null;
    soldCountSource: string | null;
    status: string;
    productCandidateId: string | null;
  }>;
  sellers: Array<{
    sellerUsername: string;
    listingCount: number;
    avgPriceMinor: number;
    minPriceMinor: number;
    maxPriceMinor: number;
    sampleTitle: string | null;
    sampleItemId: string | null;
    sampleUrl: string | null;
  }>;
};

function money(minor: number | null | undefined) {
  if (minor == null) return "—";
  return `$${(minor / 100).toFixed(2)}`;
}

function matrixBarClass(tone: string) {
  if (tone === "good") return "bg-emerald-500";
  if (tone === "warn") return "bg-amber-500";
  if (tone === "bad") return "bg-red-500";
  return "bg-muted-foreground/40";
}

export default function AnalyzerPage() {
  const [query, setQuery] = useState("");
  const [analysis, setAnalysis] = useState<AnalyzerView | null>(null);
  const [market, setMarket] = useState<MarketPayload | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [matchBusy, setMatchBusy] = useState(false);
  const [nicheFilter, setNicheFilter] = useState("");
  const [cogsDollars, setCogsDollars] = useState("");
  const [shipDollars, setShipDollars] = useState("");

  const loadMarket = useCallback(async () => {
    const res = await fetch("/api/analyzer/market");
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ? String(json.error) : "Unable to load market tables");
    setMarket(json as MarketPayload);
  }, []);

  useEffect(() => {
    void loadMarket().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [loadMarket]);

  useEffect(() => {
    if (!analysis?.supplier) {
      setCogsDollars("");
      setShipDollars("");
      return;
    }
    setCogsDollars(
      analysis.supplier.priceMinor != null ? (analysis.supplier.priceMinor / 100).toFixed(2) : "",
    );
    setShipDollars(
      analysis.supplier.shippingMinor != null ? (analysis.supplier.shippingMinor / 100).toFixed(2) : "",
    );
  }, [analysis?.supplier, analysis?.listing.itemId]);

  const liveProfit = useMemo(() => {
    if (!analysis) return null;
    const cogs = Math.round(Number(cogsDollars || "0") * 100);
    const ship = Math.round(Number(shipDollars || "0") * 100);
    if (!Number.isFinite(cogs) || cogs <= 0) return analysis.profit;
    return buildAnalyzerProfit({
      ebayPriceMinor: analysis.listing.priceMinor,
      cogsMinor: cogs,
      shippingMinor: Number.isFinite(ship) ? ship : 0,
      rules: DEFAULT_RULES,
    });
  }, [analysis, cogsDollars, shipDollars]);

  async function analyze(nextQuery = query, opts?: { ideaId?: string; candidateId?: string }) {
    const q = nextQuery.trim();
    if (!q && !opts?.ideaId && !opts?.candidateId) {
      setError("Paste an eBay URL, item id, or keyword.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/analyzer/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: q || opts?.ideaId || opts?.candidateId,
          ideaId: opts?.ideaId,
          candidateId: opts?.candidateId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ? String(json.error) : "Analyze failed");
      setAnalysis(json.analysis as AnalyzerView);
      if (q) setQuery(q);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function findAeMatch() {
    if (!analysis && !query.trim()) return;
    setMatchBusy(true);
    setError("");
    try {
      const res = await fetch("/api/analyzer/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query.trim() || analysis?.listing.url || analysis?.listing.itemId,
          ideaId: analysis?.ideaId ?? undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ? String(json.error) : "AE match failed");
      setAnalysis(json.analysis as AnalyzerView);
      await loadMarket().catch(() => undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setMatchBusy(false);
    }
  }

  const niches = market?.niches ?? [];
  const products = (market?.products ?? []).filter((p) =>
    nicheFilter ? (p.searchKeyword ?? "").toLowerCase().includes(nicheFilter.toLowerCase()) : true,
  );
  const sellers = market?.sellers ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Research / Analyzer</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Product Analyzer</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Inspect an eBay listing or pick from trending niches, products, and workspace sellers. Scores use Browse
            proxies until 30-day demand is verified.
          </p>
        </div>
      </div>

      <Card className="shadow-sm ring-1 ring-black/5">
        <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <PackageSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void analyze();
              }}
              placeholder="Paste eBay product URL, item id, or keywords…"
              className="h-11 pl-10"
            />
          </div>
          <Button type="button" className="h-11 px-5" disabled={busy} onClick={() => void analyze()}>
            <Gauge className="size-4" />
            {busy ? "Analyzing…" : "Analyze product"}
          </Button>
        </CardContent>
      </Card>

      {error ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      {analysis ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold tracking-tight">{analysis.listing.title}</h2>
              <div className="mt-1 flex flex-wrap gap-2">
                <Badge variant="secondary">{analysis.scoreLabel}</Badge>
                <Badge variant="outline" className="font-mono text-[10px]">
                  Score {analysis.overallScore}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {analysis.scoreNote}
                </Badge>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled={matchBusy} onClick={() => void findAeMatch()}>
                <Sparkles className="size-3.5" />
                {matchBusy ? "Matching…" : "Find AE match"}
              </Button>
              {analysis.candidateId ? (
                <Link href={`/candidates/${analysis.candidateId}`}>
                  <Button type="button" size="sm">
                    Open in Candidates
                  </Button>
                </Link>
              ) : null}
              {analysis.listing.url ? (
                <a href={analysis.listing.url} target="_blank" rel="noopener noreferrer">
                  <Button type="button" variant="outline" size="sm">
                    View on eBay
                  </Button>
                </a>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="shadow-sm ring-1 ring-black/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Overall score</CardTitle>
                <CardDescription>{analysis.scoreNote}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-3 pb-6">
                <div className="relative flex size-36 items-center justify-center rounded-full border-[10px] border-primary/30">
                  <div
                    className="absolute inset-0 rounded-full border-[10px] border-transparent border-t-primary"
                    style={{ transform: `rotate(${(analysis.overallScore / 100) * 360}deg)` }}
                  />
                  <p className="font-mono text-4xl font-semibold tabular-nums">{analysis.overallScore}</p>
                </div>
                <Badge className="bg-emerald-50 text-emerald-800 hover:bg-emerald-50">{analysis.scoreLabel}</Badge>
              </CardContent>
            </Card>

            <Card className="xl:col-span-2 shadow-sm ring-1 ring-black/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Opportunity matrix</CardTitle>
                <CardDescription>Browse / sourcing proxies — risk is operational, not IP/VeRO</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {analysis.matrix.map((row) => (
                  <div key={row.key} className="grid grid-cols-[120px_1fr_40px] items-center gap-3 text-sm">
                    <span className="text-muted-foreground">{row.label}</span>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className={cn("h-full rounded-full", matrixBarClass(row.tone))} style={{ width: `${row.score}%` }} />
                    </div>
                    <span className="font-mono text-xs tabular-nums">{row.score}%</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Card className="shadow-sm ring-1 ring-black/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Demand analysis</CardTitle>
                <CardDescription>{analysis.demand.note}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="font-mono text-3xl font-semibold tabular-nums">{analysis.demand.soldLast30Days ?? "—"}</p>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {analysis.demand.source}
                </Badge>
                <p className="text-xs text-muted-foreground">
                  Avg sale {money(analysis.demand.avgCompletedSaleMinor)} · Median{" "}
                  {money(analysis.demand.medianCompletedSaleMinor)}
                </p>
                {analysis.listing.estimatedSoldQuantity != null && analysis.demand.source !== "browse_estimate" ? (
                  <p className="text-xs text-muted-foreground">
                    Browse life est (not 30d): {analysis.listing.estimatedSoldQuantity}
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card className="shadow-sm ring-1 ring-black/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Market context</CardTitle>
                <CardDescription>{analysis.market.searchKeyword ?? "Cluster from title keywords"}</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Active listings</p>
                  <p className="font-mono text-xl tabular-nums">{analysis.market.activeListingCount}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Avg price</p>
                  <p className="font-mono text-xl tabular-nums">{money(analysis.market.avgPriceMinor)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Price band</p>
                  <p className="font-mono text-sm tabular-nums">
                    {money(analysis.market.priceMinMinor)} – {money(analysis.market.priceMaxMinor)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Median</p>
                  <p className="font-mono text-sm tabular-nums">{money(analysis.market.priceMedianMinor)}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm ring-1 ring-black/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Listing</CardTitle>
                <CardDescription>
                  {analysis.listing.sellerUsername ?? "Unknown seller"}
                  {analysis.listing.sellerLocation ? ` · ${analysis.listing.sellerLocation}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex gap-3">
                <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {analysis.listing.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={analysis.listing.imageUrl} alt="" className="size-20 object-cover" />
                  ) : (
                    <Image src="/media/product-tech.jpg" alt="" fill className="object-cover opacity-80" />
                  )}
                </div>
                <div className="min-w-0 text-sm">
                  <p className="font-mono text-lg tabular-nums">{money(analysis.listing.priceMinor)}</p>
                  <p className="text-xs text-muted-foreground">Condition: {analysis.listing.condition ?? "—"}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">ID {analysis.listing.itemId}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="shadow-sm ring-1 ring-black/5">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm">Profit calculator</CardTitle>
                  <Badge variant="secondary" className="text-[10px] font-normal">
                    Workspace fee defaults
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">eBay price</span>
                    <Input value={(analysis.listing.priceMinor / 100).toFixed(2)} readOnly className="font-mono" />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">Fees (~{((liveProfit?.feeRate ?? 0.1325) * 100).toFixed(2)}%)</span>
                    <Input value={liveProfit ? (liveProfit.feesMinor / 100).toFixed(2) : "—"} readOnly className="font-mono" />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">COGS ($)</span>
                    <Input
                      value={cogsDollars}
                      onChange={(e) => setCogsDollars(e.target.value)}
                      placeholder={analysis.supplier ? "from AE" : "run AE match"}
                      className="font-mono"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">Shipping ($)</span>
                    <Input
                      value={shipDollars}
                      onChange={(e) => setShipDollars(e.target.value)}
                      placeholder="0.00"
                      className="font-mono"
                    />
                  </label>
                </div>
                <div className="rounded-xl bg-muted/70 p-4">
                  <p className="text-xs text-muted-foreground">Net profit</p>
                  <p
                    className={cn(
                      "font-mono text-2xl font-semibold tabular-nums",
                      (liveProfit?.netProfitMinor ?? 0) >= 0 ? "text-emerald-700" : "text-red-700",
                    )}
                  >
                    {money(liveProfit?.netProfitMinor)}
                  </p>
                  <p className="mt-1 font-mono text-sm text-muted-foreground">
                    Margin {liveProfit ? `${liveProfit.marginPercent.toFixed(1)}%` : "—"} · ROI{" "}
                    {liveProfit ? `${liveProfit.roiPercent.toFixed(0)}%` : "—"}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm ring-1 ring-black/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Supplier performance</CardTitle>
                <CardDescription>
                  {analysis.supplier ? "AliExpress match attached" : "No AE source yet — run Find AE match"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {analysis.supplier ? (
                  <>
                    <p className="line-clamp-2 font-medium">{analysis.supplier.title ?? "AliExpress product"}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-muted/60 px-2.5 py-2">
                        <p className="text-[10px] uppercase text-muted-foreground">Cost</p>
                        <p className="font-mono tabular-nums">{money(analysis.supplier.priceMinor)}</p>
                      </div>
                      <div className="rounded-lg bg-muted/60 px-2.5 py-2">
                        <p className="text-[10px] uppercase text-muted-foreground">Shipping</p>
                        <p className="font-mono tabular-nums">{money(analysis.supplier.shippingMinor)}</p>
                      </div>
                      <div className="rounded-lg bg-muted/60 px-2.5 py-2">
                        <p className="text-[10px] uppercase text-muted-foreground">Rating</p>
                        <p className="font-mono tabular-nums">{analysis.supplier.rating ?? "—"}</p>
                      </div>
                      <div className="rounded-lg bg-muted/60 px-2.5 py-2">
                        <p className="text-[10px] uppercase text-muted-foreground">Orders</p>
                        <p className="font-mono tabular-nums">{analysis.supplier.orderCount ?? "—"}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Match confidence {analysis.supplier.matchConfidence ?? "—"} · reviews{" "}
                      {analysis.supplier.reviewCount ?? "—"}
                    </p>
                    {analysis.supplier.url ? (
                      <a
                        href={analysis.supplier.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        Open AliExpress
                      </a>
                    ) : null}
                  </>
                ) : (
                  <p className="text-muted-foreground">Supplier cards fill after a successful AE match.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="overflow-hidden border-none bg-[#0b1f4d] text-white shadow-sm">
            <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold tracking-wide text-blue-200 uppercase">Strategic guidance</p>
                <p className="mt-2 text-sm leading-relaxed text-blue-50/95">{analysis.guidance}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {analysis.candidateId ? (
                  <Link href={`/candidates/${analysis.candidateId}`}>
                    <Button type="button" variant="secondary" className="bg-white text-[#0b1f4d] hover:bg-blue-50">
                      Track in Candidates
                    </Button>
                  </Link>
                ) : (
                  <Button type="button" variant="secondary" className="bg-white/90 text-[#0b1f4d]" disabled={matchBusy} onClick={() => void findAeMatch()}>
                    Match & track
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="shadow-sm ring-1 ring-black/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Trending niches</CardTitle>
            <CardDescription>From US keyword library</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Niche</TableHead>
                  <TableHead>Keywords</TableHead>
                  <TableHead>Top seed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {niches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">
                      No niche library yet. Refresh trends on Research.
                    </TableCell>
                  </TableRow>
                ) : (
                  niches.slice(0, 12).map((n) => (
                    <TableRow
                      key={n.niche}
                      className="cursor-pointer"
                      onClick={() => {
                        setNicheFilter(n.topKeyword);
                        setQuery(n.topKeyword);
                      }}
                    >
                      <TableCell className="font-medium">{n.niche}</TableCell>
                      <TableCell className="font-mono tabular-nums">{n.keywordCount}</TableCell>
                      <TableCell className="max-w-[140px] truncate text-xs text-muted-foreground">{n.topKeyword}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2 shadow-sm ring-1 ring-black/5">
          <CardHeader className="flex-row items-center justify-between gap-2 pb-2">
            <div>
              <CardTitle className="text-sm">Trending products</CardTitle>
              <CardDescription>Latest workspace TrendIdea scores</CardDescription>
            </div>
            <Input
              value={nicheFilter}
              onChange={(e) => setNicheFilter(e.target.value)}
              placeholder="Filter by keyword…"
              className="h-8 max-w-[200px]"
            />
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Sold</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      No ideas yet. Run Research to populate this table.
                    </TableCell>
                  </TableRow>
                ) : (
                  products.slice(0, 25).map((p) => (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer"
                      onClick={() => void analyze(p.ebayUrl || p.ebayItemId, { ideaId: p.id, candidateId: p.productCandidateId ?? undefined })}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="relative size-8 overflow-hidden rounded bg-muted">
                            {p.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={p.imageUrl} alt="" className="size-8 object-cover" />
                            ) : null}
                          </div>
                          <div className="min-w-0">
                            <p className="max-w-[220px] truncate text-sm font-medium">{p.title}</p>
                            <p className="truncate text-[10px] text-muted-foreground">{p.searchKeyword}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono tabular-nums text-primary">{Math.round(p.score)}</TableCell>
                      <TableCell className="font-mono tabular-nums">{money(p.priceMinor)}</TableCell>
                      <TableCell className="font-mono tabular-nums">{p.activeListingCount}</TableCell>
                      <TableCell className="font-mono text-xs tabular-nums">
                        {p.soldLast30Days ?? "—"}
                        {p.soldCountSource === "browse_estimate" ? (
                          <span className="ml-1 text-[9px] uppercase text-muted-foreground">life</span>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      <Card className="shadow-sm ring-1 ring-black/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Sellers in workspace</CardTitle>
          <CardDescription>
            Aggregated from Browse listings stored on your candidates — not an eBay seller scorecard API.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Seller</TableHead>
                <TableHead>Listings seen</TableHead>
                <TableHead>Avg price</TableHead>
                <TableHead>Band</TableHead>
                <TableHead>Sample</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sellers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No seller rows yet. Analyze products / run scans so EbayListing rows accumulate.
                  </TableCell>
                </TableRow>
              ) : (
                sellers.slice(0, 30).map((s) => (
                  <TableRow
                    key={s.sellerUsername}
                    className="cursor-pointer"
                    onClick={() => {
                      if (s.sampleUrl || s.sampleItemId) {
                        void analyze(s.sampleUrl || s.sampleItemId || "");
                      }
                    }}
                  >
                    <TableCell className="font-medium">{s.sellerUsername}</TableCell>
                    <TableCell className="font-mono tabular-nums">{s.listingCount}</TableCell>
                    <TableCell className="font-mono tabular-nums">{money(s.avgPriceMinor)}</TableCell>
                    <TableCell className="font-mono text-xs tabular-nums">
                      {money(s.minPriceMinor)} – {money(s.maxPriceMinor)}
                    </TableCell>
                    <TableCell className="max-w-[240px] truncate text-xs text-muted-foreground">{s.sampleTitle}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
