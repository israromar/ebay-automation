import { describe, expect, it } from "vitest";
import {
  medianMinor,
  parseEbayPurchaseDate,
  parseEbayPurchaseHistoryHtml,
} from "@/lib/domain/ebay-purchase-history";

const SAMPLE_HTML = `
<html><body>
  <h1>Item Purchase History</h1>
  <h2>Recent purchases</h2>
  <table>
    <tr>
      <th>User ID</th>
      <th>Buy it now price</th>
      <th>Quantity</th>
      <th>Date of purchase</th>
    </tr>
    <tr>
      <td>b***2</td>
      <td>US $12.01</td>
      <td>1</td>
      <td>28 Jul 2026 at 10:26:24am PDT</td>
    </tr>
    <tr>
      <td>c***9</td>
      <td>US $11.50</td>
      <td>2</td>
      <td>20 Jul 2026 at 3:05:00pm PDT</td>
    </tr>
    <tr>
      <td>d***1</td>
      <td>US $10.00</td>
      <td>1</td>
      <td>01 Jun 2026 at 9:00:00am PDT</td>
    </tr>
  </table>
</body></html>
`;

describe("ebay purchase history parse", () => {
  it("parses purchase dates with timezone", () => {
    const date = parseEbayPurchaseDate("28 Jul 2024 at 10:26:24am PDT");
    expect(date).toBeInstanceOf(Date);
    expect(date!.toISOString()).toBe("2024-07-28T17:26:24.000Z");
  });

  it("counts units in the last 30 days and computes avg/median", () => {
    const now = new Date("2026-07-31T12:00:00.000Z");
    const result = parseEbayPurchaseHistoryHtml(SAMPLE_HTML, {
      itemIdOrUrl: "178349261747",
      now,
      windowDays: 30,
    });

    expect(result.itemId).toBe("178349261747");
    expect(result.purchases).toHaveLength(3);
    // 1 + 2 in window; June row excluded
    expect(result.soldLast30Days).toBe(3);
    // prices: 1201, 1150, 1150 → avg 1167
    expect(result.avgCompletedSaleMinor).toBe(1167);
    expect(result.medianCompletedSaleMinor).toBe(1150);
    expect(result.warnings).toEqual([]);
  });

  it("flags login walls when no purchase table is present", () => {
    const result = parseEbayPurchaseHistoryHtml(
      `<html><body><a href="https://signin.ebay.com">Sign in</a></body></html>`,
      { itemIdOrUrl: "178349261747" },
    );
    expect(result.warnings).toContain("login_wall_detected");
    expect(result.purchases).toHaveLength(0);
  });

  it("computes median for even counts", () => {
    expect(medianMinor([100, 200, 300, 400])).toBe(250);
  });
});
