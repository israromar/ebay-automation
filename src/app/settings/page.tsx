"use client";

import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/settings")
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

  if (!settings) return <p>Loading…</p>;

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

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Settings</h2>
      <p className="text-sm text-slate-600">All qualification and fee thresholds are configurable.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <label key={f.key} className="block text-sm">
            <span className="text-slate-600">{f.label}</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={String(settings[f.key] ?? "")}
              step={f.step}
              onChange={(e) => {
                const raw = e.target.value;
                const numeric = ["currency", "ebayMarketplace", "shipToCountry", "scheduleCron", "googleSpreadsheetId"].includes(
                  f.key,
                )
                  ? raw
                  : Number(raw);
                setSettings({ ...settings, [f.key]: numeric });
              }}
            />
          </label>
        ))}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(settings.autoExportOnApproval)}
            onChange={(e) => setSettings({ ...settings, autoExportOnApproval: e.target.checked })}
          />
          Auto-export on approval
        </label>
      </div>
      <button
        type="button"
        onClick={save}
        className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white"
      >
        Save settings
      </button>
      {msg ? <p className="text-sm text-teal-800">{msg}</p> : null}
    </div>
  );
}
