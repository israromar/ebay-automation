import { NextResponse } from "next/server";
import { isNextResponse, requireSessionWorkspace } from "@/lib/auth/session";
import { automationRunInWorkspace } from "@/lib/auth/workspace-access";
import { prisma } from "@/lib/db";
import { AutonomousResearchOrchestrator } from "@/lib/services/autonomous-research";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;

  const { id } = await ctx.params;
  if (!(await automationRunInWorkspace(id, session.workspace.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const orchestrator = new AutonomousResearchOrchestrator();
  // Poll-driven progress: advance one stage per GET while running.
  let run = await orchestrator.getRun(id);
  if (run.status === "PENDING" || run.status === "RUNNING") {
    run = await orchestrator.advance(id);
  }

  const candidateIds = run.decisions.map((decision) => decision.candidateId).filter((value): value is string => Boolean(value));
  const candidates =
    candidateIds.length > 0
      ? await prisma.productCandidate.findMany({
          where: { id: { in: candidateIds }, scan: { project: { workspaceId: session.workspace.id } } },
          include: {
            matches: { orderBy: { createdAt: "desc" }, take: 1 },
            aliexpressProducts: true,
            ebayListings: true,
          },
        })
      : [];
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));

  return NextResponse.json({
    run,
    reviewItems: run.decisions.map((decision) => ({
      decision,
      candidate: decision.candidateId ? (byId.get(decision.candidateId) ?? null) : null,
    })),
  });
}
