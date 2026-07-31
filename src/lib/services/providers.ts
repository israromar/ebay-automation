import { prisma } from "@/lib/db";
import { DEFAULT_RULES, type QualificationRules } from "@/lib/domain/types";
import { AliExpressManualImportProvider, sampleAliExpressCatalog } from "@/lib/providers/aliexpress-manual";
import { AliExpressOfficialApiProvider } from "@/lib/providers/aliexpress-official";
import { Dinov2VisualMatchProvider } from "@/lib/providers/dinov2-visual-match";
import { EbayBrowseApiProvider } from "@/lib/providers/ebay-browse";
import type { AliExpressProvider, EbayProvider } from "@/lib/providers/types";
import type { VisualMatchProvider } from "@/lib/providers/visual-match";

export function createAliExpressProvider(): AliExpressProvider {
  const appKey = process.env.ALIEXPRESS_APP_KEY ?? "";
  const appSecret = process.env.ALIEXPRESS_APP_SECRET ?? "";
  if (appKey && appSecret) {
    return new AliExpressOfficialApiProvider({
      appKey,
      appSecret,
      trackingId: process.env.ALIEXPRESS_TRACKING_ID ?? "default",
      appSignature: process.env.ALIEXPRESS_APP_SIGNATURE,
    });
  }
  return new AliExpressManualImportProvider(sampleAliExpressCatalog());
}

export function createEbayProvider(): EbayProvider {
  return new EbayBrowseApiProvider({
    clientId: process.env.EBAY_CLIENT_ID ?? "",
    clientSecret: process.env.EBAY_CLIENT_SECRET ?? "",
  });
}

export function createVisualMatchProvider(): VisualMatchProvider | undefined {
  if (process.env.VISUAL_MATCH_ENABLED === "false") return undefined;
  return new Dinov2VisualMatchProvider();
}

/** Legacy single-workspace helper for workers/tests when auth is disabled. */
export async function ensureDefaultWorkspace() {
  let user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) {
    user = await prisma.user.create({
      data: { email: "operator@local.dev", name: "Local Operator" },
    });
  }
  let workspace = await prisma.workspace.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: {
        name: "Default Workspace",
        userId: user.id,
        settings: { create: {} },
      },
    });
  }
  return workspace;
}

export async function loadWorkspaceRules(workspaceId?: string): Promise<QualificationRules> {
  const id = workspaceId ?? (await ensureDefaultWorkspace()).id;
  const settings = await prisma.workspaceSettings.findUnique({
    where: { workspaceId: id },
  });
  if (!settings) return { ...DEFAULT_RULES };
  return {
    minimumRating: settings.minimumRating,
    preferredRating: settings.preferredRating,
    idealRating: settings.idealRating,
    minimumReviewCount: settings.minimumReviewCount,
    preferredReviewCount: settings.preferredReviewCount,
    minimumOrderCount: settings.minimumOrderCount,
    preferredOrderCount: settings.preferredOrderCount,
    minimumRecentSales: settings.minimumRecentSales,
    minimumMatchConfidence: settings.minimumMatchConfidence,
    minimumNetMarginPercent: settings.minimumNetMarginPercent,
    preferredNetMarginPercent: settings.preferredNetMarginPercent,
    additionalSourcingCostMinor: settings.additionalSourcingCostMinor,
    ebayFeeRate: settings.ebayFeeRate,
    promotedListingRate: settings.promotedListingRate,
    expectedReturnCostMinor: settings.expectedReturnCostMinor,
    expectedRefundCostMinor: settings.expectedRefundCostMinor,
    otherFixedCostsMinor: settings.otherFixedCostsMinor,
    otherPercentageCost: settings.otherPercentageCost,
  };
}
