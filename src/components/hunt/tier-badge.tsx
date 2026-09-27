import { BadgeCheck, Eye, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DemandTier } from "./types";

const TIER: Record<DemandTier, { label: string; className: string; icon: typeof BadgeCheck; hint: string }> = {
  VERIFIED: {
    label: "Verified",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    icon: BadgeCheck,
    hint: "30+ days of daily snapshots, a listing younger than 30 days, or a Terapeak import",
  },
  PROJECTED: {
    label: "Projected",
    className: "border-sky-200 bg-sky-50 text-sky-800",
    icon: TrendingUp,
    hint: "Measured from 3+ days of daily sold snapshots, scaled to 30 days",
  },
  ESTIMATED: {
    label: "Estimated",
    className: "border-amber-200 bg-amber-50 text-amber-900",
    icon: Eye,
    hint: "Lifetime sold ÷ listing age — a day-0 guess, confirmed after 3 days of tracking",
  },
};

export function TierBadge({ tier, source, className }: { tier: DemandTier; source?: string; className?: string }) {
  const t = TIER[tier] ?? TIER.ESTIMATED;
  const Icon = t.icon;
  const hint = source === "terapeak" ? "Imported from Terapeak (Seller Hub sold data)" : t.hint;
  return (
    <span
      title={hint}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        t.className,
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {source === "terapeak" ? "Terapeak" : t.label}
    </span>
  );
}

export function tierExplanation(tier: DemandTier, basis?: string) {
  if (basis === "terapeak") return "Imported from Terapeak (Seller Hub sold data), scaled to 30 days.";
  if (basis === "young_listing") return "Listing is younger than 30 days, so every lifetime sale happened in the last 30 days.";
  if (basis === "snapshot_30d") return "Difference between daily snapshots 30 days apart.";
  if (basis === "snapshot_delta") return "Sales between the first and latest snapshot, scaled to 30 days.";
  if (basis === "lifetime_average") return "Lifetime sold divided by listing age. Tracked daily until measured.";
  return TIER[tier]?.hint ?? "";
}
