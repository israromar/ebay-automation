"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function CandidateDetailPage() {
  const params = useParams<{ id: string }>();
  const [candidate, setCandidate] = useState<Record<string, unknown> | null>(null);
  const [sold, setSold] = useState("5");
  const [evidence, setEvidence] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    const res = await fetch(`/api/candidates/${params.id}`);
    const json = await res.json();
    setCandidate(json.candidate);
  }

  useEffect(() => {
    if (params.id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function submitDemand() {
    setMsg("");
    const res = await fetch(`/api/candidates/${params.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        soldLast30Days: Number(sold),
        evidenceUrl: evidence || undefined,
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
  }

  if (!candidate) return <p className="text-sm text-slate-600">Loading…</p>;

  const profit = (candidate.profitCalculations as Array<Record<string, unknown>>)?.[0];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">{String(candidate.productName)}</h2>
        <p className="text-sm text-slate-600">
          Status: <span className="font-medium">{String(candidate.status)}</span>
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <h3 className="font-medium">AliExpress</h3>
          <ul className="mt-2 space-y-1 text-slate-700">
            <li>URL: {String(candidate.aliexpressUrl ?? "—")}</li>
            <li>Rating: {String(candidate.rating ?? "—")}</li>
            <li>Reviews: {String(candidate.reviewCount ?? "—")}</li>
            <li>Orders: {String(candidate.orderCount ?? "—")}</li>
            <li>Price minor: {String(candidate.aliexpressPriceMinor ?? "—")}</li>
            <li>Shipping minor: {String(candidate.aliexpressShippingMinor ?? "—")}</li>
          </ul>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <h3 className="font-medium">eBay match</h3>
          <ul className="mt-2 space-y-1 text-slate-700">
            <li>URL: {String(candidate.ebayUrl ?? "—")}</li>
            <li>Confidence: {String(candidate.matchConfidence ?? "—")}</li>
            <li>Current price minor: {String(candidate.ebayCurrentPriceMinor ?? "—")}</li>
            <li>Active listings: {String(candidate.activeListingCount ?? "—")}</li>
            <li>Sold last 30d: {String(candidate.soldLast30Days ?? "—")}</li>
            <li>Demand verified: {String(candidate.demandVerified)}</li>
          </ul>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <h3 className="font-medium">Profit breakdown</h3>
        {profit ? (
          <pre className="mt-2 overflow-x-auto rounded bg-slate-50 p-3 text-xs">
            {JSON.stringify(profit, null, 2)}
          </pre>
        ) : (
          <p className="mt-2 text-slate-500">No calculation stored.</p>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <h3 className="font-medium">Rejection / reason codes</h3>
        <pre className="mt-2 overflow-x-auto rounded bg-slate-50 p-3 text-xs">
          {String(candidate.rejectionReasonsJson ?? "[]")}
        </pre>
      </section>

      <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
        <h3 className="font-medium">Manual demand validation</h3>
        <p className="mt-1 text-slate-700">
          Use when Marketplace Insights / licensed sold-history is unavailable. Approval requires
          verified demand.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            className="rounded-md border border-slate-300 px-3 py-2"
            value={sold}
            onChange={(e) => setSold(e.target.value)}
            aria-label="Sold last 30 days"
            placeholder="Sold last 30 days"
          />
          <input
            className="flex-1 rounded-md border border-slate-300 px-3 py-2"
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            aria-label="Evidence URL"
            placeholder="Evidence URL"
          />
          <button
            type="button"
            onClick={submitDemand}
            className="rounded-md bg-teal-700 px-4 py-2 font-medium text-white"
          >
            Apply demand
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
