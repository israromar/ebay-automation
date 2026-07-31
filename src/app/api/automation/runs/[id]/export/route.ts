import { NextResponse } from "next/server";
import { AutonomousResearchOrchestrator } from "@/lib/services/autonomous-research";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const orchestrator = new AutonomousResearchOrchestrator();
  try {
    const run = await orchestrator.export(id);
    return NextResponse.json({ run });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to export run";
    const status = message.includes("cannot export") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
