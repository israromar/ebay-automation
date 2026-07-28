import { EbayBrowseApiProvider } from "@/lib/providers/ebay-browse";
import { AliExpressManualImportProvider, sampleAliExpressCatalog } from "@/lib/providers/aliexpress-manual";
import { CsvExporter } from "@/lib/export/csv";
import { mkdtemp, readFile } from "fs/promises";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";

describe("providers", () => {
  it("manual aliexpress search filters by keyword", async () => {
    const p = new AliExpressManualImportProvider(sampleAliExpressCatalog());
    const results = await p.searchProducts({ keyword: "blender", limit: 5 });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.title.toLowerCase().includes("blender"))).toBe(true);
  });

  it("ebay demand reports unavailable without Insights", async () => {
    const ebay = new EbayBrowseApiProvider({ clientId: "", clientSecret: "" });
    const demand = await ebay.getMarketDemand({ keyword: "blender" });
    expect(demand.available).toBe(false);
    expect(demand.reasonCode).toBe("EBAY_SOLD_HISTORY_UNAVAILABLE");
  });

  it("ebay fixture search returns listings", async () => {
    const ebay = new EbayBrowseApiProvider({ clientId: "", clientSecret: "" });
    const listings = await ebay.searchProducts({ keyword: "portable blender", limit: 5 });
    expect(listings.length).toBeGreaterThan(0);
  });
});

describe("csv export", () => {
  it("appends and dedupes by fingerprint", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "export-"));
    const file = path.join(dir, "out.csv");
    const exporter = new CsvExporter(file);
    const row = {
      timestamp: "t",
      scanId: "s",
      searchKeyword: "k",
      productName: "p",
      productImage: "",
      aliexpressUrl: "",
      aliexpressProductId: "1",
      aliexpressPrice: "$1",
      aliexpressShipping: "$0",
      adjustedSourceCost: "$2.99",
      rating: "4.8",
      reviewCount: "10",
      orderCount: "50",
      ebayUrl: "",
      ebayItemId: "",
      ebayCurrentPrice: "$10",
      averageCompletedSalePrice: "",
      soldLast30Days: "5",
      activeListingCount: "3",
      matchConfidence: "80",
      estimatedMarketplaceFees: "",
      estimatedTotalCost: "",
      estimatedProfit: "$1",
      netMarginPercent: "10",
      returnOnCostPercent: "12",
      status: "APPROVED",
      rejectionReason: "",
      lastVerifiedTimestamp: "",
      dataSource: "test",
      fingerprint: "fp_test_1",
    };
    const r1 = await exporter.exportCandidates([row]);
    const r2 = await exporter.exportCandidates([row]);
    expect(r1.exportedCount).toBe(1);
    expect(r2.exportedCount).toBe(0);
    const text = await readFile(file, "utf8");
    expect(text.split("\n").filter(Boolean).length).toBe(2);
  });
});
