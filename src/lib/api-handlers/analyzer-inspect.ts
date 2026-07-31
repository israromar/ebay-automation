import { NextResponse } from "next/server";
import { isNextResponse, requireSessionWorkspace } from "@/lib/auth/session";
import { getAnalyzerMarket, inspectBodySchema, inspectMarketItem } from "@/lib/services/analyzer";

export async function POST(req: Request) {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;

  const json = await req.json().catch(() => ({}));
  const parsed = inspectBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const analysis = await inspectMarketItem({
      workspaceId: session.workspace.id,
      query: parsed.data.query,
      ideaId: parsed.data.ideaId,
      candidateId: parsed.data.candidateId,
    });
    return NextResponse.json({ analysis });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
