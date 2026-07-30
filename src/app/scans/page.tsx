"use client";

import { useEffect, useState } from "react";

export default function ScansPage() {
  const [scans, setScans] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    fetch("/api/scans")
      .then((r) => r.json())
      .then((j) => setScans(j.scans ?? []));
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Run history</h2>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Scan ID</th>
              <th className="px-3 py-2 text-left">Keyword</th>
              <th className="px-3 py-2 text-left">Mode</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Candidates</th>
              <th className="px-3 py-2 text-left">Started</th>
            </tr>
          </thead>
          <tbody>
            {scans.map((s) => (
              <tr key={String(s.id)} className="border-b border-slate-100">
                <td className="px-3 py-2 font-mono text-xs">{String(s.id)}</td>
                <td className="px-3 py-2">{String(s.keyword ?? "")}</td>
                <td className="px-3 py-2">{String(s.mode)}</td>
                <td className="px-3 py-2">{String(s.status)}</td>
                <td className="px-3 py-2">{String((s._count as { candidates?: number } | undefined)?.candidates ?? 0)}</td>
                <td className="px-3 py-2">{s.startedAt ? new Date(String(s.startedAt)).toLocaleString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
