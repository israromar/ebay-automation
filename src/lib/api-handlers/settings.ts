import { NextResponse } from "next/server";
import { z } from "zod";
import { isNextResponse, requireSessionWorkspace } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { DEFAULT_HUNT_SETTINGS, integrationStatus, loadHuntSettings } from "@/lib/services/providers";

const schema = z
  .object({
    minSold30d: z.number().int().min(1).max(10_000),
    minAeRating: z.number().min(0).max(5),
    minAeReviews: z.number().int().min(0),
    minAeOrders: z.number().int().min(0),
    minMatchConfidence: z.number().int().min(0).max(100),
    minMarginPct: z.number().min(-100).max(100),
    ebayFeeRate: z.number().min(0).max(0.5),
    aeShippingEstimateMinor: z.number().int().min(0),
    extraCostMinor: z.number().int().min(0),
    minEbayPriceMinor: z.number().int().min(0),
    maxEbayPriceMinor: z.number().int().min(100),
  })
  .partial()
  .refine((v) => v.minEbayPriceMinor == null || v.maxEbayPriceMinor == null || v.minEbayPriceMinor < v.maxEbayPriceMinor, {
    message: "Minimum eBay price must be below the maximum",
  });

export async function GET() {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;
  const settings = await loadHuntSettings(session.workspace.id);
  return NextResponse.json({ settings, defaults: DEFAULT_HUNT_SETTINGS, integrations: integrationStatus() });
}

export async function PUT(req: Request) {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid settings" }, { status: 400 });
  }
  await prisma.huntSettings.upsert({
    where: { workspaceId: session.workspace.id },
    create: { workspaceId: session.workspace.id, ...parsed.data },
    update: parsed.data,
  });
  return NextResponse.json({ settings: await loadHuntSettings(session.workspace.id) });
}
