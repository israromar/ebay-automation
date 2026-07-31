"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildEbayPurchaseHistoryUrl, buildEbaySoldSearchUrl, dollarsToMinor, minorToDollarsInput } from "@/lib/domain/ebay-sold-history";
import { cn } from "@/lib/utils";

function UrlActions({ label, url }: { label: string; url?: string | null }) {
  const [copied, setCopied] = useState(false);
  const value = url?.trim() || "";

  async function copy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  }

  if (!value) {
    return (
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-muted-foreground">—</p>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <a href={value} target="_blank" rel="noopener noreferrer" title={value} className="block truncate text-primary hover:underline">
        {value}
      </a>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copy} className="rounded-md border border-input px-2 py-1 text-xs hover:bg-muted">
          {copied ? "Copied" : "Copy URL"}
        </button>
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-input px-2 py-1 text-xs hover:bg-muted"
        >
          Open
        </a>
      </div>
    </div>
  );
}

function money(minor: unknown) {
  if (typeof minor !== "number") return "—";
  return `$${(minor / 100).toFixed(2)}`;
}

function readAliExpressAlternative(source: Record<string, unknown>) {
  try {
    const raw = JSON.parse(String(source.rawJson ?? "{}")) as {
      product?: { title?: string; priceMinor?: number; rating?: number; orderCount?: number };
      evaluation?: {
        match?: { confidence?: number; reasons?: string[] };
        qualification?: { reasons?: string[]; missingFields?: string[] };
        retrievalMode?: "image" | "keyword";
      };
    };
    return {
      title: raw.product?.title ?? "AliExpress alternative",
      priceMinor: raw.product?.priceMinor,
      rating: raw.product?.rating,
      orderCount: raw.product?.orderCount,
      confidence: raw.evaluation?.match?.confidence,
      reasons: [...(raw.evaluation?.match?.reasons ?? []), ...(raw.evaluation?.qualification?.reasons ?? [])],
      missingFields: raw.evaluation?.qualification?.missingFields ?? [],
      retrievalMode: raw.evaluation?.retrievalMode ?? "keyword",
      url: String(source.url ?? ""),
    };
  } catch {
    return null;
  }
}

export default function CandidateDetailPage() {
  const params = useParams<{ id: string }>();
  const [candidate, setCandidate] = useState<Record<string, unknown> | null>(null);
  const [sold, setSold] = useState("5");
  const [avgSale, setAvgSale] = useState("");
  const [medianSale, setMedianSale] = useState("");
  const [evidence, setEvidence] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [fetchBusy, setFetchBusy] = useState(false);

  async function load() {
    const res = await fetch(`/api/candidates/${params.id}`);
    const json = await res.json();
    const next = json.candidate as Record<string, unknown>;
    setCandidate(next);
    if (typeof next.soldLast30Days === "number") setSold(String(next.soldLast30Days));
    setAvgSale(minorToDollarsInput(typeof next.avgCompletedSaleMinor === "number" ? next.avgCompletedSaleMinor : null));
    setMedianSale(minorToDollarsInput(typeof next.medianCompletedSaleMinor === "number" ? next.medianCompletedSaleMinor : null));
    if (!evidence && typeof next.ebayUrl === "string") {
      const history = buildEbayPurchaseHistoryUrl(String(next.ebayItemId ?? next.ebayUrl));
      if (history) setEvidence(history);
    }
  }

  useEffect(() => {
    if (params.id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const soldHistoryLinks = useMemo(() => {
    if (!candidate) return { purchaseHistory: null as string | null, soldSearch: "" };
    const purchaseHistory = buildEbayPurchaseHistoryUrl(String(candidate.ebayItemId ?? candidate.ebayUrl ?? ""));
    const keyword = String(candidate.searchKeyword || candidate.productName || "product");
    return {
      purchaseHistory,
      soldSearch: buildEbaySoldSearchUrl(keyword),
    };
  }, [candidate]);

  async function fetchSoldHistory() {
    setMsg("");
    setFetchBusy(true);
    try {
      const res = await fetch(`/api/candidates/${params.id}/sold-history/fetch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: false }),
      });
      const json = await res.json();
      const form = json.form as
        | {
            soldLast30Days?: number;
            avgCompletedSaleDollars?: string;
            medianCompletedSaleDollars?: string;
            evidenceUrl?: string | null;
          }
        | undefined;
      if (form) {
        if (typeof form.soldLast30Days === "number") setSold(String(form.soldLast30Days));
        if (form.avgCompletedSaleDollars) setAvgSale(form.avgCompletedSaleDollars);
        if (form.medianCompletedSaleDollars) setMedianSale(form.medianCompletedSaleDollars);
        if (form.evidenceUrl) setEvidence(form.evidenceUrl);
      }
      if (!res.ok || !json.available) {
        const reason = String(json.reason ?? json.error ?? "fetch_failed");
        if (reason === "login_required") {
          setMsg(
            "eBay requires sign-in for purchase history. Set EBAY_PURCHASE_HISTORY_COOKIE in .env (Cookie from a logged-in browser), or open the history link and enter counts manually.",
          );
        } else {
          setMsg(`Could not fetch sold history (${reason}). Open the history page manually or try again.`);
        }
        return;
      }
      const inWindow = Number(json.history?.soldLast30Days ?? form?.soldLast30Days ?? 0);
      const rows = Number(json.purchaseCount ?? 0);
      setMsg(
        `Fetched ${rows} purchase row(s) via ${String(json.source)}; ${inWindow} unit(s) in last 30 days. Review and click Apply demand.`,
      );
    } finally {
      setFetchBusy(false);
    }
  }

  async function submitDemand() {
    setMsg("");
    setBusy(true);
    try {
      const avgCompletedSaleMinor = dollarsToMinor(avgSale) ?? undefined;
      const medianCompletedSaleMinor = dollarsToMinor(medianSale) ?? undefined;
      const res = await fetch(`/api/candidates/${params.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          soldLast30Days: Number(sold),
          avgCompletedSaleMinor,
          medianCompletedSaleMinor,
          evidenceUrl: evidence || soldHistoryLinks.purchaseHistory || undefined,
          verifiedBy: "dashboard-operator",
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg(JSON.stringify(json));
        return;
      }
      setMsg(`Updated status: ${json.candidate.status}`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!candidate) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const profit = (candidate.profitCalculations as Array<Record<string, unknown>>)?.[0];
  const needsDemand = candidate.demandVerified !== true || String(candidate.status) === "NEEDS_MANUAL_VALIDATION";
  const hasValidatedAe = Boolean(
    candidate.aliexpressProductId &&
    candidate.aliexpressUrl &&
    typeof candidate.aliexpressPriceMinor === "number" &&
    typeof candidate.matchConfidence === "number",
  );
  const hasKnownShipping = typeof candidate.aliexpressShippingMinor === "number";
  const aeAlternatives = ((candidate.sourceProducts as Array<Record<string, unknown>>) ?? [])
    .filter((source) => source.marketplace === "aliexpress_alternative")
    .map(readAliExpressAlternative)
    .filter((source): source is NonNullable<typeof source> => source != null);

  const matchPct =
    typeof candidate.matchConfidence === "number"
      ? candidate.matchConfidence <= 1
        ? Math.round(candidate.matchConfidence * 100)
        : Math.round(candidate.matchConfidence)
      : null;
  const netProfit = typeof profit?.netProfitMinor === "number" ? profit.netProfitMinor : candidate.estimatedProfitMinor;
  const netMargin = typeof profit?.netMarginPercent === "number" ? profit.netMarginPercent : candidate.netMarginPercent;
  const imageUrl = typeof candidate.imageUrl === "string" ? candidate.imageUrl : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">
            <Link href="/candidates" className="hover:text-primary">
              Candidates
            </Link>{" "}
            / Match review
          </p>
          <h1 className="mt-1 break-words text-2xl font-semibold tracking-tight">{String(candidate.productName)}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="outline" className="border-border font-mono text-[10px]">
              {String(candidate.status)}
            </Badge>
            {matchPct != null ? (
              <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-50">
                Match confidence: {matchPct}%
              </Badge>
            ) : null}
            {typeof netMargin === "number" ? (
              <Badge className="border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-50">
                Est. margin: {netMargin.toFixed(0)}%
              </Badge>
            ) : null}
          </div>
        </div>
        <Link href="/candidates">
          <Button type="button" variant="outline" size="sm">
            Back to list
          </Button>
        </Link>
      </div>

      {/* Stitch Match Review — eBay | strength | AE */}
      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden shadow-sm ring-1 ring-black/5">
          <CardHeader className="border-b border-border/60 pb-3">
            <CardTitle className="text-sm">eBay listing</CardTitle>
            <CardDescription>Demand-side listing</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-4 text-sm">
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="" className="size-full object-cover" />
              ) : (
                <Image src="/media/product-tech.jpg" alt="" fill className="object-cover opacity-90" />
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Price", value: money(candidate.ebayCurrentPriceMinor) },
                { label: "Sold 30d", value: String(candidate.soldLast30Days ?? "—") },
                { label: "Active", value: String(candidate.activeListingCount ?? "—") },
                { label: "Avg sale", value: money(candidate.avgCompletedSaleMinor) },
              ].map((stat) => (
                <div key={stat.label} className="rounded-lg bg-muted/60 px-2.5 py-2">
                  <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{stat.label}</p>
                  <p className="font-mono text-sm tabular-nums">{stat.value}</p>
                </div>
              ))}
            </div>
            <UrlActions label="Listing URL" url={String(candidate.ebayUrl ?? "")} />
            <p className="text-xs text-muted-foreground">Demand verified: {String(candidate.demandVerified)}</p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden shadow-sm ring-1 ring-black/5">
          <CardHeader className="border-b border-border/60 pb-3">
            <CardTitle className="text-sm">Match strength</CardTitle>
            <CardDescription>Visual + economics gate</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4 pt-6 text-sm">
            <div
              className={cn(
                "flex size-36 flex-col items-center justify-center rounded-full border-8",
                matchPct != null && matchPct >= 70
                  ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                  : matchPct != null && matchPct >= 50
                    ? "border-amber-400 bg-amber-50 text-amber-900"
                    : "border-border bg-muted text-foreground",
              )}
            >
              <p className="text-xs font-medium tracking-wide uppercase opacity-70">
                {matchPct != null && matchPct >= 70 ? "Strong" : matchPct != null ? "Review" : "Pending"}
              </p>
              <p className="font-mono text-3xl font-semibold tabular-nums">{matchPct != null ? `${matchPct}%` : "—"}</p>
            </div>
            <ul className="w-full space-y-2 text-xs">
              <li className="flex justify-between gap-2 rounded-lg border border-border px-3 py-2">
                <span className="text-muted-foreground">Image / visual</span>
                <span className="font-medium">{matchPct != null ? (matchPct >= 70 ? "Strong" : "Check") : "—"}</span>
              </li>
              <li className="flex justify-between gap-2 rounded-lg border border-border px-3 py-2">
                <span className="text-muted-foreground">AE source attached</span>
                <span className="font-medium">{hasValidatedAe ? "Yes" : "No"}</span>
              </li>
              <li className="flex justify-between gap-2 rounded-lg border border-border px-3 py-2">
                <span className="text-muted-foreground">Shipping known</span>
                <span className="font-medium">{hasKnownShipping ? "Yes" : "Unknown"}</span>
              </li>
            </ul>
            {aeAlternatives.length > 0 ? (
              <p className="w-full text-center text-xs text-muted-foreground">{aeAlternatives.length} alternative(s) below</p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="overflow-hidden shadow-sm ring-1 ring-black/5">
          <CardHeader className="border-b border-border/60 pb-3">
            <CardTitle className="text-sm">AliExpress supplier</CardTitle>
            <CardDescription>Sourcing side</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-4 text-sm">
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted">
              <Image src="/media/product-packaging.jpg" alt="" fill className="object-cover opacity-90" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Cost", value: money(candidate.aliexpressPriceMinor) },
                { label: "Shipping", value: hasKnownShipping ? money(candidate.aliexpressShippingMinor) : "Unknown" },
                { label: "Rating", value: String(candidate.rating ?? "—") },
                { label: "Orders", value: String(candidate.orderCount ?? "—") },
              ].map((stat) => (
                <div key={stat.label} className="rounded-lg bg-muted/60 px-2.5 py-2">
                  <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{stat.label}</p>
                  <p className="font-mono text-sm tabular-nums">{stat.value}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Reviews: {String(candidate.reviewCount ?? "—")}</p>
            <UrlActions label="Supplier URL" url={String(candidate.aliexpressUrl ?? "")} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-sm ring-1 ring-black/5">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm">Profit calculator</CardTitle>
              <Badge variant="secondary" className="font-normal text-[10px]">
                Auto-calculated
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="grid flex-1 gap-2 text-sm">
              <div className="flex justify-between rounded-lg border border-border px-3 py-2">
                <span className="text-muted-foreground">eBay price</span>
                <span className="font-mono tabular-nums">{money(candidate.ebayCurrentPriceMinor)}</span>
              </div>
              <div className="flex justify-between rounded-lg border border-border px-3 py-2">
                <span className="text-muted-foreground">Supplier cost</span>
                <span className="font-mono tabular-nums">{money(candidate.aliexpressPriceMinor)}</span>
              </div>
              <div className="flex justify-between rounded-lg border border-border px-3 py-2">
                <span className="text-muted-foreground">Est. shipping</span>
                <span className="font-mono tabular-nums">
                  {hasKnownShipping ? money(candidate.aliexpressShippingMinor) : "—"}
                </span>
              </div>
            </div>
            <ArrowRight className="mx-auto hidden size-6 text-primary sm:block" />
            <div className="min-w-[160px] rounded-xl bg-muted/80 p-4 text-center">
              <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Net profit</p>
              <p
                className={cn(
                  "font-mono text-2xl font-semibold tabular-nums",
                  typeof netProfit === "number" && netProfit >= 0 ? "text-emerald-700" : "text-red-700",
                )}
              >
                {money(typeof netProfit === "number" ? netProfit : null)}
              </p>
              <p className="mt-1 font-mono text-sm tabular-nums text-muted-foreground">
                Margin {typeof netMargin === "number" ? `${netMargin.toFixed(1)}%` : "—"}
              </p>
            </div>
          </CardContent>
          {profit ? (
            <details className="border-t border-border px-4 py-3 text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Raw calculation JSON</summary>
              <pre className="mt-2 overflow-x-auto rounded bg-muted p-3">{JSON.stringify(profit, null, 2)}</pre>
            </details>
          ) : null}
        </Card>

        <Card className="shadow-sm ring-1 ring-black/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Qualification insight</CardTitle>
            <CardDescription>Why this row is in the pipeline</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-lg border border-border px-3 py-2">
              <p className="text-xs font-medium text-primary">Demand signal</p>
              <p className="mt-1 text-muted-foreground">
                Sold 30d {String(candidate.soldLast30Days ?? "unset")} · active listings{" "}
                {String(candidate.activeListingCount ?? "—")} · verified {String(candidate.demandVerified)}
              </p>
            </div>
            <div className="rounded-lg border border-border px-3 py-2">
              <p className="text-xs font-medium text-emerald-700">Match signal</p>
              <p className="mt-1 text-muted-foreground">
                Confidence {matchPct != null ? `${matchPct}%` : "—"} · AE{" "}
                {hasValidatedAe ? "attached" : "missing"} · shipping {hasKnownShipping ? "known" : "unknown"}
              </p>
            </div>
            <div className="rounded-lg border-l-4 border-l-primary bg-muted/60 px-3 py-2 text-xs text-foreground/90">
              {needsDemand
                ? "Record verified 30-day sold (Insights or purchase history) before approval. Browse life-est is not enough."
                : "Demand looks verified — confirm AE kit/pack and economics before export."}
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Rejection / reason codes</p>
              <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-[11px]">{String(candidate.rejectionReasonsJson ?? "[]")}</pre>
            </div>
          </CardContent>
        </Card>
      </section>

      {aeAlternatives.length > 0 ? (
        <Card className="shadow-sm ring-1 ring-black/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {candidate.aliexpressUrl ? "Other evaluated AliExpress options" : "Relevant alternatives found"}
            </CardTitle>
            <CardDescription>
              {candidate.aliexpressUrl
                ? "Evaluated during matching — use to verify the attached source is the closest kit."
                : "Not attached because supplier data or economics failed configured rules."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {aeAlternatives.map((alternative) => (
              <a
                key={alternative.url}
                href={alternative.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg border border-border p-3 hover:bg-muted/60"
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="line-clamp-2 text-sm font-medium text-primary">
                    {alternative.retrievalMode === "image" ? "Image search · " : ""}
                    {alternative.title}
                  </span>
                  <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                </span>
                <span className="mt-1 block font-mono text-xs text-muted-foreground">
                  {money(alternative.priceMinor)} · match {alternative.confidence ?? "—"} · rating {alternative.rating ?? "—"} ·
                  orders {alternative.orderCount ?? "—"}
                </span>
                {alternative.reasons.length > 0 || alternative.missingFields.length > 0 ? (
                  <span className="mt-1 block text-xs text-amber-700">
                    {[...alternative.reasons, ...alternative.missingFields.map((field) => `Missing ${field}`)].join(" · ")}
                  </span>
                ) : null}
              </a>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <section className={`rounded-lg border p-4 text-sm ${needsDemand ? "border-amber-200 bg-amber-50" : "border-border bg-card"}`}>
        <h3 className="font-medium">Sold history / demand validation</h3>
        {hasValidatedAe ? (
          hasKnownShipping ? (
            <p className="mt-1 text-foreground/80">
              Browse API cannot supply sold counts. Use Fetch sold history to parse the purchase-history page, or open it manually
              while logged in. Approval requires verified demand.
            </p>
          ) : (
            <p className="mt-1 font-medium text-amber-800">
              AE shipping is unknown, so profit and approval stay blocked. You can still record sold counts for later review.
            </p>
          )
        ) : (
          <p className="mt-1 font-medium text-amber-800">
            Demand can be recorded only after a qualified AliExpress source is attached. This candidate cannot be approved yet.
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || fetchBusy || !soldHistoryLinks.purchaseHistory}
            onClick={fetchSoldHistory}
            className="rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {fetchBusy ? "Fetching…" : "Fetch sold history (last 30d)"}
          </button>
          {soldHistoryLinks.purchaseHistory ? (
            <a
              href={soldHistoryLinks.purchaseHistory}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-input bg-card px-3 py-2 text-xs font-medium hover:bg-muted"
            >
              Open listing sold history
            </a>
          ) : null}
          <a
            href={soldHistoryLinks.soldSearch}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-input bg-card px-3 py-2 text-xs font-medium hover:bg-muted"
          >
            Open sold+completed search
          </a>
          {soldHistoryLinks.purchaseHistory ? (
            <button
              type="button"
              className="rounded-md border border-input bg-card px-3 py-2 text-xs hover:bg-muted"
              onClick={() => setEvidence(soldHistoryLinks.purchaseHistory ?? "")}
            >
              Use history URL as evidence
            </button>
          ) : null}
        </div>

        <ol className="mt-3 list-decimal space-y-1 pl-5 text-foreground/80">
          <li>Click “Fetch sold history” to parse the purchase-history page (falls back to manual if eBay requires login).</li>
          <li>Review autofilled sold count + prices, or open the history link and enter them yourself.</li>
          <li>Click Apply demand when the numbers look right.</li>
        </ol>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sold last 30 days</span>
            <input
              className="w-full rounded-md border border-input px-3 py-2"
              value={sold}
              onChange={(e) => setSold(e.target.value)}
              inputMode="numeric"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Avg sold price ($)</span>
            <input
              className="w-full rounded-md border border-input px-3 py-2"
              value={avgSale}
              onChange={(e) => setAvgSale(e.target.value)}
              placeholder="e.g. 24.99"
              inputMode="decimal"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Median sold price ($)</span>
            <input
              className="w-full rounded-md border border-input px-3 py-2"
              value={medianSale}
              onChange={(e) => setMedianSale(e.target.value)}
              placeholder="optional"
              inputMode="decimal"
            />
          </label>
          <label className="space-y-1 sm:col-span-2 lg:col-span-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Evidence URL</span>
            <input
              className="w-full rounded-md border border-input px-3 py-2"
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              placeholder="Sold history URL"
            />
          </label>
        </div>

        <div className="mt-3">
          <button
            type="button"
            disabled={busy || fetchBusy || !hasValidatedAe}
            onClick={submitDemand}
            className="rounded-md bg-primary px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Applying…" : "Apply demand"}
          </button>
        </div>
        {msg ? <p className="mt-2">{msg}</p> : null}
      </section>

      <section className="rounded-lg border border-border bg-card p-4 text-sm">
        <h3 className="font-medium">Source records / history</h3>
        <pre className="mt-2 max-h-80 overflow-auto rounded bg-muted p-3 text-xs">
          {JSON.stringify(
            {
              sourceProducts: candidate.sourceProducts,
              saleObservations: candidate.saleObservations,
              manualReviews: candidate.manualReviews,
              exportRecords: candidate.exportRecords,
            },
            null,
            2,
          )}
        </pre>
      </section>
    </div>
  );
}
