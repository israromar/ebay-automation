import { NextResponse } from "next/server";
import { isNextResponse, requireSessionWorkspace } from "@/lib/auth/session";
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

export async function GET() {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;

  let settings = await prisma.workspaceSettings.findUnique({
    where: { workspaceId: session.workspace.id },
  });
  if (!settings) {
    settings = await prisma.workspaceSettings.create({
      data: { workspaceId: session.workspace.id },
    });
  }
  return NextResponse.json({ settings, defaults: DEFAULT_RULES });
}

export async function PUT(req: Request) {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;

  const json = await req.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let current = await prisma.workspaceSettings.findUnique({
    where: { workspaceId: session.workspace.id },
  });
  if (!current) {
    current = await prisma.workspaceSettings.create({
      data: { workspaceId: session.workspace.id },
    });
  }

  const settings = await prisma.workspaceSettings.update({
    where: { id: current.id },
    data: parsed.data,
  });
  return NextResponse.json({ settings });
}
