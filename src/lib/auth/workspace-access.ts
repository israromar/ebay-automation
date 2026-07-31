import { prisma } from "@/lib/db";

export async function candidateInWorkspace(candidateId: string, workspaceId: string) {
  const count = await prisma.productCandidate.count({
    where: { id: candidateId, scan: { project: { workspaceId } } },
  });
  return count > 0;
}

export async function automationRunInWorkspace(runId: string, workspaceId: string) {
  const count = await prisma.automationRun.count({
    where: { id: runId, workspaceId },
  });
  return count > 0;
}

export async function trendIdeaInWorkspace(ideaId: string, workspaceId: string) {
  const count = await prisma.trendIdea.count({
    where: { id: ideaId, run: { workspaceId } },
  });
  return count > 0;
}
