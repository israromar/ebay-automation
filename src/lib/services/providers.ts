import { prisma } from "@/lib/db";
import { DEFAULT_SOURCING_RULES } from "@/lib/domain/sourcing";
import { AliExpressOfficialApiProvider } from "@/lib/providers/aliexpress-official";
import { EbayBrowseApiProvider } from "@/lib/providers/ebay-browse";
import type { AliExpressProvider } from "@/lib/providers/types";

export class ConfigError extends Error {
  override name = "ConfigError";
}

export function createAliExpressProvider(): AliExpressProvider {
  const appKey = process.env.ALIEXPRESS_APP_KEY ?? "";
  const appSecret = process.env.ALIEXPRESS_APP_SECRET ?? "";
  if (!appKey || !appSecret) {
    throw new ConfigError("AliExpress API keys missing: set ALIEXPRESS_APP_KEY, ALIEXPRESS_APP_SECRET and ALIEXPRESS_TRACKING_ID.");
  }
  return new AliExpressOfficialApiProvider({
    appKey,
    appSecret,
    trackingId: process.env.ALIEXPRESS_TRACKING_ID ?? "default",
    appSignature: process.env.ALIEXPRESS_APP_SIGNATURE,
  });
}

export function createEbayProvider(): EbayBrowseApiProvider {
  const provider = new EbayBrowseApiProvider({
    clientId: process.env.EBAY_CLIENT_ID ?? "",
    clientSecret: process.env.EBAY_CLIENT_SECRET ?? "",
  });
  if (!provider.configured) {
    throw new ConfigError("eBay API keys missing: set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET.");
  }
  return provider;
}

export function integrationStatus() {
  return {
    ebay: Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET),
    aliexpress: Boolean(process.env.ALIEXPRESS_APP_KEY && process.env.ALIEXPRESS_APP_SECRET),
    cron: Boolean(process.env.CRON_SECRET),
  };
}

/** Single-workspace helper used when AUTH_DISABLED=true and by the CLI snapshot script. */
export async function ensureDefaultWorkspace() {
  let user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) {
    user = await prisma.user.create({ data: { email: "operator@local.dev", name: "Local Operator" } });
  }
  let workspace = await prisma.workspace.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: { name: "Default Workspace", userId: user.id, settings: { create: {} } },
    });
  }
  return workspace;
}

export type HuntSettingsValues = {
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
};

export const DEFAULT_HUNT_SETTINGS: HuntSettingsValues = {
  minSold30d: 20,
  ...DEFAULT_SOURCING_RULES,
  minEbayPriceMinor: 800,
  maxEbayPriceMinor: 15000,
};

export async function loadHuntSettings(workspaceId: string): Promise<HuntSettingsValues> {
  const row = await prisma.huntSettings.upsert({
    where: { workspaceId },
    create: { workspaceId },
    update: {},
  });
  return {
    minSold30d: row.minSold30d,
    minAeRating: row.minAeRating,
    minAeReviews: row.minAeReviews,
    minAeOrders: row.minAeOrders,
    minMatchConfidence: row.minMatchConfidence,
    minMarginPct: row.minMarginPct,
    ebayFeeRate: row.ebayFeeRate,
    aeShippingEstimateMinor: row.aeShippingEstimateMinor,
    extraCostMinor: row.extraCostMinor,
    minEbayPriceMinor: row.minEbayPriceMinor,
    maxEbayPriceMinor: row.maxEbayPriceMinor,
  };
}
