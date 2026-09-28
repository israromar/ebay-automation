"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Download, ExternalLink, Image as ImageIcon, RefreshCw, ScanSearch, Star, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchJson, moneyIn, relativeTime } from "@/components/hunt/format";
import { Thumb } from "@/components/hunt/thumb";
import { cn } from "@/lib/utils";

type Tier = "HIGH" | "MEDIUM" | "LOW";

interface Candidate {
  productId: string;
  title: string;
  url: string;
  imageUrl: string | null;
  priceMinor: number;
  currency: string;
  rating: number | null;
  reviewCount: number | null;
  orderCount: number | null;
  confidence: number;
  tier: Tier;
  textScore: number;
  visual: { score: number; hash: number; color: number; edge: number } | null;
  reasons: string[];
  hardReject: boolean;
  estimatedProfitMinor: number;
  marginPct: number;
  shippingMinor: number;
  shippingEstimated: boolean;
  meetsGate: boolean;
  /** Missing on lookups saved before the profit floor existed. */
  meetsProfit?: boolean;
}

interface Lookup {
  id: string;
  ebayUrl: string;
  title: string | null;
  imageUrl: string | null;
  priceMinor: number | null;
  currency: string;
  status: "ok" | "no_candidates" | "failed";
  bestConfidence: number | null;
  bestTier: Tier | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  result: {
    ebay: {
      itemId: string;
      title: string;
      url: string;
      images: string[];
      priceMinor: number;
      shippingMinor: number | null;
      currency: string;
      marketplaceId: string;
      brand: string | null;
      aspects: Record<string, string>;
    };
    candidates: Candidate[];
    stats: { retrieved: number; shortlisted: number; fingerprinted: number; imageFailures: number; durationMs: number };
    profit?: {
      minProfitMinor: number;
      minProfitUsdMinor: number;
      maxSupplierPriceMinor: number;
      shippingEstimateMinor: number;
      usdRate: number;
      rateSource: "live" | "fallback";
    };
  } | null;
}

type LookupSummary = Omit<Lookup, "result">;

const TIER_STYLE: Record<Tier, string> = {
  HIGH: "border-emerald-200 bg-emerald-50 text-emerald-800",
  MEDIUM: "border-sky-200 bg-sky-50 text-sky-800",
  LOW: "border-amber-200 bg-amber-50 text-amber-900",
};
const TIER_BAR: Record<Tier, string> = { HIGH: "bg-emerald-500", MEDIUM: "bg-sky-500", LOW: "bg-amber-500" };

const REASONS: Record<string, string> = {
  same_photo: "Same photo",
  similar_photo: "Similar photo",
  other_colour: "Different colour",
  photo_differs: "Photo looks different",
  image_unavailable: "Image n/a",
  pack_quantity_match: "Same pack size",
  strong_title_containment: "Strong title match",
  strong_title_overlap: "Strong title match",
  search_keyword_match: "Has the keywords",
  form_factor_match: "Same form factor",
  source_price_below_ebay: "Cheaper than eBay",
  accessory_vs_main: "Accessory, not the product",
  pack_quantity_mismatch: "Different pack size",
  pack_quantity_missing: "Pack size missing",
  product_context_mismatch: "Different product type",
  condition_mismatch: "Different condition",
  brand_match: "Same brand",
  brand_mismatch: "Different brand",
  model_mismatch: "Different model",
  feature_quantity_mismatch: "Different size/count",
  profit_below_min: "Profit below minimum",
};

function TierBadge({ tier, className }: { tier: Tier; className?: string }) {
  return (
    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold", TIER_STYLE[tier], className)}>
      {tier === "HIGH" ? "High" : tier === "MEDIUM" ? "Medium" : "Low"} confidence
    </span>
  );
}

function ScoreBar({ value, tier }: { value: number; tier: Tier }) {
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      role="meter"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={cn("h-full rounded-full", TIER_BAR[tier])} style={{ width: `${Math.max(3, value)}%` }} />
    </div>
  );
}

function Reasons({ reasons }: { reasons: string[] }) {
  const labels = [...new Set(reasons.map((r) => REASONS[r]).filter(Boolean))];
  if (!labels.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {labels.map((l) => (
        <span
          key={l}
          className={cn(
            "rounded-md border px-1.5 py-0.5 text-[11px]",
            /Accessory|Different|differs|below minimum/.test(l)
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-border bg-muted/60 text-muted-foreground",
          )}
        >
          {l}
        </span>
      ))}
    </div>
  );
}

function SubScores({ c }: { c: Candidate }) {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
      <span className="inline-flex items-center gap-1" title="Title, pack size, brand and product-type match">
        <Type className="size-3" aria-hidden /> Title {c.textScore}%
      </span>
      <span
        className="inline-flex items-center gap-1"
        title={
          c.visual
            ? `Photo fingerprint: outline ${c.visual.hash}%, colour ${c.visual.color}%, shape ${c.visual.edge}%`
            : "AliExpress image couldn't be loaded"
        }
      >
        <ImageIcon className="size-3" aria-hidden /> Image {c.visual ? `${c.visual.score}%` : "n/a"}
      </span>
    </p>
  );
}

function SupplierLine({ c }: { c: Candidate }) {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
      <span className="font-medium">{moneyIn(c.priceMinor, c.currency)}</span>
      {c.rating != null ? (
        <span className={cn("inline-flex items-center gap-0.5", c.rating >= 4.7 ? "text-foreground" : "text-muted-foreground")}>
          <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden /> {c.rating.toFixed(2)}
        </span>
      ) : (
        <span className="text-muted-foreground">no rating</span>
      )}
      {c.orderCount != null ? <span className="text-muted-foreground">{c.orderCount.toLocaleString()} orders</span> : null}
      <span className={cn(c.estimatedProfitMinor > 0 ? "text-emerald-700" : "text-destructive")}>
        profit {moneyIn(c.estimatedProfitMinor, c.currency)} ({c.marginPct.toFixed(1)}%)
      </span>
    </p>
  );
}

function Only47({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[var(--primary)]" />
      Only ≥ 4.7★
    </label>
  );
}

function CandidateRow({ c, rank, muted }: { c: Candidate; rank: number; muted?: boolean }) {
  return (
    <div className={cn("flex flex-wrap gap-3 px-4 py-3 sm:flex-nowrap", muted && "bg-muted/30")}>
      <span className="w-5 shrink-0 pt-1 text-xs text-muted-foreground tabular-nums">{rank}</span>
      <Thumb src={c.imageUrl} className="size-16" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <a href={c.url} target="_blank" rel="noreferrer" className="line-clamp-2 text-sm font-medium hover:text-primary hover:underline">
          {c.title}
        </a>
        <SubScores c={c} />
        <Reasons reasons={c.meetsProfit === false ? [...c.reasons, "profit_below_min"] : c.reasons} />
        <SupplierLine c={c} />
      </div>
      <div className="w-32 shrink-0 space-y-1.5 text-right">
        <p className="text-xl font-semibold tabular-nums">{c.confidence}%</p>
        <ScoreBar value={c.confidence} tier={c.tier} />
        <TierBadge tier={c.tier} className="mt-1" />
      </div>
    </div>
  );
}

export default function SourceFinderPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [url, setUrl] = useState(params.get("url") ?? "");
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [history, setHistory] = useState<LookupSummary[]>([]);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [only47, setOnly47] = useState(false);
  const autoRan = useRef(false);

  const loadHistory = useCallback(async () => {
    try {
      setHistory((await fetchJson<{ lookups: LookupSummary[] }>("/api/source-lookups", { silent: true })).lookups);
    } catch {
      /* history is optional */
    }
  }, []);

  const open = useCallback(
    async (id: string) => {
      setError("");
      try {
        const { lookup: l } = await fetchJson<{ lookup: Lookup }>(`/api/source-lookups/${id}`);
        setLookup(l);
        setUrl(l.ebayUrl);
        router.replace(`/source-finder?id=${id}`, { scroll: false });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [router],
  );

  const run = useCallback(
    async (target: string, rerunId?: string) => {
      if (!target.trim() && !rerunId) return;
      setRunning(true);
      setError("");
      setElapsed(0);
      const t0 = Date.now();
      const timer = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 500);
      try {
        const res = await fetch(rerunId ? `/api/source-lookups/${rerunId}/rerun` : "/api/source-lookups", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-pulse-silent": "1" },
          body: rerunId ? undefined : JSON.stringify({ url: target.trim() }),
        });
        const json = (await res.json().catch(() => ({}))) as { lookup?: Lookup; error?: string };
        if (json.lookup) {
          setLookup(json.lookup);
          router.replace(`/source-finder?id=${json.lookup.id}`, { scroll: false });
          if (json.lookup.status === "failed") setError(json.lookup.error ?? "Lookup failed");
        } else {
          setError(json.error ?? `Lookup failed (${res.status})`);
        }
        await loadHistory();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        clearInterval(timer);
        setRunning(false);
      }
    },
    [loadHistory, router],
  );

  useEffect(() => {
    void loadHistory();
    const id = params.get("id");
    const preset = params.get("url");
    if (id) void open(id);
    else if (preset && !autoRan.current) {
      autoRan.current = true;
      void run(preset);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on load
  }, []);

  const result = lookup?.result ?? null;
  const candidates = useMemo(() => (result?.candidates ?? []).filter((c) => !only47 || (c.rating ?? 0) >= 4.7), [result, only47]);
  const floor = result?.profit ?? null;
  const floorLabel = floor ? `$${(floor.minProfitUsdMinor / 100).toFixed(2)}` : "";
  const profitableList = floor ? candidates.filter((c) => c.meetsProfit !== false) : candidates;
  const belowList = floor ? candidates.filter((c) => c.meetsProfit === false) : [];
  const best = profitableList[0] ?? belowList[0];
  const noneProfitable = floor != null && (result?.candidates.length ?? 0) > 0 && profitableList.length === 0;
  const noHigh = result != null && !(result.candidates ?? []).some((c) => c.tier === "HIGH");

  return (
    <div className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 space-y-5">
        <header>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ScanSearch className="size-5 text-primary" aria-hidden /> Source finder
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Paste an eBay listing (ebay.co.uk, ebay.com, ebay.de …). We search AliExpress and score every candidate by title match and by
            comparing product photos. The closest products are always shown, even when none is a confident match.
          </p>
        </header>

        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void run(url);
          }}
        >
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.ebay.co.uk/itm/…"
            className="h-10 flex-1"
            aria-label="eBay listing link"
            disabled={running}
          />
          <Button type="submit" className="h-10" disabled={running || !url.trim()}>
            <ScanSearch className="size-4" /> {running ? `Searching… ${elapsed}s` : "Find AliExpress source"}
          </Button>
        </form>
        {running ? (
          <p className="text-xs text-muted-foreground">
            Reading the eBay listing, searching AliExpress, then comparing photos. This usually takes 5–25 seconds.
          </p>
        ) : null}
        {error ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}

        {result ? (
          <>
            <Card>
              <CardContent className="flex flex-wrap gap-4 pt-6">
                <Thumb src={result.ebay.images[0] ?? null} className="size-24" />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    eBay {result.ebay.marketplaceId.replace("EBAY_", "")} · item {result.ebay.itemId}
                  </p>
                  <h2 className="text-lg font-semibold leading-snug">{result.ebay.title}</h2>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="font-semibold tabular-nums">{moneyIn(result.ebay.priceMinor, result.ebay.currency)}</span>
                    <span className="text-muted-foreground">
                      {result.ebay.shippingMinor ? `+ ${moneyIn(result.ebay.shippingMinor, result.ebay.currency)} postage` : "free postage"}
                    </span>
                    {result.ebay.brand ? <span className="text-muted-foreground">Brand: {result.ebay.brand}</span> : null}
                    <a
                      href={result.ebay.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      View on eBay <ExternalLink className="size-3" />
                    </a>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {result.stats.retrieved} AliExpress products checked · {result.stats.fingerprinted} photos compared
                    {result.stats.imageFailures ? ` · ${result.stats.imageFailures} photo(s) couldn't load` : ""} ·{" "}
                    {(result.stats.durationMs / 1000).toFixed(1)}s · checked {relativeTime(lookup?.updatedAt)}
                  </p>
                  {floor ? (
                    <p className="text-xs">
                      Max AliExpress price for <strong>{floorLabel}</strong> profit:{" "}
                      <strong className="tabular-nums">
                        {floor.maxSupplierPriceMinor > 0 ? moneyIn(floor.maxSupplierPriceMinor, result.ebay.currency) : "none"}
                      </strong>{" "}
                      <span className="text-muted-foreground">
                        (after eBay fees and {moneyIn(floor.shippingEstimateMinor, result.ebay.currency)} estimated shipping
                        {result.ebay.currency !== "USD"
                          ? ` · $1 = ${floor.usdRate.toFixed(2)} ${result.ebay.currency}${floor.rateSource === "fallback" ? ", offline rate" : ""}`
                          : ""}
                        )
                      </span>
                    </p>
                  ) : null}
                </div>
                <div className="flex items-start gap-2">
                  <Button size="sm" variant="outline" onClick={() => lookup && void run(lookup.ebayUrl, lookup.id)} disabled={running}>
                    <RefreshCw className={cn("size-3.5", running && "animate-spin")} /> Re-run
                  </Button>
                  <a
                    href={`/api/source-lookups/${lookup?.id}/export.csv`}
                    className="inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-[0.8rem] font-medium text-primary hover:bg-muted"
                  >
                    <Download className="size-3.5" /> CSV
                  </a>
                </div>
              </CardContent>
            </Card>

            {noneProfitable && floor && result ? (
              <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p>
                  <strong>No AliExpress source leaves {floorLabel} profit</strong> at this eBay price.{" "}
                  {floor.maxSupplierPriceMinor > 0
                    ? `To clear it, the AliExpress item must cost ${moneyIn(floor.maxSupplierPriceMinor, result.ebay.currency)} or less. `
                    : "No supplier price can clear it after eBay fees and shipping. "}
                  The closest matches are shown below.
                </p>
              </div>
            ) : null}

            {noHigh && !noneProfitable ? (
              <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p>
                  <strong>No high-confidence match.</strong> These are the closest AliExpress products we found. Check the photos by eye
                  before ordering.
                </p>
              </div>
            ) : null}

            {best ? (
              <Card className={cn("border-2", best.tier === "HIGH" && best.meetsProfit !== false ? "border-emerald-300" : "border-border")}>
                <CardHeader>
                  <CardDescription>
                    {best.meetsProfit === false
                      ? `Closest match (below ${floorLabel} profit)`
                      : best.tier === "HIGH"
                        ? floor
                          ? "Best profitable match"
                          : "Best match"
                        : "Closest profitable candidate"}
                  </CardDescription>
                  <div className="flex flex-wrap items-center gap-3">
                    <CardTitle className="text-4xl font-semibold tabular-nums">{best.confidence}%</CardTitle>
                    <TierBadge tier={best.tier} />
                  </div>
                </CardHeader>
                <CardContent className="grid gap-5 md:grid-cols-[auto_minmax(0,1fr)]">
                  <div className="flex items-center gap-2">
                    <figure className="text-center">
                      <Thumb src={result.ebay.images[0] ?? null} className="size-36" />
                      <figcaption className="mt-1 text-[11px] text-muted-foreground">eBay</figcaption>
                    </figure>
                    <figure className="text-center">
                      <Thumb src={best.imageUrl} className="size-36" />
                      <figcaption className="mt-1 text-[11px] text-muted-foreground">AliExpress</figcaption>
                    </figure>
                  </div>
                  <div className="min-w-0 space-y-2.5">
                    <p className="text-base font-medium leading-snug">{best.title}</p>
                    <SubScores c={best} />
                    <Reasons reasons={best.meetsProfit === false ? [...best.reasons, "profit_below_min"] : best.reasons} />
                    <SupplierLine c={best} />
                    <p className="text-xs text-muted-foreground">
                      Landed cost {moneyIn(best.priceMinor + best.shippingMinor, best.currency)}
                      {best.shippingEstimated ? " (shipping estimated in Settings)" : ""} ·{" "}
                      {best.meetsGate ? "passes your sourcing rules" : "doesn't pass all your sourcing rules (rating, orders, margin)"}
                    </p>
                    <a
                      href={best.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                    >
                      Open on AliExpress <ExternalLink className="size-3.5" />
                    </a>
                  </div>
                </CardContent>
              </Card>
            ) : lookup?.status === "no_candidates" || (result.candidates.length > 0 && candidates.length === 0) ? (
              <p className="text-sm text-muted-foreground">
                {candidates.length === 0 && result.candidates.length > 0
                  ? "No candidate rated 4.7★ or higher."
                  : "AliExpress returned no products for this listing."}
              </p>
            ) : null}

            {profitableList.length > 1 || (profitableList.length === 1 && best !== profitableList[0]) ? (
              <Card>
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle>{floor ? `Profitable sources (≥ ${floorLabel} profit)` : "All candidates"}</CardTitle>
                    <CardDescription>Ranked by confidence. High ≥ 75, Medium 50–74, Low under 50.</CardDescription>
                  </div>
                  <Only47 checked={only47} onChange={setOnly47} />
                </CardHeader>
                <CardContent className="divide-y divide-border p-0">
                  {profitableList
                    .filter((c) => c !== best)
                    .map((c, i) => (
                      <CandidateRow key={c.productId} c={c} rank={i + 2} />
                    ))}
                </CardContent>
              </Card>
            ) : null}

            {belowList.filter((c) => c !== best).length > 0 ? (
              <details className="group rounded-xl border border-border bg-card" open={noneProfitable}>
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <span>
                    <span className="font-medium">
                      Below {floorLabel} profit ({belowList.filter((c) => c !== best).length})
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      Same or similar products that are too expensive on AliExpress
                    </span>
                  </span>
                  {profitableList.length <= 1 ? <Only47 checked={only47} onChange={setOnly47} /> : null}
                </summary>
                <div className="divide-y divide-border border-t border-border">
                  {belowList
                    .filter((c) => c !== best)
                    .map((c, i) => (
                      <CandidateRow key={c.productId} c={c} rank={i + (noneProfitable ? 2 : 1)} muted />
                    ))}
                </div>
              </details>
            ) : null}
          </>
        ) : !running && !error ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Paste an eBay listing link above. Results are saved in your history on the right.
            </CardContent>
          </Card>
        ) : null}
      </div>

      <aside className="space-y-2">
        <p className="px-1 text-xs font-medium text-muted-foreground">History</p>
        {history.length === 0 ? <p className="px-1 text-xs text-muted-foreground">No lookups yet.</p> : null}
        <ul className="space-y-1">
          {history.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => void open(h.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left hover:bg-muted",
                  lookup?.id === h.id && "border-border bg-card",
                )}
              >
                <Thumb src={h.imageUrl} className="size-9" />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-1 text-xs font-medium">{h.title ?? h.ebayUrl}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {h.status === "failed" ? "failed" : h.bestTier ? `${h.bestConfidence}% · ${h.bestTier.toLowerCase()}` : "no candidates"}{" "}
                    · {relativeTime(h.updatedAt)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
