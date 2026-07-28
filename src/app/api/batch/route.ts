import { NextResponse } from "next/server";
import {
  AliExpressManualImportProvider,
  sampleAliExpressCatalog,
} from "@/lib/providers/aliexpress-manual";
import { EbayBrowseApiProvider } from "@/lib/providers/ebay-browse";
import { ScanOrchestrator } from "@/lib/services/scan-orchestrator";
import { z } from "zod";

const schema = z.object({
  keywords: z.array(z.string().min(1)).max(20).optional(),
  aliexpressUrls: z.array(z.string().url()).max(20).optional(),
  csvText: z.string().optional(),
  limitPerKeyword: z.number().int().min(1).max(5).optional(),
});

function parseCsvKeywords(csvText: string): string[] {
  return csvText
    .split(/\r?\n/)
    .map((line) => line.split(",")[0]?.trim() ?? "")
    .filter((k) => k && k.toLowerCase() !== "keyword");
}

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const keywords = [
    ...(parsed.data.keywords ?? []),
    ...(parsed.data.csvText ? parseCsvKeywords(parsed.data.csvText) : []),
  ];
  const urls = parsed.data.aliexpressUrls ?? [];
  if (!keywords.length && !urls.length) {
    return NextResponse.json({ error: "Provide keywords, csvText, or aliexpressUrls" }, { status: 400 });
  }

  const orchestrator = new ScanOrchestrator({
    aliexpress: new AliExpressManualImportProvider(sampleAliExpressCatalog()),
    ebay: new EbayBrowseApiProvider({
      clientId: process.env.EBAY_CLIENT_ID ?? "",
      clientSecret: process.env.EBAY_CLIENT_SECRET ?? "",
    }),
  });

  const results = [];
  for (const keyword of keywords) {
    results.push(
      await orchestrator.run({
        keyword,
        mode: "batch",
        limit: parsed.data.limitPerKeyword ?? 5,
      }),
    );
  }
  for (const url of urls) {
    results.push(
      await orchestrator.run({
        keyword: url,
        aliexpressUrl: url,
        mode: "aliexpress_url",
        limit: 1,
      }),
    );
  }

  return NextResponse.json({ batches: results });
}
