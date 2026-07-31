"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Eye, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

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
  searchKeyword?: string | null;
}

function money(minor: number | null) {
  if (minor == null) return "—";
  return `$${(minor / 100).toFixed(2)}`;
}

function statusTone(status: string) {
  if (status === "APPROVED" || status === "EXPORTED") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (status === "NEEDS_MANUAL_VALIDATION") return "bg-amber-50 text-amber-900 border-amber-200";
  if (status.includes("REJECT") || status === "UNPROFITABLE") return "bg-red-50 text-red-800 border-red-200";
  return "bg-muted text-muted-foreground border-border";
}

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function load(nextStatus = status) {
    setBusy(true);
    try {
      const q = nextStatus ? `?status=${encodeURIComponent(nextStatus)}` : "";
      const res = await fetch(`/api/candidates${q}`);
      const json = await res.json();
      setCandidates(json.candidates ?? []);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Research / Candidates</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Discovered products</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            eBay ↔ AliExpress matches ready for review. Open a row for side-by-side match confidence and demand proof.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-8 rounded-lg border border-input bg-card px-3 text-sm"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              void load(e.target.value);
            }}
          >
            <option value="">All statuses</option>
            <option value="NEEDS_MANUAL_VALIDATION">Needs manual validation</option>
            <option value="APPROVED">Approved</option>
            <option value="ALIEXPRESS_REJECTED">AliExpress rejected</option>
            <option value="UNPROFITABLE">Unprofitable</option>
            <option value="EXPORTED">Exported</option>
          </select>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void load()}>
            <RefreshCw className={cn("size-3.5", busy && "animate-spin")} />
            Refresh
          </Button>
          <Link href="/research">
            <Button type="button" size="sm">
              Run research
            </Button>
          </Link>
        </div>
      </div>

      <Card className="overflow-hidden py-0 shadow-sm ring-1 ring-black/5">
        <CardHeader className="border-b border-border/70 py-3">
          <CardTitle className="text-sm">Product pipeline</CardTitle>
          <CardDescription>
            Showing {candidates.length} candidate{candidates.length === 1 ? "" : "s"}
            {status ? ` · filtered by ${status}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {candidates.length === 0 ? (
            <div className="relative mx-4 my-4 overflow-hidden rounded-xl">
              <Image
                src="/media/overview-empty.jpg"
                alt="Empty candidates workspace"
                width={1200}
                height={480}
                className="h-48 w-full object-cover"
              />
              <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/75 to-transparent p-5 text-white">
                <p className="font-medium">No candidates yet</p>
                <p className="mt-1 max-w-md text-xs text-white/80">
                  Run Research to cluster eBay demand, then find AliExpress matches — results land here for approve / reject.
                </p>
                <Link href="/research" className="mt-3 inline-flex w-fit text-sm font-medium text-blue-200 hover:underline">
                  Open Research →
                </Link>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>AE rating / orders</TableHead>
                  <TableHead>Source / adj</TableHead>
                  <TableHead>eBay</TableHead>
                  <TableHead>Sold 30d</TableHead>
                  <TableHead>Profit</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link href={`/candidates/${c.id}`} className="flex items-center gap-3">
                        <div className="relative size-10 shrink-0 overflow-hidden rounded-md bg-muted">
                          {c.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={c.imageUrl} alt="" className="size-10 object-cover" />
                          ) : (
                            <Image src="/media/product-tech.jpg" alt="" fill className="object-cover opacity-80" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground hover:text-primary">{c.productName}</p>
                          <p className="font-mono text-[10px] text-muted-foreground">ID: {c.id.slice(0, 8)}</p>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("border text-[10px] font-medium", statusTone(c.status))}>
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs tabular-nums">
                      {c.rating ?? "—"} · {c.orderCount ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs tabular-nums">
                      {money(c.aliexpressPriceMinor)} / {money(c.adjustedSourceCostMinor)}
                    </TableCell>
                    <TableCell className="font-mono text-xs tabular-nums">{money(c.ebayCurrentPriceMinor)}</TableCell>
                    <TableCell className="font-mono text-xs tabular-nums">{c.soldLast30Days ?? "—"}</TableCell>
                    <TableCell
                      className={cn(
                        "font-mono text-xs tabular-nums",
                        (c.estimatedProfitMinor ?? 0) >= 0 ? "text-emerald-700" : "text-red-700",
                      )}
                    >
                      {money(c.estimatedProfitMinor)}
                      {c.netMarginPercent != null ? ` · ${c.netMarginPercent.toFixed(0)}%` : ""}
                    </TableCell>
                    <TableCell className="font-mono text-xs tabular-nums text-primary">{c.matchConfidence ?? "—"}</TableCell>
                    <TableCell>
                      <Link href={`/candidates/${c.id}`} title="Review match">
                        <Button type="button" variant="ghost" size="icon-sm">
                          <Eye className="size-3.5 text-primary" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
