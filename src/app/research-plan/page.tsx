import { AlertTriangle, CheckCircle2, CircleDashed, Database, Puzzle, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const rules = [
  ["eBay price", "£50 minimum"],
  ["Verified demand", "3 sellers × 20 units in rolling 30 days"],
  ["Supplier orders", "500+ on the matched listing"],
  ["Supplier reputation", "4.5/5 minimum; metric scale retained"],
  ["Target margin", "20% after fees, shipping and allowances"],
  ["Category", "Beauty excluded; automotive receives priority"],
];

const stages = [
  {
    title: "Marketplace connectors",
    status: "Live",
    icon: Database,
    detail: "eBay Browse and AliExpress Affiliate adapters use server-side credentials.",
  },
  {
    title: "Listing verification",
    status: "Live",
    icon: Puzzle,
    detail: "The companion extension verifies exact listing purchase history with visible provenance.",
  },
  {
    title: "Supplier matching",
    status: "Live",
    icon: ShieldCheck,
    detail: "Pack, accessory, context, price and image signals gate AliExpress candidates.",
  },
  {
    title: "Three-seller aggregation",
    status: "Next",
    icon: CircleDashed,
    detail: "Candidates are not fully qualified until three distinct equivalent sellers pass the 30-day threshold.",
  },
];

export default function ResearchPlanPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="max-w-3xl">
        <Badge variant="outline">Evidence standard</Badge>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">One research model for dashboard and extension</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          The dashboard owns provider access, persistence and qualification. The extension contributes page context and user-authorized
          evidence. Missing evidence stays unverified; active listings and lifetime totals never become confirmed sales by assumption.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {stages.map(({ title, status, icon: Icon, detail }) => (
          <Card key={title}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2"><Icon className="size-4 text-primary" />{title}</CardTitle>
                <Badge variant={status === "Live" ? "default" : "secondary"}>{status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{detail}</CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Qualification defaults</CardTitle>
          <CardDescription>Central defaults are editable in Settings, but missing evidence never passes a gate.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rules.map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border p-3">
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              <p className="mt-1 text-sm font-semibold">{value}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-medium">Candidate is not the same as qualified</p>
          <p className="mt-1 text-amber-900/80">
            Current hunts validate demand per listing. The next domain milestone groups equivalent listings by distinct seller before the
            dashboard may display a fully qualified status.
          </p>
        </div>
      </div>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <CheckCircle2 className="size-3.5 text-emerald-600" /> Detailed architecture and provider limitations are maintained in
        <code>docs/product-research/</code>.
      </p>
    </div>
  );
}
