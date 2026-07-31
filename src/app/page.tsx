"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Play, Search, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

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

interface CandidateRow {
  id: string;
  productName: string;
  imageUrl: string | null;
  status: string;
  soldLast30Days: number | null;
  ebayCurrentPriceMinor: number | null;
  estimatedProfitMinor: number | null;
  netMarginPercent: number | null;
  matchConfidence: number | null;
}

function money(minor: number | null | undefined) {
  if (minor == null) return "—";
  return `$${(minor / 100).toFixed(2)}`;
}

function statusTone(status: string) {
  if (status === "APPROVED" || status === "EXPORTED") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (status === "NEEDS_MANUAL_VALIDATION") return "bg-amber-50 text-amber-900 border-amber-200";
  if (status.includes("REJECT") || status === "UNPROFITABLE") return "bg-red-50 text-red-800 border-red-200";
  return "bg-muted text-muted-foreground border-border";
}

export default function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [recent, setRecent] = useState<CandidateRow[]>([]);
  const [keyword, setKeyword] = useState("portable rechargeable blender");
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [scoutHint, setScoutHint] = useState(true);

  async function load() {
    setError("");
    const [overviewRes, candidatesRes] = await Promise.all([fetch("/api/overview"), fetch("/api/candidates?limit=8")]);
    const overviewJson = await overviewRes.json().catch(() => ({}));
    const candidatesJson = await candidatesRes.json().catch(() => ({}));
    if (!overviewRes.ok) {
      setError(typeof overviewJson.error === "string" ? overviewJson.error : "Unable to load overview");
      return;
    }
    setData(overviewJson as Overview);
    setRecent((candidatesJson.candidates ?? []) as CandidateRow[]);
  }

  useEffect(() => {
    void load();
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
      if (!res.ok) throw new Error(json.error ? String(json.error) : JSON.stringify(json));
      setMessage(`Scan ${json.scanId} completed with ${json.candidates.length} candidates.`);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  const activity = useMemo(() => {
    const total = Math.max(data?.totalCandidates ?? 0, 1);
    return Array.from({ length: 12 }, (_, i) => {
      const wave = Math.sin(i / 2) * 0.35 + 0.55;
      const boost = i === 8 ? 1 : wave;
      return Math.max(12, Math.round(boost * Math.min(total, 40) * 2.2));
    });
  }, [data?.totalCandidates]);

  const maxBar = Math.max(...activity, 1);
  const watchlist = recent.filter((c) => c.status === "APPROVED" || c.status === "NEEDS_MANUAL_VALIDATION").slice(0, 4);

  const kpis = [
    { label: "Products analyzed", value: data?.totalCandidates ?? "—", delta: "workspace total" },
    { label: "Promising opportunities", value: data?.approvedCandidates ?? "—", delta: "approved" },
    {
      label: "Avg. estimated margin",
      value: data?.averageMargin != null ? `${data.averageMargin.toFixed(0)}%` : "—",
      delta: "net margin",
    },
    { label: "Needs demand proof", value: data?.awaitingManualValidation ?? "—", delta: "manual / Insights" },
  ];

  return (
    <div className="space-y-5">
      {error ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {kpis.map((kpi) => (
              <Card key={kpi.label} size="sm" className="shadow-sm ring-1 ring-black/5">
                <CardHeader className="gap-1 pb-1">
                  <CardDescription className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    {kpi.label}
                  </CardDescription>
                  <CardTitle className="font-mono text-[28px] leading-none tabular-nums tracking-tight">{kpi.value}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <Badge variant="secondary" className="font-normal text-[10px]">
                    {kpi.delta}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </section>

          <Card className="shadow-sm ring-1 ring-black/5">
            <CardHeader className="flex-row items-start justify-between gap-3 border-b border-border/60 pb-4">
              <div>
                <CardTitle>Opportunity activity</CardTitle>
                <CardDescription>Relative analysis volume from workspace candidates (illustrative bars).</CardDescription>
              </div>
              <div className="flex gap-1 rounded-lg bg-muted p-1">
                {["7d", "30d", "90d"].map((t, i) => (
                  <span
                    key={t}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium",
                      i === 1 ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
                    )}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </CardHeader>
            <CardContent className="pt-5">
              <div className="flex h-40 items-end gap-2">
                {activity.map((v, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-2">
                    <div
                      className={cn("w-full rounded-t-md transition-all", i === 8 ? "bg-primary" : "bg-[#b4c5ff]")}
                      style={{ height: `${Math.max(8, (v / maxBar) * 100)}%` }}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden py-0 shadow-sm ring-1 ring-black/5">
            <CardHeader className="flex-row items-center justify-between gap-3 border-b border-border/60 py-4">
              <div>
                <CardTitle>Recent product analyses</CardTitle>
                <CardDescription>Latest candidates in this workspace</CardDescription>
              </div>
              <Link href="/candidates" className="text-sm font-medium text-primary hover:underline">
                View all
              </Link>
            </CardHeader>
            <CardContent className="px-0">
              {recent.length === 0 ? (
                <div className="relative mx-4 my-4 overflow-hidden rounded-xl">
                  <Image
                    src="/media/overview-empty.jpg"
                    alt="Analytics dashboard workspace"
                    width={1200}
                    height={480}
                    className="h-44 w-full object-cover"
                  />
                  <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 to-transparent p-4 text-white">
                    <p className="font-medium">No candidates yet</p>
                    <p className="text-xs text-white/80">Run research or a quick scan to populate this table.</p>
                  </div>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Sold (life / 30d)</TableHead>
                      <TableHead>Match</TableHead>
                      <TableHead>ASP</TableHead>
                      <TableHead>Profit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recent.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <Link href={`/candidates/${c.id}`} className="flex items-center gap-3">
                            <div className="relative size-10 overflow-hidden rounded-md bg-muted">
                              {c.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={c.imageUrl} alt="" className="size-10 object-cover" />
                              ) : (
                                <Image src="/media/product-tech.jpg" alt="" fill className="object-cover opacity-80" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground hover:text-primary">{c.productName}</p>
                              <Badge variant="outline" className={cn("mt-1 border text-[10px]", statusTone(c.status))}>
                                {c.status}
                              </Badge>
                            </div>
                          </Link>
                        </TableCell>
                        <TableCell className="font-mono tabular-nums">{c.soldLast30Days ?? "—"}</TableCell>
                        <TableCell className="font-mono tabular-nums text-primary">{c.matchConfidence ?? "—"}</TableCell>
                        <TableCell className="font-mono tabular-nums">{money(c.ebayCurrentPriceMinor)}</TableCell>
                        <TableCell
                          className={cn(
                            "font-mono tabular-nums",
                            (c.estimatedProfitMinor ?? 0) >= 0 ? "text-emerald-700" : "text-red-700",
                          )}
                        >
                          {money(c.estimatedProfitMinor)}
                          {c.netMarginPercent != null ? ` · ${c.netMarginPercent.toFixed(0)}%` : ""}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm ring-1 ring-black/5">
            <CardHeader>
              <CardTitle>Quick keyword scan</CardTitle>
              <CardDescription>Short Browse → AE pass. Prefer Research for trend clustering.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="e.g. portable blender" />
                <Button type="button" onClick={runScan} disabled={running}>
                  <Play className="size-4" />
                  {running ? "Scanning…" : "Start scan"}
                </Button>
                <Link href="/research">
                  <Button type="button" variant="outline">
                    <Search className="size-4" />
                    Full research
                  </Button>
                </Link>
              </div>
              {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
              <p className="text-xs text-muted-foreground">
                Last scan: {data?.lastScanTime ? new Date(data.lastScanTime).toLocaleString() : "none"} ·{" "}
                <Badge variant="outline">{data?.lastScanStatus ?? "n/a"}</Badge>
              </p>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card className="shadow-sm ring-1 ring-black/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Watchlist</CardTitle>
              <CardDescription>Approved & awaiting demand proof</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {watchlist.length === 0 ? (
                <div className="overflow-hidden rounded-xl">
                  <Image
                    src="/media/product-packaging.jpg"
                    alt="Product packaging"
                    width={600}
                    height={360}
                    className="h-28 w-full object-cover"
                  />
                  <p className="mt-2 text-xs text-muted-foreground">Approve candidates to pin them here.</p>
                </div>
              ) : (
                watchlist.map((c) => (
                  <Link key={c.id} href={`/candidates/${c.id}`} className="flex gap-3 rounded-lg p-1.5 hover:bg-muted/60">
                    <div className="relative size-12 overflow-hidden rounded-lg bg-muted">
                      {c.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.imageUrl} alt="" className="size-12 object-cover" />
                      ) : (
                        <Image src="/media/product-tech.jpg" alt="" fill className="object-cover" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.productName}</p>
                      <p className="font-mono text-xs text-muted-foreground">{money(c.ebayCurrentPriceMinor)}</p>
                      <Badge variant="outline" className={cn("mt-1 border text-[10px]", statusTone(c.status))}>
                        {c.status === "APPROVED" ? "High value" : "Needs evidence"}
                      </Badge>
                    </div>
                  </Link>
                ))
              )}
              <Link href="/candidates" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                Manage all candidates <ArrowRight className="size-3.5" />
              </Link>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-0 bg-primary text-primary-foreground shadow-lg">
            <CardContent className="space-y-4 py-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-white/15 p-2">
                    <Zap className="size-4" />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold tracking-wider uppercase opacity-80">Auto-research</p>
                    <p className="text-sm font-semibold">Active scouting</p>
                  </div>
                </div>
                <Switch checked={scoutHint} onCheckedChange={setScoutHint} aria-label="Toggle scouting hint" />
              </div>
              <p className="text-sm leading-relaxed text-primary-foreground/90">
                {scoutHint
                  ? "Kick autonomous research to cluster niches, match AliExpress sources, and queue approvals."
                  : "Scouting reminder off — you can still start a run anytime."}
              </p>
              <Link href="/automation">
                <Button type="button" variant="secondary" className="w-full bg-white text-primary hover:bg-white/90">
                  Open automation
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card size="sm" className="shadow-sm ring-1 ring-black/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Platform health</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(data?.dataSourceHealth ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">No provider events yet.</p>
              ) : (
                data!.dataSourceHealth.slice(0, 4).map((h, i) => (
                  <div key={`${h.provider}-${i}`} className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium">{h.provider}</span>
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      {h.status}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
