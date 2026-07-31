import { prisma } from "@/lib/db";

const DEFAULT_MAX_RESEARCH_RUNS_PER_DAY = 20;

export function maxResearchRunsPerDay(): number {
  const raw = Number(process.env.MAX_RESEARCH_RUNS_PER_DAY ?? DEFAULT_MAX_RESEARCH_RUNS_PER_DAY);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_MAX_RESEARCH_RUNS_PER_DAY;
}

/** Soft cap to protect shared eBay Browse quota across invite users. */
export async function assertResearchRunAllowed(workspaceId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const count = await prisma.trendResearchRun.count({
    where: { workspaceId, startedAt: { gte: since } },
  });
  const max = maxResearchRunsPerDay();
  if (count >= max) {
    return {
      ok: false,
      message: `Daily research limit reached (${max} runs / 24h for this workspace). Try again later or raise MAX_RESEARCH_RUNS_PER_DAY.`,
    };
  }
  return { ok: true };
}
