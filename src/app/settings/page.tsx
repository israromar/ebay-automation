"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, CircleX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchJson } from "@/components/hunt/format";

interface Settings {
  minSold30d: number;
  minAeRating: number;
  minAeReviews: number;
  minAeOrders: number;
  minMatchConfidence: number;
  minMarginPct: number;
  ebayFeeRate: number;
  aeShippingEstimateMinor: number;
  extraCostMinor: number;
  minEbayPriceMinor: number;
  maxEbayPriceMinor: number;
}

interface Field {
  key: keyof Settings;
  label: string;
  hint: string;
  kind: "int" | "float" | "money" | "percent";
  step?: string;
}

const GROUPS: Array<{ title: string; description: string; fields: Field[] }> = [
  {
    title: "eBay demand",
    description: "Which eBay listings count as winning products.",
    fields: [
      { key: "minSold30d", label: "Minimum sold in last 30 days", hint: "Your target was 20–30.", kind: "int" },
      { key: "minEbayPriceMinor", label: "Minimum eBay price", hint: "Listings cheaper than this are skipped.", kind: "money" },
      { key: "maxEbayPriceMinor", label: "Maximum eBay price", hint: "Listings pricier than this are skipped.", kind: "money" },
    ],
  },
  {
    title: "AliExpress source",
    description: "A source must pass every gate. A missing rating counts as a fail.",
    fields: [
      {
        key: "minAeRating",
        label: "Minimum rating (★ out of 5)",
        hint: "Derived from % positive feedback: 94% = 4.7★.",
        kind: "float",
        step: "0.05",
      },
      { key: "minAeReviews", label: "Minimum reviews", hint: "", kind: "int" },
      { key: "minAeOrders", label: "Minimum orders", hint: "Recent order volume reported by AliExpress.", kind: "int" },
      {
        key: "minMatchConfidence",
        label: "Minimum match confidence (0–100)",
        hint: "How closely the AE title matches the eBay product.",
        kind: "int",
      },
    ],
  },
  {
    title: "Profit",
    description: "Used to compute net profit and margin per source.",
    fields: [
      { key: "minMarginPct", label: "Minimum net margin %", hint: "", kind: "float", step: "0.5" },
      { key: "ebayFeeRate", label: "eBay fee %", hint: "Final value fee + payment processing.", kind: "percent", step: "0.01" },
      {
        key: "aeShippingEstimateMinor",
        label: "AE shipping estimate",
        hint: "The AliExpress API does not return shipping, so this estimate is used.",
        kind: "money",
      },
      { key: "extraCostMinor", label: "Other cost per order", hint: "Packaging, prep, and so on.", kind: "money" },
    ],
  },
];

function toDisplay(field: Field, value: number): string {
  if (field.kind === "money") return (value / 100).toFixed(2);
  if (field.kind === "percent") return String(Math.round(value * 10000) / 100);
  return String(value);
}

function fromDisplay(field: Field, raw: string): number {
  const n = Number(raw);
  if (field.kind === "money") return Math.round(n * 100);
  if (field.kind === "percent") return n / 100;
  if (field.kind === "int") return Math.round(n);
  return n;
}

export default function SettingsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [defaults, setDefaults] = useState<Settings | null>(null);
  const [integrations, setIntegrations] = useState<Record<string, boolean> | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  function fill(s: Settings) {
    const next: Record<string, string> = {};
    for (const g of GROUPS) for (const f of g.fields) next[f.key] = toDisplay(f, s[f.key]);
    setValues(next);
  }

  useEffect(() => {
    void fetchJson<{ settings: Settings; defaults: Settings; integrations: Record<string, boolean> }>("/api/settings").then((r) => {
      fill(r.settings);
      setDefaults(r.defaults);
      setIntegrations(r.integrations);
    });
  }, []);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const body: Partial<Settings> = {};
      for (const g of GROUPS)
        for (const f of g.fields) {
          const n = fromDisplay(f, values[f.key] ?? "");
          if (!Number.isFinite(n)) throw new Error(`${f.label} must be a number`);
          body[f.key] = n;
        }
      const r = await fetchJson<{ settings: Settings }>("/api/settings", { method: "PUT", body: JSON.stringify(body) });
      fill(r.settings);
      setMsg({ ok: true, text: "Saved. New thresholds apply to results and the next hunt." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">These rules decide what counts as a winning product.</p>
      </header>

      {integrations ? (
        <Card>
          <CardHeader>
            <CardTitle>Connections</CardTitle>
            <CardDescription>Set these in your environment (.env locally, or Vercel project settings).</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-3">
            {[
              ["ebay", "eBay Browse API", "EBAY_CLIENT_ID / SECRET"],
              ["aliexpress", "AliExpress Affiliate API", "ALIEXPRESS_APP_KEY / SECRET"],
              ["cron", "Daily tracker cron", "CRON_SECRET"],
            ].map(([key, label, env]) => (
              <div key={key} className="flex items-start gap-2 rounded-lg border border-border p-3">
                {integrations[key!] ? (
                  <CheckCircle2 className="mt-0.5 size-4 text-emerald-600" aria-label="configured" />
                ) : (
                  <CircleX className="mt-0.5 size-4 text-destructive" aria-label="missing" />
                )}
                <div>
                  <p className="font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">{integrations[key!] ? "Configured" : `Missing ${env}`}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {GROUPS.map((g) => (
        <Card key={g.title}>
          <CardHeader>
            <CardTitle>{g.title}</CardTitle>
            <CardDescription>{g.description}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {g.fields.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={f.key}>{f.label}</Label>
                <div className="relative">
                  {f.kind === "money" ? (
                    <span className="absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                  ) : null}
                  <Input
                    id={f.key}
                    type="number"
                    step={f.step ?? (f.kind === "money" ? "0.01" : "1")}
                    value={values[f.key] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    className={f.kind === "money" ? "pl-6" : undefined}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {f.hint}
                  {defaults
                    ? ` Default ${f.kind === "money" ? "$" : ""}${toDisplay(f, defaults[f.key])}${f.kind === "percent" ? "%" : ""}.`
                    : ""}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
        {defaults ? (
          <Button variant="ghost" onClick={() => fill(defaults)}>
            Reset to defaults
          </Button>
        ) : null}
        {msg ? <p className={msg.ok ? "text-sm text-emerald-700" : "text-sm text-destructive"}>{msg.text}</p> : null}
      </div>
    </div>
  );
}
