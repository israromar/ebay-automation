import { describe, expect, it } from "vitest";
import { parseMoneyToMinor, parseTerapeakText } from "@/lib/domain/terapeak-import";

describe("parseTerapeakText", () => {
  it("parses a tab-separated copy of the Terapeak sold table", () => {
    const text = [
      "Listing\tAvg sold price\tAvg shipping\tTotal sold\tItem sales\tDate last sold",
      "Resistance Bands Set 11 Piece\t$24.99\t$0.00\t1,245\t$31,112.55\tSep 26, 2026",
      "Mouth Tape for Sleeping 120 pcs\t$9.49\tFree\t87\t$825.63\tSep 25, 2026",
    ].join("\n");
    const r = parseTerapeakText(text);
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ title: "Resistance Bands Set 11 Piece", totalSold: 1245, sold30d: 1245, avgSoldPriceMinor: 2499, itemId: null });
    expect(r.columns.totalSold).toBe("Total sold");
  });

  it("parses CSV with quoted fields and a URL column, scaling a 90-day range to 30 days", () => {
    const csv = [
      "Title,Listing URL,Total Sold,Avg Sold Price",
      '"Neck Stretcher, Over Door",https://www.ebay.com/itm/Neck-Stretcher/256123456789?hash=x,90,"$1,019.00"',
    ].join("\r\n");
    const r = parseTerapeakText(csv, { rangeDays: 90 });
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({
      title: "Neck Stretcher, Over Door",
      itemId: "256123456789",
      totalSold: 90,
      sold30d: 30,
      avgSoldPriceMinor: 101900,
    });
  });

  it("accepts rows with only an item id", () => {
    const r = parseTerapeakText("Item ID\tTotal sold\n256123456789\t40");
    expect(r.rows[0]).toMatchObject({ itemId: "256123456789", title: "eBay item 256123456789", sold30d: 40 });
  });

  it("reports bad rows and missing headers", () => {
    expect(parseTerapeakText("Foo\tBar\n1\t2").errors[0]?.message).toMatch(/Total sold/);
    const r = parseTerapeakText("Listing\tTotal sold\nGood product\t20\nBad product\tn/a\nGood product\t21");
    expect(r.rows).toHaveLength(1);
    expect(r.errors.map((e) => e.line)).toEqual([3, 4]);
  });

  it("rejects empty input", () => {
    expect(parseTerapeakText("   ").errors).toHaveLength(1);
  });
});

describe("parseMoneyToMinor", () => {
  it("handles currency formats", () => {
    expect(parseMoneyToMinor("US $1,234.56")).toBe(123456);
    expect(parseMoneyToMinor("12")).toBe(1200);
    expect(parseMoneyToMinor("12,50")).toBe(1250);
    expect(parseMoneyToMinor("Free")).toBeNull();
  });
});
