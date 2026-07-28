import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { DEFAULT_RULES } from "@/lib/domain/types";
import { z } from "zod";

const schema = z.object({
  minimumRating: z.number().optional(),
  preferredRating: z.number().optional(),
  idealRating: z.number().optional(),
  minimumReviewCount: z.number().int().optional(),
  preferredReviewCount: z.number().int().optional(),
  minimumOrderCount: z.number().int().optional(),
  preferredOrderCount: z.number().int().optional(),
  minimumRecentSales: z.number().int().optional(),
  minimumMatchConfidence: z.number().int().optional(),
  minimumNetMarginPercent: z.number().optional(),
  preferredNetMarginPercent: z.number().optional(),
  additionalSourcingCostMinor: z.number().int().optional(),
  ebayFeeRate: z.number().optional(),
  promotedListingRate: z.number().optional(),
  expectedReturnCostMinor: z.number().int().optional(),
  expectedRefundCostMinor: z.number().int().optional(),
  otherFixedCostsMinor: z.number().int().optional(),
  otherPercentageCost: z.number().optional(),
  currency: z.string().optional(),
  ebayMarketplace: z.string().optional(),
  shipToCountry: z.string().optional(),
  scheduleCron: z.string().nullable().optional(),
  autoExportOnApproval: z.boolean().optional(),
  googleSpreadsheetId: z.string().nullable().optional(),
});

async function getOrCreateSettings() {
  let user = await prisma.user.findFirst();
  if (!user) {
    user = await prisma.user.create({
      data: { email: "operator@local.dev", name: "Local Operator" },
    });
  }
  let workspace = await prisma.workspace.findFirst({ where: { userId: user.id } });
  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: { name: "Default Workspace", userId: user.id, settings: { create: {} } },
    });
  }
  let settings = await prisma.workspaceSettings.findUnique({
    where: { workspaceId: workspace.id },
  });
  if (!settings) {
    settings = await prisma.workspaceSettings.create({
      data: { workspaceId: workspace.id },
    });
  }
  return settings;
}

export async function GET() {
  const settings = await getOrCreateSettings();
  return NextResponse.json({ settings, defaults: DEFAULT_RULES });
}

export async function PUT(req: Request) {
  const json = await req.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const current = await getOrCreateSettings();
  const settings = await prisma.workspaceSettings.update({
    where: { id: current.id },
    data: parsed.data,
  });
  return NextResponse.json({ settings });
}
