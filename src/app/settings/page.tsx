"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    void fetch("/api/settings")
      .then((r) => r.json())
      .then((j) => setSettings(j.settings));
  }, []);

  async function save() {
    if (!settings) return;
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    const json = await res.json();
    setSettings(json.settings);
    setMsg("Saved");
  }

  if (!settings) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const fields: Array<{ key: string; label: string; step?: string }> = [
    { key: "minimumRating", label: "Minimum rating", step: "0.1" },
    { key: "minimumReviewCount", label: "Minimum reviews" },
    { key: "minimumOrderCount", label: "Minimum orders" },
    { key: "minimumRecentSales", label: "Minimum sold last 30 days" },
    { key: "minimumMatchConfidence", label: "Minimum match confidence" },
    { key: "minimumNetMarginPercent", label: "Minimum net margin %" },
    { key: "preferredNetMarginPercent", label: "Preferred net margin %" },
    { key: "additionalSourcingCostMinor", label: "Additional sourcing cost (minor units)" },
    { key: "ebayFeeRate", label: "eBay fee rate", step: "0.0001" },
    { key: "promotedListingRate", label: "Promoted listing rate", step: "0.0001" },
    { key: "currency", label: "Currency" },
    { key: "ebayMarketplace", label: "eBay marketplace" },
    { key: "shipToCountry", label: "Ship-to country" },
    { key: "scheduleCron", label: "Schedule cron (daily|weekly|expr)" },
    { key: "googleSpreadsheetId", label: "Google spreadsheet ID" },
  ];

  const stringKeys = new Set(["currency", "ebayMarketplace", "shipToCountry", "scheduleCron", "googleSpreadsheetId"]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Workspace qualification and fee thresholds. API keys stay in server env (shared platform keys).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Qualification rules</CardTitle>
          <CardDescription>Applied to AE matching and profit gates for this workspace.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={f.key}>{f.label}</Label>
                <Input
                  id={f.key}
                  value={String(settings[f.key] ?? "")}
                  step={f.step}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const numeric = stringKeys.has(f.key) ? raw : Number(raw);
                    setSettings({ ...settings, [f.key]: numeric });
                  }}
                />
              </div>
            ))}
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                className="size-4 rounded border-input"
                checked={Boolean(settings.autoExportOnApproval)}
                onChange={(e) => setSettings({ ...settings, autoExportOnApproval: e.target.checked })}
              />
              Auto-export on approval
            </label>
          </div>
          <div className="flex items-center gap-3">
            <Button type="button" onClick={save}>
              Save settings
            </Button>
            {msg ? <span className="text-sm text-success">{msg}</span> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Platform connections</CardTitle>
          <CardDescription>
            v1 uses shared env credentials — no per-user key paste. Configure on the server / Vercel.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {[
            ["eBay Browse", "EBAY_CLIENT_ID / SECRET"],
            ["AliExpress Affiliate", "ALIEXPRESS_APP_KEY / SECRET"],
            ["Google Sheets export", "GOOGLE_SERVICE_ACCOUNT_JSON"],
            ["Purchase-history fetch", "EBAY_PURCHASE_HISTORY_*"],
          ].map(([name, env]) => (
            <div key={name} className="rounded-lg border border-border bg-muted/40 px-3 py-2">
              <p className="text-sm font-medium">{name}</p>
              <p className="font-mono text-[11px] text-muted-foreground">{env}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
