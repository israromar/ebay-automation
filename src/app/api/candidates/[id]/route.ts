import { NextResponse } from "next/server";
import { isNextResponse, requireSessionWorkspace } from "@/lib/auth/session";
import { candidateInWorkspace } from "@/lib/auth/workspace-access";
import { prisma } from "@/lib/db";
import { createAliExpressProvider, createEbayProvider, createVisualMatchProvider, loadWorkspaceRules } from "@/lib/services/providers";
import { ScanOrchestrator } from "@/lib/services/scan-orchestrator";
import { z } from "zod";

const schema = z.object({
  soldLast30Days: z.number().int().min(0),
  avgCompletedSaleMinor: z.number().int().optional(),
  medianCompletedSaleMinor: z.number().int().optional(),
  evidenceUrl: z.string().url().optional(),
  verifiedBy: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;

  const { id } = await ctx.params;
  if (!(await candidateInWorkspace(id, session.workspace.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const candidate = await prisma.productCandidate.findUnique({
    where: { id },
    include: {
      profitCalculations: { orderBy: { createdAt: "desc" }, take: 1 },
      matches: true,
      rejectionReasons: true,
      manualReviews: { orderBy: { createdAt: "desc" } },
      saleObservations: { orderBy: { observedAt: "desc" } },
      exportRecords: true,
      aliexpressProducts: true,
      ebayListings: true,
      sourceProducts: true,
    },
  });
  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ candidate });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;

  const { id } = await ctx.params;
  if (!(await candidateInWorkspace(id, session.workspace.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const json = await req.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const orchestrator = new ScanOrchestrator({
    aliexpress: createAliExpressProvider(),
    ebay: createEbayProvider(),
    visualMatch: createVisualMatchProvider(),
    rules: await loadWorkspaceRules(session.workspace.id),
    workspaceId: session.workspace.id,
  });
  try {
    const updated = await orchestrator.applyManualDemand(id, parsed.data);
    return NextResponse.json({ candidate: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to apply demand";
    const status = message.includes("no validated AliExpress source") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
