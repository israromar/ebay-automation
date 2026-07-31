import { NextResponse } from "next/server";
import { isNextResponse, requireSessionWorkspace } from "@/lib/auth/session";
import { automationRunInWorkspace } from "@/lib/auth/workspace-access";
import { AutonomousResearchOrchestrator } from "@/lib/services/autonomous-research";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;

  const { id } = await ctx.params;
  if (!(await automationRunInWorkspace(id, session.workspace.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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
