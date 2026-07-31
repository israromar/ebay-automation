import { NextResponse } from "next/server";
import { isPrismaConnectionError, resetPrismaClient } from "@/lib/db";
import { createEbayProvider } from "@/lib/services/providers";
import { TrendResearchService } from "@/lib/services/trend-research";
import { z } from "zod";

const schema = z.object({
  ideaIds: z.array(z.string().min(1)).min(1).max(40),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const service = new TrendResearchService(createEbayProvider());
  try {
    const result = await service.enrichSoldCounts(parsed.data.ideaIds);
    return NextResponse.json(result);
  } catch (error) {
    if (isPrismaConnectionError(error)) {
      await resetPrismaClient();
      try {
        const result = await service.enrichSoldCounts(parsed.data.ideaIds);
        return NextResponse.json(result);
      } catch (retryError) {
        const message = retryError instanceof Error ? retryError.message : "Database unreachable";
        return NextResponse.json(
          {
            error: "Database connection failed. Check Supabase status / network, then retry Refresh sold counts.",
            detail: message.slice(0, 240),
          },
          { status: 503 },
        );
      }
    }
    const message = error instanceof Error ? error.message : "Unable to enrich sold counts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
