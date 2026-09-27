"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy, Download, KeyRound, PauseCircle, Puzzle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchJson, relativeTime } from "./format";

export interface ExtensionStatus {
  verifiedToday: number;
  checkedToday: number;
  dailyCap: number;
  pending: number;
  pauseUntil: string | null;
  pauseReason: string | null;
  lastSeenAt: string | null;
  tokens: Array<{ id: string; label: string; createdAt: string; lastSeenAt: string | null }>;
}

const ONLINE_MS = 5 * 60 * 1000;

export function useExtensionStatus() {
  const [status, setStatus] = useState<ExtensionStatus | null>(null);
  const reload = useCallback(async () => {
    try {
      setStatus(await fetchJson<ExtensionStatus>("/api/settings/extension", { silent: true }));
    } catch {
      setStatus(null);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { status, reload };
}

function isOnline(status: ExtensionStatus | null) {
  return Boolean(status?.lastSeenAt && Date.now() - new Date(status.lastSeenAt).getTime() < ONLINE_MS);
}

/** Small status chip for the Hunt page header. */
export function ExtensionChip() {
  const { status } = useExtensionStatus();
  if (!status) return null;
  if (status.tokens.length === 0) {
    return (
      <Link href="/settings#extension" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
        <Puzzle className="size-3.5" aria-hidden /> Get exact sold counts: connect the Chrome extension
      </Link>
    );
  }
  const online = isOnline(status);
  return (
    <Link
      href="/settings#extension"
      title={
        status.pauseUntil
          ? `Paused until ${new Date(status.pauseUntil).toLocaleTimeString()}`
          : `Last seen ${relativeTime(status.lastSeenAt)}`
      }
      className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs hover:bg-muted"
    >
      {status.pauseUntil ? (
        <PauseCircle className="size-3.5 text-amber-600" aria-hidden />
      ) : (
        <span className={`size-2 rounded-full ${online ? "bg-emerald-500" : "bg-muted-foreground/50"}`} aria-hidden />
      )}
      <span>
        Extension {status.pauseUntil ? "paused" : online ? "online" : "offline"} · {status.verifiedToday} verified today · {status.pending}{" "}
        queued
      </span>
    </Link>
  );
}

/** Settings card: download, connect with a token, see activity, revoke. */
export function ExtensionConnectCard() {
  const { status, reload } = useExtensionStatus();
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  /** Fetch the zip through the API so a missing package shows a real message, not a browser "file wasn't available". */
  async function download() {
    setDownloading(true);
    setDownloadError("");
    try {
      const res = await fetch("/api/settings/extension/download", { headers: { "x-pulse-silent": "1" } });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Download failed (${res.status})`);
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "hunter-companion.zip";
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloading(false);
    }
  }

  async function create() {
    setBusy(true);
    setError("");
    try {
      const r = await fetchJson<{ token: string }>("/api/settings/extension", {
        method: "POST",
        body: JSON.stringify({ action: "create", label: "Chrome" }),
      });
      setToken(r.token);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id?: string) {
    setBusy(true);
    try {
      await fetchJson("/api/settings/extension", { method: "POST", body: JSON.stringify({ action: "revoke", id }) });
      setToken(null);
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card id="extension">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Puzzle className="size-4 text-primary" aria-hidden /> Hunter Companion (Chrome extension)
        </CardTitle>
        <CardDescription>
          Reads each tracked listing&apos;s eBay purchase history with your own signed-in eBay session, so candidates get an{" "}
          <strong>exact</strong> 30-day sold count on day one. It also skips AliExpress Bundle Deals pages. It checks about one listing
          every 5 seconds while Chrome is open, up to {status?.dailyCap ?? 300} a day, and pauses by itself if eBay asks you to sign in or
          shows a bot check.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>
            <button
              type="button"
              onClick={() => void download()}
              disabled={downloading}
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline disabled:opacity-60"
            >
              <Download className="size-3.5" aria-hidden /> {downloading ? "Preparing download…" : "Download the extension"}
            </button>{" "}
            and unzip it.
            {downloadError ? <span className="mt-1 block text-destructive">{downloadError}</span> : null}
          </li>
          <li>
            Open <code className="rounded bg-muted px-1">chrome://extensions</code>, turn on <strong>Developer mode</strong>, click{" "}
            <strong>Load unpacked</strong> and pick the <code className="rounded bg-muted px-1">hunter-companion</code> folder.
          </li>
          <li>Create a token below and paste it in the extension&apos;s Options page.</li>
          <li>Stay signed in to eBay in that Chrome profile.</li>
        </ol>

        {token ? (
          <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
            <p className="font-medium">Copy this token now. It won&apos;t be shown again.</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1 font-mono text-xs">{token}</code>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(token);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={create} disabled={busy}>
            <KeyRound className="size-3.5" /> {status?.tokens.length ? "Create another token" : "Create token"}
          </Button>
          {error ? <span className="text-destructive">{error}</span> : null}
        </div>

        {status && status.tokens.length > 0 ? (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">
              Today: {status.verifiedToday} exact counts · {status.checkedToday}/{status.dailyCap} checks · {status.pending} waiting
              {status.pauseUntil
                ? ` · paused until ${new Date(status.pauseUntil).toLocaleTimeString()} (${status.pauseReason === "blocked" ? "eBay bot check" : "eBay sign-in needed"})`
                : ""}
            </p>
            <ul className="space-y-1">
              {status.tokens.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5 text-xs">
                  <span>
                    {t.label} · created {relativeTime(t.createdAt)} · last seen {relativeTime(t.lastSeenAt)}
                  </span>
                  <Button size="xs" variant="ghost" onClick={() => void revoke(t.id)} disabled={busy}>
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
