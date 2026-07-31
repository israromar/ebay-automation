import { NextResponse } from "next/server";
import { isNextResponse, requireSessionWorkspace } from "@/lib/auth/session";
import { getLatestTrendKeywords } from "@/lib/services/trend-keywords";

export async function GET() {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;

  try {
    const library = await getLatestTrendKeywords("US");
    return NextResponse.json(library);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
