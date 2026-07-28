"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Overview {
  totalCandidates: number;
  approvedCandidates: number;
  rejectedCandidates: number;
  awaitingManualValidation: number;
  averageMargin: number | null;
  averageRecentSales: number | null;
  lastScanTime: string | null;
  lastScanStatus: string | null;
  dataSourceHealth: Array<{ provider: string; status: string; message: string | null; createdAt: string }>;
}

export default function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [keyword, setKeyword] = useState("portable rechargeable blender");
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const res = await fetch("/api/overview");
    setData(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function runScan() {
    setRunning(true);
    setMessage("");
    try {
      const res = await fetch("/api/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword, limit: 5 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(json));
      setMessage(`Scan ${json.scanId} completed with ${json.candidates.length} candidates.`);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  const cards = [
    { label: "Total candidates", value: data?.totalCandidates ?? "—" },
    { label: "Approved", value: data?.approvedCandidates ?? "—" },
    { label: "Rejected", value: data?.rejectedCandidates ?? "—" },
    { label: "Awaiting manual validation", value: data?.awaitingManualValidation ?? "—" },
    {
      label: "Average margin %",
      value: data?.averageMargin != null ? data.averageMargin.toFixed(1) : "—",
    },
    {
      label: "Average recent sales",
      value: data?.averageRecentSales != null ? data.averageRecentSales.toFixed(1) : "—",
    },
  ];

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h2 className="text-2xl font-semibold">Overview</h2>
        <p className="max-w-2xl text-sm text-slate-600">
          Sold-history demand is not available from public eBay Browse APIs. Candidates requiring
          demand proof stay in <strong>NEEDS_MANUAL_VALIDATION</strong> until you confirm sales.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">{c.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{c.value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="font-medium">Run keyword scan</h3>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            aria-label="Search keyword"
          />
          <button
            type="button"
            onClick={runScan}
            disabled={running}
            className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {running ? "Scanning…" : "Start scan"}
          </button>
        </div>
        {message ? <p className="mt-2 text-sm text-slate-700">{message}</p> : null}
        <p className="mt-2 text-xs text-slate-500">
          Last scan: {data?.lastScanTime ? new Date(data.lastScanTime).toLocaleString() : "none"} (
          {data?.lastScanStatus ?? "n/a"}) · <Link href="/candidates">View candidates</Link>
        </p>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="font-medium">Data-source health</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {(data?.dataSourceHealth ?? []).length === 0 ? (
            <li className="text-slate-500">No events yet.</li>
          ) : (
            data!.dataSourceHealth.map((h, i) => (
              <li key={`${h.provider}-${i}`} className="flex justify-between gap-4 border-b border-slate-100 pb-2">
                <span>
                  <span className="font-medium">{h.provider}</span> · {h.status}
                  {h.message ? ` — ${h.message}` : ""}
                </span>
                <span className="text-xs text-slate-500">
                  {new Date(h.createdAt).toLocaleString()}
                </span>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
