"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { buildEbayPurchaseHistoryUrl, buildEbaySoldSearchUrl, dollarsToMinor, minorToDollarsInput } from "@/lib/domain/ebay-sold-history";

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
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="text-slate-500">—</p>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <a href={value} target="_blank" rel="noopener noreferrer" title={value} className="block truncate text-teal-800 hover:underline">
        {value}
      </a>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copy} className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
          {copied ? "Copied" : "Copy URL"}
        </button>
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
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

  if (!candidate) return <p className="text-sm text-slate-600">Loading…</p>;

  const profit = (candidate.profitCalculations as Array<Record<string, unknown>>)?.[0];
  const needsDemand = candidate.demandVerified !== true || String(candidate.status) === "NEEDS_MANUAL_VALIDATION";
  const hasValidatedAe = Boolean(
    candidate.aliexpressProductId &&
    candidate.aliexpressUrl &&
    typeof candidate.aliexpressPriceMinor === "number" &&
    typeof candidate.matchConfidence === "number",
  );
  const aeAlternatives = ((candidate.sourceProducts as Array<Record<string, unknown>>) ?? [])
    .filter((source) => source.marketplace === "aliexpress_alternative")
    .map(readAliExpressAlternative)
    .filter((source): source is NonNullable<typeof source> => source != null);

  return (
    <div className="space-y-6">
      <div className="min-w-0">
        <h2 className="break-words text-2xl font-semibold">{String(candidate.productName)}</h2>
        <p className="text-sm text-slate-600">
          Status: <span className="font-medium">{String(candidate.status)}</span>
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <h3 className="font-medium">AliExpress</h3>
          <div className="mt-3 space-y-3 text-slate-700">
            <UrlActions label="URL" url={String(candidate.aliexpressUrl ?? "")} />
            <ul className="space-y-1">
              <li>Rating: {String(candidate.rating ?? "—")}</li>
              <li>Reviews: {String(candidate.reviewCount ?? "—")}</li>
              <li>Orders: {String(candidate.orderCount ?? "—")}</li>
              <li>Price: {money(candidate.aliexpressPriceMinor)}</li>
              <li>Shipping: {money(candidate.aliexpressShippingMinor)}</li>
            </ul>
            {!candidate.aliexpressUrl && aeAlternatives.length > 0 ? (
              <div className="space-y-2 border-t border-slate-200 pt-3">
                <p className="font-medium text-slate-900">Relevant alternatives found</p>
                <p className="text-xs text-slate-600">
                  These were not attached because supplier data or economics failed the configured rules.
                </p>
                {aeAlternatives.map((alternative) => (
                  <a
                    key={alternative.url}
                    href={alternative.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-md border border-slate-200 p-2 hover:bg-slate-50"
                  >
                    <span className="line-clamp-2 font-medium text-teal-800">{alternative.title}</span>
                    <span className="mt-1 block text-xs text-slate-600">
                      {money(alternative.priceMinor)} · match {alternative.confidence ?? "—"} · rating {alternative.rating ?? "—"} · orders{" "}
                      {alternative.orderCount ?? "—"}
                    </span>
                    {alternative.reasons.length > 0 || alternative.missingFields.length > 0 ? (
                      <span className="mt-1 block text-xs text-amber-700">
                        {[...alternative.reasons, ...alternative.missingFields.map((field) => `Missing ${field}`)].join(" · ")}
                      </span>
                    ) : null}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <h3 className="font-medium">eBay match</h3>
          <div className="mt-3 space-y-3 text-slate-700">
            <UrlActions label="URL" url={String(candidate.ebayUrl ?? "")} />
            <ul className="space-y-1">
              <li>Confidence: {String(candidate.matchConfidence ?? "—")}</li>
              <li>Current price: {money(candidate.ebayCurrentPriceMinor)}</li>
              <li>Avg completed sale: {money(candidate.avgCompletedSaleMinor)}</li>
              <li>Active listings: {String(candidate.activeListingCount ?? "—")}</li>
              <li>Sold last 30d: {String(candidate.soldLast30Days ?? "—")}</li>
              <li>Demand verified: {String(candidate.demandVerified)}</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <h3 className="font-medium">Profit breakdown</h3>
        {profit ? (
          <pre className="mt-2 overflow-x-auto rounded bg-slate-50 p-3 text-xs">{JSON.stringify(profit, null, 2)}</pre>
        ) : (
          <p className="mt-2 text-slate-500">No calculation stored.</p>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <h3 className="font-medium">Rejection / reason codes</h3>
        <pre className="mt-2 overflow-x-auto rounded bg-slate-50 p-3 text-xs">{String(candidate.rejectionReasonsJson ?? "[]")}</pre>
      </section>

      <section className={`rounded-lg border p-4 text-sm ${needsDemand ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
        <h3 className="font-medium">Sold history / demand validation</h3>
        {hasValidatedAe ? (
          <p className="mt-1 text-slate-700">
            Browse API cannot supply sold counts. Open eBay sold history while logged in, then enter the numbers here. Approval requires
            verified demand.
          </p>
        ) : (
          <p className="mt-1 font-medium text-amber-800">
            Demand can be recorded only after a qualified AliExpress source is attached. This candidate cannot be approved yet.
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {soldHistoryLinks.purchaseHistory ? (
            <a
              href={soldHistoryLinks.purchaseHistory}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800"
            >
              Open listing sold history
            </a>
          ) : null}
          <a
            href={soldHistoryLinks.soldSearch}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium hover:bg-slate-50"
          >
            Open sold+completed search
          </a>
          {soldHistoryLinks.purchaseHistory ? (
            <button
              type="button"
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs hover:bg-slate-50"
              onClick={() => setEvidence(soldHistoryLinks.purchaseHistory ?? "")}
            >
              Use history URL as evidence
            </button>
          ) : null}
        </div>

        <ol className="mt-3 list-decimal space-y-1 pl-5 text-slate-700">
          <li>Click “Open listing sold history” (sign in to eBay if prompted).</li>
          <li>Count sales in the last ~30 days and note typical sold price.</li>
          <li>Enter sold count + prices below and apply.</li>
        </ol>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Sold last 30 days</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              value={sold}
              onChange={(e) => setSold(e.target.value)}
              inputMode="numeric"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Avg sold price ($)</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              value={avgSale}
              onChange={(e) => setAvgSale(e.target.value)}
              placeholder="e.g. 24.99"
              inputMode="decimal"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Median sold price ($)</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              value={medianSale}
              onChange={(e) => setMedianSale(e.target.value)}
              placeholder="optional"
              inputMode="decimal"
            />
          </label>
          <label className="space-y-1 sm:col-span-2 lg:col-span-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Evidence URL</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              placeholder="Sold history URL"
            />
          </label>
        </div>

        <div className="mt-3">
          <button
            type="button"
            disabled={busy || !hasValidatedAe}
            onClick={submitDemand}
            className="rounded-md bg-teal-700 px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Applying…" : "Apply demand"}
          </button>
        </div>
        {msg ? <p className="mt-2">{msg}</p> : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <h3 className="font-medium">Source records / history</h3>
        <pre className="mt-2 max-h-80 overflow-auto rounded bg-slate-50 p-3 text-xs">
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
