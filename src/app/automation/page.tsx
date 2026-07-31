"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Stage = {
  id: string;
  stage: string;
  status: string;
  attempt: number;
  progressCurrent: number;
  progressTotal: number;
  error?: string | null;
};

type Decision = {
  id: string;
  candidateId?: string | null;
  outcome: string;
  reasonsJson?: string | null;
  evidenceJson?: string | null;
  selected: boolean;
};

type Candidate = {
  id: string;
  productName: string;
  status: string;
  imageUrl?: string | null;
  ebayUrl?: string | null;
  aliexpressUrl?: string | null;
  aliexpressPriceMinor?: number | null;
  aliexpressShippingMinor?: number | null;
  matchConfidence?: number | null;
  rating?: number | null;
  orderCount?: number | null;
  netMarginPercent?: number | null;
  soldLast30Days?: number | null;
  demandVerified?: boolean;
};

type Run = {
  id: string;
  status: string;
  configJson: string;
  capabilitiesJson?: string | null;
  progressJson?: string | null;
  summaryJson?: string | null;
  error?: string | null;
  startedAt: string;
  finishedAt?: string | null;
  stages: Stage[];
  decisions: Decision[];
};

type ReviewItem = {
  decision: Decision;
  candidate: Candidate | null;
};

type Capabilities = {
  aliexpressOfficial: boolean;
  aliexpressImageSearch: boolean;
  aliexpressSmartMatch: boolean;
  aliexpressHotProducts: boolean;
  ebayCredentials: boolean;
  ebayInsights: boolean;
  visualMatch: boolean;
  googleSheets: boolean;
};

function money(minor?: number | null) {
  if (typeof minor !== "number") return "—";
  return `$${(minor / 100).toFixed(2)}`;
}

function parseReasons(raw?: string | null) {
  try {
    const parsed = JSON.parse(raw ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) throw new Error(`Request failed (${response.status})`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Server returned an invalid response (${response.status})`);
  }
}

export default function AutomationPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [soldById, setSoldById] = useState<Record<string, string>>({});
  const [avgById, setAvgById] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [topKeywords, setTopKeywords] = useState(5);
  const [topIdeas, setTopIdeas] = useState(10);
  const [destination, setDestination] = useState<"csv" | "google_sheets">("csv");

  const loadRuns = useCallback(async () => {
    try {
      const res = await fetch("/api/automation/runs");
      const json = await readJsonResponse<{ runs?: Run[]; capabilities?: Capabilities; error?: string }>(res);
      if (!res.ok) throw new Error(json.error ?? "Unable to load automation runs");
      setRuns(json.runs ?? []);
      setCapabilities(json.capabilities ?? null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const loadRun = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/automation/runs/${id}`);
      const json = await readJsonResponse<{ run?: Run; reviewItems?: ReviewItem[]; error?: string }>(res);
      if (!res.ok || !json.run) throw new Error(json.error ?? "Unable to load automation run");
      setRun(json.run);
      setReviewItems(json.reviewItems ?? []);
      setActiveRunId(json.run.id);
      setSelected((prev) => {
        const next = { ...prev };
        for (const item of json.reviewItems ?? []) {
          const candidateId = item.candidate?.id;
          if (!candidateId) continue;
          if (item.decision.outcome === "REJECTED") continue;
          if (next[candidateId] == null) next[candidateId] = item.decision.outcome !== "REJECTED";
        }
        return next;
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    if (!activeRunId || !run) return;
    if (!["PENDING", "RUNNING"].includes(run.status)) return;
    const timer = setInterval(() => {
      void loadRun(activeRunId);
    }, 2500);
    return () => clearInterval(timer);
  }, [activeRunId, run, loadRun]);

  const progress = useMemo(() => {
    try {
      return run?.progressJson ? (JSON.parse(run.progressJson) as Record<string, number | string | null>) : {};
    } catch {
      return {};
    }
  }, [run]);

  async function startRun() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/automation/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topKeywords, topIdeas, destination, productsPerKeyword: 8, searchLimit: 30 }),
      });
      const json = await readJsonResponse<{ run?: Run; error?: unknown }>(res);
      if (!res.ok || !json.run) throw new Error(json.error ? JSON.stringify(json.error) : "Failed to start");
      setRun(json.run);
      setActiveRunId(json.run.id);
      setReviewItems([]);
      setSelected({});
      await loadRuns();
      setMessage("Automation run started.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function cancelRun() {
    if (!activeRunId) return;
    setBusy(true);
    try {
      await fetch(`/api/automation/runs/${activeRunId}/cancel`, { method: "POST" });
      await loadRun(activeRunId);
      await loadRuns();
    } finally {
      setBusy(false);
    }
  }

  async function approveAndPrepareExport() {
    if (!activeRunId) return;
    setBusy(true);
    setMessage("");
    try {
      const candidateIds = Object.entries(selected)
        .filter(([, on]) => on)
        .map(([id]) => id);
      if (candidateIds.length === 0) throw new Error("Select at least one candidate");

      const demandByCandidateId: Record<string, { soldLast30Days: number; avgCompletedSaleMinor?: number; evidenceUrl?: string }> = {};
      for (const id of candidateIds) {
        const item = reviewItems.find((entry) => entry.candidate?.id === id);
        const alreadyApproved = item?.candidate?.status === "APPROVED";
        if (alreadyApproved) continue;
        const sold = Number(soldById[id] ?? "");
        if (!Number.isFinite(sold) || sold < 0) {
          throw new Error(`Enter sold last 30 days for ${item?.candidate?.productName ?? id}`);
        }
        const avg = avgById[id]?.trim() ? Math.round(Number(avgById[id]) * 100) : undefined;
        demandByCandidateId[id] = {
          soldLast30Days: sold,
          avgCompletedSaleMinor: Number.isFinite(avg) ? avg : undefined,
          evidenceUrl: item?.candidate?.ebayUrl ?? undefined,
        };
      }

      const approveRes = await fetch(`/api/automation/runs/${activeRunId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateIds,
          demandByCandidateId,
          actor: "automation-ui",
        }),
      });
      const approveJson = await readJsonResponse<{ error?: string }>(approveRes);
      if (!approveRes.ok) throw new Error(approveJson.error ?? "Approve failed");

      const exportRes = await fetch(`/api/automation/runs/${activeRunId}/export`, { method: "POST" });
      const exportJson = await readJsonResponse<{ error?: string }>(exportRes);
      if (!exportRes.ok) throw new Error(exportJson.error ?? "Export failed");

      setMessage("Approved and exported selected candidates.");
      await loadRun(activeRunId);
      await loadRuns();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Automation control center</h2>
          <p className="mt-1 text-sm text-slate-600">
            One button runs keywords → eBay discovery → AE match → decisions. You approve once, then export.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={startRun}
          className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {busy ? "Working…" : "Run complete research"}
        </button>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <label className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">Top keywords</span>
          <input
            type="number"
            min={1}
            max={20}
            value={topKeywords}
            onChange={(event) => setTopKeywords(Number(event.target.value))}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
          />
        </label>
        <label className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">Top ideas to match</span>
          <input
            type="number"
            min={1}
            max={40}
            value={topIdeas}
            onChange={(event) => setTopIdeas(Number(event.target.value))}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
          />
        </label>
        <label className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">Export destination</span>
          <select
            value={destination}
            onChange={(event) => setDestination(event.target.value as "csv" | "google_sheets")}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
          >
            <option value="csv">CSV</option>
            <option value="google_sheets">Google Sheets</option>
          </select>
        </label>
      </section>

      {capabilities ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <h3 className="font-medium">Provider capabilities</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(capabilities).map(([key, enabled]) => (
              <span
                key={key}
                className={`rounded-full px-2 py-1 text-xs ${enabled ? "bg-teal-50 text-teal-800" : "bg-amber-50 text-amber-800"}`}
              >
                {key}: {enabled ? "ready" : "fallback"}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {message ? <p className="text-sm text-slate-700">{message}</p> : null}

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <h3 className="font-medium">Recent runs</h3>
          <ul className="mt-2 space-y-2">
            {runs.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => void loadRun(entry.id)}
                  className={`w-full rounded-md px-2 py-2 text-left hover:bg-slate-50 ${activeRunId === entry.id ? "bg-slate-100" : ""}`}
                >
                  <span className="block font-medium">{entry.status}</span>
                  <span className="block text-xs text-slate-500">{new Date(entry.startedAt).toLocaleString()}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="space-y-4">
          {run ? (
            <>
              <section className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-medium">Run {run.id.slice(0, 8)}</h3>
                    <p className="text-sm text-slate-600">Status: {run.status}</p>
                  </div>
                  {["PENDING", "RUNNING"].includes(run.status) ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={cancelRun}
                      className="rounded-md border border-slate-300 px-3 py-1 text-sm"
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
                {run.error ? <p className="mt-2 text-sm text-amber-800">{run.error}</p> : null}
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                  <div className="rounded border border-slate-200 p-2">Keywords: {String(progress.keywordsSelected ?? 0)}</div>
                  <div className="rounded border border-slate-200 p-2">Ideas: {String(progress.ideasFound ?? 0)}</div>
                  <div className="rounded border border-slate-200 p-2">Candidates: {String(progress.candidatesCreated ?? 0)}</div>
                  <div className="rounded border border-slate-200 p-2">
                    Ready / Evidence / Rejected: {String(progress.readyForApproval ?? 0)} / {String(progress.needsEvidence ?? 0)} /{" "}
                    {String(progress.rejected ?? 0)}
                  </div>
                </div>
                <ol className="mt-4 space-y-2">
                  {run.stages.map((stage) => (
                    <li key={stage.id} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm">
                      <span className="font-medium">{stage.stage}</span>
                      <span className="text-slate-600">
                        {stage.status}
                        {stage.progressTotal > 0 ? ` · ${stage.progressCurrent}/${stage.progressTotal}` : ""}
                        {stage.error ? ` · ${stage.error}` : ""}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>

              {run.status === "AWAITING_APPROVAL" || reviewItems.length > 0 ? (
                <section className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-medium">Final approval gate</h3>
                      <p className="text-sm text-slate-600">
                        Review matches, enter sold counts where needed, then approve and export in one step.
                      </p>
                    </div>
                    {run.status === "AWAITING_APPROVAL" || run.status === "APPROVED" ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={approveAndPrepareExport}
                        className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                      >
                        Approve and export
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-4 space-y-3">
                    {reviewItems.map((item) => {
                      const candidate = item.candidate;
                      if (!candidate) return null;
                      const reasons = parseReasons(item.decision.reasonsJson);
                      const checked = Boolean(selected[candidate.id]);
                      return (
                        <div key={item.decision.id} className="rounded-md border border-slate-200 p-3 text-sm">
                          <div className="flex flex-wrap gap-3">
                            {candidate.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={candidate.imageUrl} alt="" className="h-20 w-20 rounded object-cover" />
                            ) : null}
                            <div className="min-w-0 flex-1">
                              <label className="flex items-start gap-2">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={item.decision.outcome === "REJECTED"}
                                  onChange={(event) => setSelected((prev) => ({ ...prev, [candidate.id]: event.target.checked }))}
                                />
                                <span className="font-medium">{candidate.productName}</span>
                              </label>
                              <p className="mt-1 text-xs text-slate-600">
                                {item.decision.outcome} · match {candidate.matchConfidence ?? "—"} · AE{" "}
                                {money(candidate.aliexpressPriceMinor)} · ship{" "}
                                {typeof candidate.aliexpressShippingMinor === "number"
                                  ? money(candidate.aliexpressShippingMinor)
                                  : "Unknown"}{" "}
                                · margin {candidate.netMarginPercent?.toFixed?.(1) ?? "—"}% · orders {candidate.orderCount ?? "—"} · rating{" "}
                                {candidate.rating ?? "—"}
                              </p>
                              {reasons.length ? <p className="mt-1 text-xs text-amber-700">{reasons.join(" · ")}</p> : null}
                              <div className="mt-2 flex flex-wrap gap-2">
                                {candidate.ebayUrl ? (
                                  <a href={candidate.ebayUrl} target="_blank" rel="noreferrer" className="text-xs text-teal-700 underline">
                                    eBay
                                  </a>
                                ) : null}
                                {candidate.aliexpressUrl ? (
                                  <a
                                    href={candidate.aliexpressUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs text-teal-700 underline"
                                  >
                                    AliExpress
                                  </a>
                                ) : null}
                                <Link href={`/candidates/${candidate.id}`} className="text-xs text-slate-700 underline">
                                  Details
                                </Link>
                              </div>
                              {item.decision.outcome === "NEEDS_EVIDENCE" && checked ? (
                                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                  <input
                                    type="number"
                                    min={0}
                                    placeholder="Sold last 30 days"
                                    value={soldById[candidate.id] ?? ""}
                                    onChange={(event) => setSoldById((prev) => ({ ...prev, [candidate.id]: event.target.value }))}
                                    className="rounded border border-slate-300 px-2 py-1"
                                  />
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    placeholder="Avg sold price (USD)"
                                    value={avgById[candidate.id] ?? ""}
                                    onChange={(event) => setAvgById((prev) => ({ ...prev, [candidate.id]: event.target.value }))}
                                    className="rounded border border-slate-300 px-2 py-1"
                                  />
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : null}
            </>
          ) : (
            <section className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-600">
              Start a run to watch stages and complete the final approval gate here.
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
