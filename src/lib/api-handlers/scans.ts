import { NextResponse } from "next/server";
import { isNextResponse, requireSessionWorkspace } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { ScanOrchestrator } from "@/lib/services/scan-orchestrator";
import { createAliExpressProvider, createEbayProvider, createVisualMatchProvider, loadWorkspaceRules } from "@/lib/services/providers";
import { z } from "zod";

const bodySchema = z.object({
  keyword: z.string().min(1),
  limit: z.number().int().min(1).max(5).optional(),
  aliexpressUrl: z.string().url().optional(),
  ebayItemId: z.string().optional(),
  ebayUrl: z.string().url().optional(),
  mode: z.enum(["keyword", "aliexpress_url", "ebay_url", "batch"]).optional(),
});

export async function POST(req: Request) {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;

  const json = await req.json();
  const parsed = bodySchema.safeParse(json);
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
  const result = await orchestrator.run(parsed.data);
  return NextResponse.json(result);
}

export async function GET() {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;

  const scans = await prisma.scan.findMany({
    where: { project: { workspaceId: session.workspace.id } },
    orderBy: { startedAt: "desc" },
    take: 20,
    include: { _count: { select: { candidates: true } } },
  });
  return NextResponse.json({ scans });
}
