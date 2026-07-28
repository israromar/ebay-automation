/**
 * Phase 1 PoC: one keyword, ≤5 products, match, demand gap, profit, CSV export, Playwright trace.
 * Run: npx tsx scripts/poc-run.ts
 */
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import {
  AliExpressManualImportProvider,
  sampleAliExpressCatalog,
} from "../src/lib/providers/aliexpress-manual";
import { EbayBrowseApiProvider } from "../src/lib/providers/ebay-browse";
import { CsvExporter } from "../src/lib/export/csv";
import { ScanOrchestrator } from "../src/lib/services/scan-orchestrator";
import { LocalPlaywrightBrowserProvider } from "../src/lib/providers/browser-local";

async function main() {
  const keyword = process.argv[2] ?? "portable rechargeable blender";
  const outDir = path.join(process.cwd(), "poc-output");
  await mkdir(outDir, { recursive: true });

  const browserProvider = new LocalPlaywrightBrowserProvider();
  const session = await browserProvider.createSession({ headless: true });

  // Playwright exploration trace (dev workflow — not production scraper)
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();
  try {
    await page.goto("https://example.com", { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.title();
  } catch (e) {
    console.warn("Playwright navigation warning:", e instanceof Error ? e.message : e);
  }
  const tracePath = path.join(outDir, "poc-trace.zip");
  await context.tracing.stop({ path: tracePath });
  await browser.close();
  await browserProvider.closeSession(session.id);

  const aliexpress = new AliExpressManualImportProvider(sampleAliExpressCatalog());
  const ebay = new EbayBrowseApiProvider({
    clientId: process.env.EBAY_CLIENT_ID ?? "",
    clientSecret: process.env.EBAY_CLIENT_SECRET ?? "",
  });
  const exporter = new CsvExporter(path.join(outDir, "approved-export.csv"));
  const orchestrator = new ScanOrchestrator({ aliexpress, ebay, exporter });

  const { scanId, candidates } = await orchestrator.run({
    keyword,
    limit: 5,
    mode: "keyword",
  });

  // Demonstrate manual demand validation on the best matched candidate
  const needsManual = candidates.find((c) => c.status === "NEEDS_MANUAL_VALIDATION");
  if (needsManual) {
    await orchestrator.applyManualDemand(needsManual.id, {
      soldLast30Days: 8,
      avgCompletedSaleMinor: needsManual.ebayCurrentPriceMinor ?? 2499,
      evidenceUrl: "https://www.ebay.com/sch/i.html?_nkw=portable+blender&LH_Sold=1",
      verifiedBy: "poc-operator",
      notes: "PoC manual demand entry — replace with Insights/licensed source when available",
    });
  }

  const exportResult = await orchestrator.exportApproved(exporter);

  const prisma = new PrismaClient();
  const finalCandidates = await prisma.productCandidate.findMany({ where: { scanId } });
  await prisma.$disconnect();

  const report = {
    keyword,
    scanId,
    tracePath,
    exportResult,
    demandNote:
      "Official sold-history unavailable via Browse API. PoC used manual validation for one candidate.",
    mcpDevWorkflow:
      "Use Playwright MCP / cursor-ide-browser for selector discovery; eBay MCP for Browse probes. Production uses these adapters directly.",
    candidates: finalCandidates.map((c) => ({
      id: c.id,
      name: c.productName,
      status: c.status,
      rating: c.rating,
      orders: c.orderCount,
      matchConfidence: c.matchConfidence,
      soldLast30Days: c.soldLast30Days,
      demandVerified: c.demandVerified,
      netMarginPercent: c.netMarginPercent,
      estimatedProfitMinor: c.estimatedProfitMinor,
      rejectionReasons: c.rejectionReasonsJson,
    })),
  };

  await writeFile(path.join(outDir, "poc-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
