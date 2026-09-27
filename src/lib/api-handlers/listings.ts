import { NextResponse } from "next/server";
import { isNextResponse, requireSessionWorkspace } from "@/lib/auth/session";
import { listListings, parseListingQuery } from "@/lib/services/listings";
import { loadHuntSettings } from "@/lib/services/providers";

export async function GET(req: Request) {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;
  const settings = await loadHuntSettings(session.workspace.id);
  const query = parseListingQuery(new URL(req.url).searchParams);
  const result = await listListings(session.workspace.id, query, settings);
  return NextResponse.json({ ...result, settings: { minSold30d: settings.minSold30d, minAeRating: settings.minAeRating } });
}
