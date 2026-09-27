"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, CircleX, Loader2, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fetchJson, relativeTime } from "./format";
import type { Hunt } from "./types";

/** Drives a running hunt: each poll advances the server-side hunt by one bounded step. */
export function useHuntRunner(initial: Hunt | null, onProgress?: (hunt: Hunt) => void) {
  const [hunt, setHunt] = useState<Hunt | null>(initial);
  const [pollError, setPollError] = useState("");
  const cb = useRef(onProgress);
  cb.current = onProgress;

  useEffect(() => setHunt(initial), [initial]);

  const id = hunt?.id;
  const running = hunt?.status === "RUNNING";
  useEffect(() => {
    if (!id || !running) return;
    let stopped = false;
    let failures = 0;
    (async () => {
      while (!stopped) {
        try {
          const { hunt: next } = await fetchJson<{ hunt: Hunt }>(`/api/hunts/${id}`, { silent: true });
          if (stopped) return;
          failures = 0;
          setPollError("");
          setHunt(next);
          cb.current?.(next);
          if (next.status !== "RUNNING") return;
          await new Promise((r) => setTimeout(r, next.error ? 5000 : 400));
        } catch (e) {
          failures += 1;
          setPollError(e instanceof Error ? e.message : String(e));
          if (failures >= 5) return;
          await new Promise((r) => setTimeout(r, 3000 * failures));
        }
      }
    })();
    return () => {
      stopped = true;
    };
  }, [id, running]);

  async function cancel() {
    if (!id) return;
    const { hunt: next } = await fetchJson<{ hunt: Hunt }>(`/api/hunts/${id}/cancel`, { method: "POST" });
    setHunt(next);
    cb.current?.(next);
  }

  return { hunt, pollError, cancel };
}

export function HuntProgress({ hunt, pollError, onCancel }: { hunt: Hunt; pollError?: string; onCancel?: () => void }) {
  const pct = hunt.totalItems ? Math.round((Math.min(hunt.cursor, hunt.totalItems) / hunt.totalItems) * 100) : 0;
  const running = hunt.status === "RUNNING";
  const unit = hunt.kind === "KEYWORDS" ? "keywords" : "rows";
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        {running ? (
          <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
        ) : hunt.status === "COMPLETED" ? (
          <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
        ) : (
          <CircleX className="size-4 text-destructive" aria-hidden />
        )}
        <p className="min-w-0 flex-1 truncate text-sm font-medium">
          {running
            ? "Hunting"
            : hunt.status === "COMPLETED"
              ? "Hunt complete"
              : hunt.status === "CANCELLED"
                ? "Hunt cancelled"
                : "Hunt failed"}{" "}
          · {hunt.label}
        </p>
        {running && onCancel ? (
          <Button size="sm" variant="outline" onClick={onCancel}>
            <Square className="size-3" /> Stop
          </Button>
        ) : null}
      </div>

      <div>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={cn(
              "h-full rounded-full bg-primary transition-[width] duration-500",
              !running && hunt.status !== "COMPLETED" && "bg-muted-foreground",
            )}
            style={{ width: `${running ? Math.max(pct, 4) : 100}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {Math.min(hunt.cursor, hunt.totalItems)} / {hunt.totalItems} {unit} · {hunt.scannedCount.toLocaleString()} eBay listings checked ·{" "}
          {hunt.trackedCount} tracked · {hunt.sourcedCount} with a 4.7★+ source
          {hunt.status === "COMPLETED" ? ` · ${hunt.winnerCount} winners` : ""}
        </p>
      </div>

      {hunt.error || pollError ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{pollError || hunt.error}</p>
      ) : null}

      <ol className="max-h-36 space-y-1 overflow-y-auto border-t border-border pt-2 font-mono text-[11px] text-muted-foreground">
        {[...hunt.log]
          .reverse()
          .slice(0, 8)
          .map((entry, i) => (
            <li key={`${entry.at}-${i}`} className="flex gap-2">
              <span className="shrink-0 tabular-nums opacity-70">{relativeTime(entry.at)}</span>
              <span className="min-w-0">{entry.message}</span>
            </li>
          ))}
      </ol>
    </div>
  );
}
