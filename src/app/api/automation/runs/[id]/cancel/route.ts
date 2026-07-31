import { NextResponse } from "next/server";
import { AutonomousResearchOrchestrator } from "@/lib/services/autonomous-research";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const orchestrator = new AutonomousResearchOrchestrator();
  const run = await orchestrator.cancel(id);
  return NextResponse.json({ run });
}
