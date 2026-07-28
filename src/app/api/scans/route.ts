import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  AliExpressManualImportProvider,
  sampleAliExpressCatalog,
} from "@/lib/providers/aliexpress-manual";
import { EbayBrowseApiProvider } from "@/lib/providers/ebay-browse";
import { ScanOrchestrator } from "@/lib/services/scan-orchestrator";
import { z } from "zod";

const bodySchema = z.object({
  keyword: z.string().min(1),
  limit: z.number().int().min(1).max(5).optional(),
  aliexpressUrl: z.string().url().optional(),
  mode: z.enum(["keyword", "aliexpress_url", "ebay_url", "batch"]).optional(),
});

function createOrchestrator() {
  return new ScanOrchestrator({
    aliexpress: new AliExpressManualImportProvider(sampleAliExpressCatalog()),
    ebay: new EbayBrowseApiProvider({
      clientId: process.env.EBAY_CLIENT_ID ?? "",
      clientSecret: process.env.EBAY_CLIENT_SECRET ?? "",
    }),
  });
}

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const orchestrator = createOrchestrator();
  const result = await orchestrator.run(parsed.data);
  return NextResponse.json(result);
}

export async function GET() {
  const scans = await prisma.scan.findMany({
    orderBy: { startedAt: "desc" },
    take: 20,
    include: { _count: { select: { candidates: true } } },
  });
  return NextResponse.json({ scans });
}
