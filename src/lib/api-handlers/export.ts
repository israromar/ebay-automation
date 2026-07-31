import { NextResponse } from "next/server";
import { isNextResponse, requireSessionWorkspace } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { CsvExporter } from "@/lib/export/csv";
import { GoogleSheetsApiExporter } from "@/lib/export/google-sheets";
import { ScanOrchestrator } from "@/lib/services/scan-orchestrator";
import {
  createAliExpressProvider,
  createEbayProvider,
  createVisualMatchProvider,
  loadWorkspaceRules,
} from "@/lib/services/providers";
import path from "path";
import { z } from "zod";

const schema = z.object({
  destination: z.enum(["csv", "google_sheets"]).default("csv"),
});

export async function POST(req: Request) {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;

  const json = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const orchestrator = new ScanOrchestrator({
    aliexpress: createAliExpressProvider(),
    ebay: createEbayProvider(),
    visualMatch: createVisualMatchProvider(),
    rules: await loadWorkspaceRules(session.workspace.id),
    workspaceId: session.workspace.id,
  });

  const exporter =
    parsed.data.destination === "google_sheets"
      ? new GoogleSheetsApiExporter({
          spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID ?? "",
        })
      : new CsvExporter(path.join(process.cwd(), "poc-output", "approved-export.csv"));

  const result = await orchestrator.exportApproved(exporter, { workspaceId: session.workspace.id });
  return NextResponse.json(result);
}

export async function GET() {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;

  const exports = await prisma.exportRecord.findMany({
    where: { candidate: { scan: { project: { workspaceId: session.workspace.id } } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ exports });
}
