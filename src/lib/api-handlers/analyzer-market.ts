import { NextResponse } from "next/server";
import { isNextResponse, requireSessionWorkspace } from "@/lib/auth/session";
import { getAnalyzerMarket } from "@/lib/services/analyzer";

export async function GET() {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;

  try {
    const market = await getAnalyzerMarket(session.workspace.id);
    return NextResponse.json(market);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
