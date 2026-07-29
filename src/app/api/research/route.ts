import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { TrendResearchService } from "@/lib/services/trend-research";
import { createEbayProvider } from "@/lib/services/providers";
import { z } from "zod";

const postSchema = z.object({
  keywords: z.array(z.string().min(1)).min(1).max(10),
  searchLimit: z.number().int().min(5).max(50).optional(),
  criteria: z
    .object({
      minEbayPriceMinor: z.number().int().optional(),
      maxEbayPriceMinor: z.number().int().optional(),
      minActiveListings: z.number().int().optional(),
      maxActiveListings: z.number().int().optional(),
      clusterSimilarity: z.number().min(0).max(1).optional(),
      topNPerKeyword: z.number().int().min(1).max(50).optional(),
    })
    .optional(),
});

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const service = new TrendResearchService(createEbayProvider());
  const result = await service.run(parsed.data);
  return NextResponse.json(result);
}

export async function GET() {
  const runs = await prisma.trendResearchRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 20,
    include: { _count: { select: { ideas: true } } },
  });
  return NextResponse.json({ runs });
}
