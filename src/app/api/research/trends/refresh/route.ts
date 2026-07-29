import { NextResponse } from "next/server";
import { refreshTrendKeywordsFromCatalog } from "@/lib/services/trend-keywords";

export async function POST() {
  try {
    const library = await refreshTrendKeywordsFromCatalog("US");
    return NextResponse.json(library);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
