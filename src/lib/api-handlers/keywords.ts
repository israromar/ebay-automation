import { NextResponse } from "next/server";
import { listCatalogNiches, US_TRENDING_KEYWORD_CATALOG } from "@/lib/research/us-trending-keywords";

export async function GET() {
  return NextResponse.json({
    niches: listCatalogNiches(),
    keywords: US_TRENDING_KEYWORD_CATALOG.keywords.map(({ rank, keyword, niche, momentum }) => ({ rank, keyword, niche, momentum })),
    version: US_TRENDING_KEYWORD_CATALOG.version,
  });
}
