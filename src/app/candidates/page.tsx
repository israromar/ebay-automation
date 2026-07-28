"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Candidate {
  id: string;
  productName: string;
  imageUrl: string | null;
  status: string;
  rating: number | null;
  reviewCount: number | null;
  orderCount: number | null;
  aliexpressPriceMinor: number | null;
  adjustedSourceCostMinor: number | null;
  ebayCurrentPriceMinor: number | null;
  soldLast30Days: number | null;
  estimatedProfitMinor: number | null;
  netMarginPercent: number | null;
  matchConfidence: number | null;
  lastVerifiedAt: string | null;
}

function money(minor: number | null) {
  if (minor == null) return "—";
  return `$${(minor / 100).toFixed(2)}`;
}

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [status, setStatus] = useState("");

  async function load(nextStatus = status) {
    const q = nextStatus ? `?status=${encodeURIComponent(nextStatus)}` : "";
    const res = await fetch(`/api/candidates${q}`);
    const json = await res.json();
    setCandidates(json.candidates ?? []);
  }

  useEffect(() => {
    load();
    // initial load only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Product candidates</h2>
          <p className="text-sm text-slate-600">Filter and open details for calculation breakdowns.</p>
        </div>
        <select
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            load(e.target.value);
          }}
        >
          <option value="">All statuses</option>
          <option value="NEEDS_MANUAL_VALIDATION">Needs manual validation</option>
          <option value="APPROVED">Approved</option>
          <option value="ALIEXPRESS_REJECTED">AliExpress rejected</option>
          <option value="UNPROFITABLE">Unprofitable</option>
          <option value="EXPORTED">Exported</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">AE rating / reviews / orders</th>
              <th className="px-3 py-2">Source / adj cost</th>
              <th className="px-3 py-2">eBay price</th>
              <th className="px-3 py-2">Sold 30d</th>
              <th className="px-3 py-2">Profit / margin</th>
              <th className="px-3 py-2">Match</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 align-top">
                <td className="px-3 py-3">
                  <Link href={`/candidates/${c.id}`} className="font-medium text-teal-800 hover:underline">
                    {c.productName}
                  </Link>
                </td>
                <td className="px-3 py-3">
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{c.status}</span>
                </td>
                <td className="px-3 py-3 tabular-nums">
                  {c.rating ?? "—"} / {c.reviewCount ?? "—"} / {c.orderCount ?? "—"}
                </td>
                <td className="px-3 py-3 tabular-nums">
                  {money(c.aliexpressPriceMinor)} / {money(c.adjustedSourceCostMinor)}
                </td>
                <td className="px-3 py-3 tabular-nums">{money(c.ebayCurrentPriceMinor)}</td>
                <td className="px-3 py-3 tabular-nums">{c.soldLast30Days ?? "—"}</td>
                <td className="px-3 py-3 tabular-nums">
                  {money(c.estimatedProfitMinor)} / {c.netMarginPercent?.toFixed(1) ?? "—"}%
                </td>
                <td className="px-3 py-3 tabular-nums">{c.matchConfidence ?? "—"}</td>
              </tr>
            ))}
            {candidates.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                  No candidates yet. Run a scan from Overview.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
