import { NextResponse } from "next/server";
import { isNextResponse, requireSessionWorkspace } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const runId = searchParams.get("runId") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const take = Math.min(Number(searchParams.get("limit") ?? 100), 200);

  if (runId) {
    const run = await prisma.trendResearchRun.findFirst({
      where: { id: runId, workspaceId: session.workspace.id },
    });
    if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const ideas = await prisma.trendIdea.findMany({
    where: {
      run: { workspaceId: session.workspace.id },
      ...(runId ? { runId } : {}),
      ...(status ? { status } : {}),
    },
    include: {
      productCandidate: {
        select: {
          matchConfidence: true,
          soldLast30Days: true,
          demandVerified: true,
          aliexpressProducts: {
            select: { title: true, imageUrl: true },
            orderBy: { collectedAt: "desc" },
            take: 1,
          },
          matches: {
            select: { reasonsJson: true },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      },
    },
    orderBy: [{ score: "desc" }, { createdAt: "desc" }],
    take,
  });

  const enrichedIdeas = ideas.map(({ productCandidate, ...idea }) => {
    const reasonsJson = productCandidate?.matches[0]?.reasonsJson;
    let visualScore: number | null = null;
    let visualAvailable = false;

    if (reasonsJson) {
      try {
        const reasons = JSON.parse(reasonsJson) as {
          visualScore?: unknown;
          visualAvailable?: unknown;
        };
        visualScore = typeof reasons.visualScore === "number" ? reasons.visualScore : null;
        visualAvailable = reasons.visualAvailable === true;
      } catch {
        // Older or malformed match metadata should not break the research table.
      }
    }

    const soldLast30Days =
      typeof idea.soldLast30Days === "number"
        ? idea.soldLast30Days
        : typeof productCandidate?.soldLast30Days === "number"
          ? productCandidate.soldLast30Days
          : null;

    return {
      ...idea,
      soldLast30Days,
      soldCountSource: idea.soldCountSource ?? null,
      demandVerified: productCandidate?.demandVerified ?? false,
      aeMatch: productCandidate
        ? {
            title: productCandidate.aliexpressProducts[0]?.title ?? null,
            imageUrl: productCandidate.aliexpressProducts[0]?.imageUrl ?? null,
            confidence: productCandidate.matchConfidence,
            visualScore,
            visualAvailable,
          }
        : null,
    };
  });

  return NextResponse.json({ ideas: enrichedIdeas });
}
