"use client";

import { useCallback, useEffect, useState, use } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ExternalLink, RefreshCw, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { compact, fetchJson, money, relativeTime } from "@/components/hunt/format";
import { SoldChart } from "@/components/hunt/sold-chart";
import { Thumb } from "@/components/hunt/thumb";
import { TierBadge, tierExplanation } from "@/components/hunt/tier-badge";
import type { DemandTier, ListingRow, SourceMatch } from "@/components/hunt/types";
import { cn } from "@/lib/utils";

interface Detail {
  listing: Omit<ListingRow, "bestSource" | "sourceCount" | "snapshotCount"> & {
    snapshots: Array<{ id: string; lifetimeSold: number; capturedAt: string }>;
    sources: SourceMatch[];
  };
  demand: { sold30d: number | null; tier: DemandTier; basis: string; windowDays: number };
  winner: boolean;
  settings: { minSold30d: number; minAeRating: number; minMatchConfidence: number; minMarginPct: number; ebayFeeRate: number };
}

const REASON_LABELS: Record<string, string> = {
  pack_quantity_match: "Same pack size",
  source_price_below_ebay: "Cheaper than eBay",
  form_factor_match: "Same form factor",
  search_keyword_match: "Contains the keyword",
  strong_title_containment: "Strong title overlap",
};

export default function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [resourcing, setResourcing] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await fetchJson<Detail>(`/api/listings/${id}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function resource() {
    setResourcing(true);
    setNotice("");
    try {
      const r = await fetchJson<{ outcome: { sourced: number; considered: number } }>(`/api/listings/${id}/resource`, { method: "POST" });
      setNotice(`Checked ${r.outcome.considered} AliExpress products · ${r.outcome.sourced} passed the gate`);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setResourcing(false);
    }
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const { listing, demand, settings } = data;
  const meetsSold = (listing.sold30d ?? 0) >= settings.minSold30d;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> All results
      </Link>

      <header className="flex flex-wrap items-start gap-4">
        <Thumb src={listing.imageUrl} className="size-20" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">{listing.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="tabular-nums">{money(listing.priceMinor || listing.avgSoldPriceMinor)}</span>
            {listing.shippingMinor ? <span>+ {money(listing.shippingMinor)} shipping</span> : <span>free shipping</span>}
            <span>keyword: {listing.keyword}</span>
            {!listing.active ? <span className="text-amber-700">not tracked: {listing.endedReason?.replace(/_/g, " ")}</span> : null}
            <a href={listing.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
              View on eBay <ExternalLink className="size-3" />
            </a>
          </p>
        </div>
        {data.winner ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800">
            <CheckCircle2 className="size-4" aria-hidden /> Winner
          </span>
        ) : null}
      </header>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardDescription>Sold in the last 30 days</CardDescription>
            <CardTitle className="text-5xl font-semibold tabular-nums">{compact(listing.sold30d)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <TierBadge tier={listing.demandTier} source={listing.demandSource} />
            <p className="text-muted-foreground">
              {tierExplanation(demand.tier, listing.demandSource === "terapeak" ? "terapeak" : demand.basis)}
            </p>
            <p className={cn("text-sm", meetsSold ? "text-emerald-700" : "text-muted-foreground")}>
              {meetsSold ? "Meets" : "Below"} your {settings.minSold30d}/30d threshold
              {meetsSold && listing.demandTier === "ESTIMATED" ? ", pending measurement" : ""}
            </p>
            <dl className="grid grid-cols-2 gap-y-1 border-t border-border pt-3 text-xs">
              <dt className="text-muted-foreground">Lifetime sold</dt>
              <dd className="text-right tabular-nums">{compact(listing.lifetimeSold)}</dd>
              <dt className="text-muted-foreground">Evidence window</dt>
              <dd className="text-right tabular-nums">{demand.windowDays} days</dd>
              <dt className="text-muted-foreground">Snapshots</dt>
              <dd className="text-right tabular-nums">{listing.snapshots.length}</dd>
              <dt className="text-muted-foreground">Last snapshot</dt>
              <dd className="text-right">{relativeTime(listing.lastSnapshotAt)}</dd>
              {listing.itemCreationDate ? (
                <>
                  <dt className="text-muted-foreground">Listed</dt>
                  <dd className="text-right">{new Date(listing.itemCreationDate).toLocaleDateString()}</dd>
                </>
              ) : null}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lifetime units sold</CardTitle>
            <CardDescription>One snapshot per day from the eBay Browse API. The slope is the sales rate.</CardDescription>
          </CardHeader>
          <CardContent>
            <SoldChart snapshots={listing.snapshots} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>AliExpress sources</CardTitle>
            <CardDescription>
              Top matches rated ≥ {settings.minAeRating}★ with match confidence ≥ {settings.minMatchConfidence} and margin ≥{" "}
              {settings.minMarginPct}%.
              {listing.sourcedAt ? ` Checked ${relativeTime(listing.sourcedAt)}.` : ""}
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={resource} disabled={resourcing}>
            <RefreshCw className={cn("size-3.5", resourcing && "animate-spin")} /> {resourcing ? "Searching…" : "Re-source"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
          {listing.sourceError ? <p className="text-sm text-destructive">Last attempt failed: {listing.sourceError}</p> : null}
          {listing.sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {listing.sourcedAt
                ? "No AliExpress product passed the gate (rating, reviews, orders, match and margin). Try Re-source later or lower thresholds in Settings."
                : "Not sourced yet. Listings are sourced once they reach the sold threshold."}
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              {listing.sources.map((s) => (
                <SourceCard
                  key={s.id}
                  source={s}
                  ebayPriceMinor={(listing.priceMinor || listing.avgSoldPriceMinor) ?? 0}
                  ebayShippingMinor={listing.shippingMinor ?? 0}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SourceCard({
  source: s,
  ebayPriceMinor,
  ebayShippingMinor,
}: {
  source: SourceMatch;
  ebayPriceMinor: number;
  ebayShippingMinor: number;
}) {
  const reasons = (JSON.parse(s.matchReasonsJson || "[]") as string[]).map((r) => REASON_LABELS[r]).filter(Boolean);
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-3">
      <div className="flex gap-3">
        <Thumb src={s.imageUrl} className="size-16" />
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">
            #{s.rank} · match {s.matchConfidence}%
          </p>
          <p className="line-clamp-3 text-sm">{s.title}</p>
        </div>
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span
          className="inline-flex items-center gap-0.5 font-medium tabular-nums"
          title="AE rating derived from % positive feedback (e.g. 94% = 4.7★)"
        >
          <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden /> {s.rating.toFixed(2)}
        </span>
        <span className="tabular-nums text-muted-foreground">{compact(s.reviewCount)} reviews</span>
        <span className="tabular-nums text-muted-foreground">{compact(s.orderCount)} orders</span>
      </p>
      {reasons.length ? <p className="text-[11px] text-muted-foreground">{reasons.join(" · ")}</p> : null}
      <dl className="grid grid-cols-2 gap-y-0.5 border-t border-border pt-2 text-xs tabular-nums">
        <dt className="text-muted-foreground">eBay revenue</dt>
        <dd className="text-right">{money(ebayPriceMinor + ebayShippingMinor)}</dd>
        <dt className="text-muted-foreground">AE item</dt>
        <dd className="text-right">−{money(s.priceMinor)}</dd>
        <dt
          className="text-muted-foreground"
          title={s.shippingEstimated ? "The AliExpress API does not return shipping. This is your estimate from Settings." : undefined}
        >
          AE shipping{s.shippingEstimated ? " (est.)" : ""}
        </dt>
        <dd className="text-right">−{money(s.shippingMinor)}</dd>
        <dt className="text-muted-foreground">eBay fees</dt>
        <dd className="text-right">−{money(s.feesMinor)}</dd>
        {s.totalCostMinor - s.priceMinor - s.shippingMinor - s.feesMinor > 0 ? (
          <>
            <dt className="text-muted-foreground">Other costs</dt>
            <dd className="text-right">−{money(s.totalCostMinor - s.priceMinor - s.shippingMinor - s.feesMinor)}</dd>
          </>
        ) : null}
        <dt className="font-medium">Net profit</dt>
        <dd className={cn("text-right font-semibold", s.netProfitMinor > 0 ? "text-emerald-700" : "text-destructive")}>
          {money(s.netProfitMinor)} · {s.marginPct.toFixed(1)}%
        </dd>
      </dl>
      <a
        href={s.url}
        target="_blank"
        rel="noreferrer"
        className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
      >
        Open on AliExpress <ExternalLink className="size-3" />
      </a>
    </div>
  );
}
