import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { CsvExporter } from "@/lib/export/csv";
import { GoogleSheetsApiExporter } from "@/lib/export/google-sheets";
import {
  AliExpressManualImportProvider,
  sampleAliExpressCatalog,
} from "@/lib/providers/aliexpress-manual";
import { EbayBrowseApiProvider } from "@/lib/providers/ebay-browse";
import { ScanOrchestrator } from "@/lib/services/scan-orchestrator";
import path from "path";
import { z } from "zod";

const schema = z.object({
  destination: z.enum(["csv", "google_sheets"]).default("csv"),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const orchestrator = new ScanOrchestrator({
    aliexpress: new AliExpressManualImportProvider(sampleAliExpressCatalog()),
    ebay: new EbayBrowseApiProvider({
      clientId: process.env.EBAY_CLIENT_ID ?? "",
      clientSecret: process.env.EBAY_CLIENT_SECRET ?? "",
    }),
  });

  const exporter =
    parsed.data.destination === "google_sheets"
      ? new GoogleSheetsApiExporter({
          spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID ?? "",
        })
      : new CsvExporter(path.join(process.cwd(), "poc-output", "approved-export.csv"));

  const result = await orchestrator.exportApproved(exporter);
  return NextResponse.json(result);
}

export async function GET() {
  const exports = await prisma.exportRecord.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ exports });
}
