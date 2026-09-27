"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { FileUp, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fetchJson, money } from "@/components/hunt/format";
import { HuntProgress, useHuntRunner } from "@/components/hunt/hunt-progress";
import type { Hunt } from "@/components/hunt/types";

interface ParsedRow {
  line: number;
  title: string;
  itemId: string | null;
  totalSold: number;
  sold30d: number;
  avgSoldPriceMinor: number | null;
}

interface ParseResult {
  rows: ParsedRow[];
  errors: Array<{ line: number; message: string }>;
  columns: Record<string, string>;
  hunt?: Hunt;
}

const RANGE_OPTIONS = [7, 30, 90, 180, 365];

export default function ImportPage() {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [rangeDays, setRangeDays] = useState(30);
  const [preview, setPreview] = useState<ParseResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [hunt, setHunt] = useState<Hunt | null>(null);
  const runner = useHuntRunner(hunt);

  const runPreview = useCallback(async (nextText: string, nextRange: number) => {
    setError("");
    if (!nextText.trim()) {
      setPreview(null);
      return;
    }
    try {
      setPreview(
        await fetchJson<ParseResult>("/api/terapeak/import", {
          method: "POST",
          body: JSON.stringify({ text: nextText, rangeDays: nextRange, preview: true }),
          silent: true,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  async function onFile(file: File | undefined) {
    if (!file) return;
    const content = await file.text();
    setFileName(file.name);
    setText(content);
    await runPreview(content, rangeDays);
  }

  async function runImport() {
    setBusy(true);
    setError("");
    try {
      const result = await fetchJson<ParseResult>("/api/terapeak/import", {
        method: "POST",
        body: JSON.stringify({ text, rangeDays, label: fileName ? `Terapeak · ${fileName}` : undefined }),
      });
      setPreview(result);
      if (result.hunt) setHunt(result.hunt);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Import Terapeak sold data</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Terapeak (free in eBay Seller Hub) shows real sold counts. Imported rows count as <strong>verified demand</strong> straight away.
          The app links each row to a live eBay listing, keeps tracking it daily, and finds 4.7★+ AliExpress sources.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>How to get the data</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>
              Open{" "}
              <a href="https://www.ebay.com/sh/research" target="_blank" rel="noreferrer" className="text-primary hover:underline">
                Seller Hub → Research → Product research
              </a>{" "}
              and search a product or niche.
            </li>
            <li>
              Open the <strong>Sold</strong> tab and set the date range to <strong>Last 30 days</strong> (or pick the matching range below).
            </li>
            <li>Select the results table and copy it (or download it), then paste it here or drop the file.</li>
            <li>
              Required columns: <code>Total sold</code> plus <code>Listing</code>/<code>Title</code>, an <code>Item ID</code> or a listing
              URL. <code>Avg sold price</code> is used when present.
            </li>
          </ol>
        </CardContent>
      </Card>

      {hunt && runner.hunt ? (
        <div className="space-y-2">
          <HuntProgress hunt={runner.hunt} pollError={runner.pollError} onCancel={() => void runner.cancel()} />
          {runner.hunt.status !== "RUNNING" ? (
            <Link href={`/?huntId=${runner.hunt.id}&view=all`} className="text-sm font-medium text-primary hover:underline">
              View imported products →
            </Link>
          ) : null}
        </div>
      ) : null}

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border px-4 py-3 text-sm hover:bg-muted">
              <FileUp className="size-4 text-primary" aria-hidden />
              <span className="min-w-0 truncate">{fileName || "Choose a CSV / TSV export"}</span>
              <Input
                type="file"
                accept=".csv,.tsv,.txt,text/csv,text/plain"
                className="hidden"
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
            </label>
            <div className="space-y-1.5">
              <Label htmlFor="range">Terapeak date range</Label>
              <select
                id="range"
                value={rangeDays}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setRangeDays(next);
                  void runPreview(text, next);
                }}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
              >
                {RANGE_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    Last {d} days{d !== 30 ? " (scaled to 30)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setFileName("");
            }}
            onBlur={() => void runPreview(text, rangeDays)}
            placeholder={
              "…or paste the copied table here\nListing\tAvg sold price\tTotal sold\nResistance Bands Set 11 Piece\t$24.99\t1,245"
            }
            rows={8}
            className="font-mono text-xs"
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={() => void runPreview(text, rangeDays)} disabled={!text.trim()}>
              Preview
            </Button>
            <Button onClick={runImport} disabled={busy || !preview?.rows.length || runner.hunt?.status === "RUNNING"}>
              <Upload className="size-3.5" /> {busy ? "Importing…" : `Import ${preview?.rows.length ?? 0} rows`}
            </Button>
            {preview ? (
              <p className="text-xs text-muted-foreground">
                {preview.rows.length} valid · {preview.errors.length} issue(s)
                {Object.keys(preview.columns).length
                  ? ` · columns: ${Object.entries(preview.columns)
                      .map(([k, v]) => `${k}=“${v}”`)
                      .join(", ")}`
                  : ""}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {preview && (preview.rows.length > 0 || preview.errors.length > 0) ? (
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>First 25 rows. Sold / 30d is Total sold scaled to a 30-day window.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {preview.errors.length ? (
              <ul className="space-y-0.5 rounded-md bg-amber-50 p-3 text-xs text-amber-900">
                {preview.errors.slice(0, 10).map((e, i) => (
                  <li key={i}>
                    {e.line ? `Line ${e.line}: ` : ""}
                    {e.message}
                  </li>
                ))}
                {preview.errors.length > 10 ? <li>…and {preview.errors.length - 10} more</li> : null}
              </ul>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-1.5 font-medium">Title</th>
                    <th className="py-1.5 font-medium">Item ID</th>
                    <th className="py-1.5 text-right font-medium">Total sold</th>
                    <th className="py-1.5 text-right font-medium">Sold / 30d</th>
                    <th className="py-1.5 text-right font-medium">Avg price</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {preview.rows.slice(0, 25).map((r) => (
                    <tr key={r.line} className="border-t border-border">
                      <td className="max-w-[420px] truncate py-1.5 pr-3">{r.title}</td>
                      <td className="py-1.5 text-xs text-muted-foreground">{r.itemId ?? "match by title"}</td>
                      <td className="py-1.5 text-right">{r.totalSold.toLocaleString()}</td>
                      <td className="py-1.5 text-right font-medium">{r.sold30d.toLocaleString()}</td>
                      <td className="py-1.5 text-right">{money(r.avgSoldPriceMinor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
