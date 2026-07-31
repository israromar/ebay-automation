import { NextResponse } from "next/server";
import { isNextResponse, requireSessionWorkspace } from "@/lib/auth/session";
import { createEbayProvider } from "@/lib/services/providers";
import { TrendResearchService } from "@/lib/services/trend-research";
import { prisma } from "@/lib/db";
import { z } from "zod";

const schema = z.object({
  ideaIds: z.array(z.string().min(1)).min(1).max(40),
});

export async function POST(req: Request) {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;

  const json = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const owned = await prisma.trendIdea.count({
    where: {
      id: { in: parsed.data.ideaIds },
      run: { workspaceId: session.workspace.id },
    },
  });
  if (owned !== parsed.data.ideaIds.length) {
    return NextResponse.json({ error: "One or more ideas are not in your workspace" }, { status: 403 });
  }

  const service = new TrendResearchService(createEbayProvider());
  const result = await service.enrichSoldCounts(parsed.data.ideaIds);
  return NextResponse.json(result);
}
