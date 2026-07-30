import { describe, expect, it } from "vitest";
import { buildEbayPurchaseHistoryUrl, buildEbaySoldSearchUrl, dollarsToMinor, extractNumericEbayItemId } from "@/lib/domain/ebay-sold-history";

describe("ebay sold history helpers", () => {
  it("extracts numeric item ids from legacy and URL forms", () => {
    expect(extractNumericEbayItemId("v1|376757790918|0")).toBe("376757790918");
    expect(extractNumericEbayItemId("https://www.ebay.com/itm/376757790918")).toBe("376757790918");
    expect(extractNumericEbayItemId("376757790918")).toBe("376757790918");
  });

  it("builds purchase history and sold search deep links", () => {
    expect(buildEbayPurchaseHistoryUrl("v1|376757790918|0")).toBe("https://www.ebay.com/bin/purchaseHistory?item=376757790918");
    expect(buildEbaySoldSearchUrl("resistance bands")).toContain("LH_Sold=1");
    expect(buildEbaySoldSearchUrl("resistance bands")).toContain("LH_Complete=1");
    expect(buildEbaySoldSearchUrl("resistance bands")).toContain("resistance+bands");
  });

  it("parses dollar inputs into minor units", () => {
    expect(dollarsToMinor("24.99")).toBe(2499);
    expect(dollarsToMinor("$7.28")).toBe(728);
    expect(dollarsToMinor("")).toBeNull();
  });
});
