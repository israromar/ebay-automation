"use client";

import { useEffect, useState } from "react";

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<Array<Record<string, unknown>>>([]);
  const [jobs, setJobs] = useState<Array<Record<string, unknown>>>([]);
  const [name, setName] = useState("Daily blender scan");
  const [cron, setCron] = useState("daily");
  const [keyword, setKeyword] = useState("portable rechargeable blender");
  const [msg, setMsg] = useState("");

  async function load() {
    const res = await fetch("/api/schedules");
    const json = await res.json();
    setSchedules(json.schedules ?? []);
    setJobs(json.jobs ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function create() {
    const res = await fetch("/api/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, cron, keyword }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMsg(JSON.stringify(json));
      return;
    }
    setMsg(`Created ${json.schedule.id}`);
    await load();
  }

  async function tick() {
    const res = await fetch("/api/schedules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "tick" }),
    });
    const json = await res.json();
    setMsg(`Tick: ${JSON.stringify(json.due)}`);
    await load();
  }

  const [exporting, setExporting] = useState(false);

  async function exportApproved(destination: "csv" | "google_sheets") {
    setExporting(true);
    setMsg("");
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination }),
      });
      const json = await res.json();
      setMsg(JSON.stringify(json));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Schedules & jobs</h2>
        <p className="text-sm text-slate-600">Daily/weekly/cron supported. Hourly is intentionally not the default.</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        <h3 className="font-medium">Export approved candidates</h3>
        <p className="text-sm text-slate-600">
          Only candidates with status <span className="font-medium">APPROVED</span> are exported. If count is 0, approve one candidate first
          via Manual demand validation.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={exporting}
            onClick={() => exportApproved("google_sheets")}
            className="rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {exporting ? "Exporting…" : "Export to Google Sheets"}
          </button>
          <button
            type="button"
            disabled={exporting}
            onClick={() => exportApproved("csv")}
            className="rounded-md border px-3 py-2 text-sm disabled:opacity-60"
          >
            Export approved CSV
          </button>
        </div>
        {msg ? <p className="text-xs text-slate-700 break-all">{msg}</p> : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        <h3 className="font-medium">Create schedule</h3>
        <div className="grid gap-2 sm:grid-cols-3">
          <input className="rounded-md border px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="rounded-md border px-3 py-2 text-sm" value={cron} onChange={(e) => setCron(e.target.value)} />
          <input className="rounded-md border px-3 py-2 text-sm" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={create} className="rounded-md bg-teal-700 px-3 py-2 text-sm text-white">
            Create
          </button>
          <button type="button" onClick={tick} className="rounded-md border px-3 py-2 text-sm">
            Run scheduler tick
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="font-medium">Schedules</h3>
        <pre className="mt-2 overflow-auto text-xs">{JSON.stringify(schedules, null, 2)}</pre>
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="font-medium">Recent jobs</h3>
        <pre className="mt-2 overflow-auto text-xs">{JSON.stringify(jobs, null, 2)}</pre>
      </section>
    </div>
  );
}
