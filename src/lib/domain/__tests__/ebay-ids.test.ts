import { describe, expect, it } from "vitest";
import { extractEbayItemId, marketplaceFromUrl, variationIdFromUrl } from "@/lib/domain/ebay-ids";

describe("eBay listing URLs", () => {
  it("maps site hosts to marketplaces", () => {
    expect(marketplaceFromUrl("https://www.ebay.co.uk/itm/Kettle/256123456789")).toEqual({ marketplaceId: "EBAY_GB", currency: "GBP", country: "GB" });
    expect(marketplaceFromUrl("https://m.ebay.co.uk/itm/256123456789")?.marketplaceId).toBe("EBAY_GB");
    expect(marketplaceFromUrl("https://www.ebay.com/itm/256123456789")?.marketplaceId).toBe("EBAY_US");
    expect(marketplaceFromUrl("https://www.ebay.com.au/itm/256123456789")?.currency).toBe("AUD");
    expect(marketplaceFromUrl("https://www.ebay.de/itm/256123456789")?.country).toBe("DE");
    expect(marketplaceFromUrl("https://example.com/itm/256123456789")).toBeNull();
    expect(marketplaceFromUrl("not a url")).toBeNull();
  });

  it("reads the item id and selected variation", () => {
    const url = "https://www.ebay.co.uk/itm/Electric-Kettle-1-7L/256123456789?var=555123456789&hash=item1";
    expect(extractEbayItemId(url)).toBe("256123456789");
    expect(variationIdFromUrl(url)).toBe("555123456789");
    expect(variationIdFromUrl("https://www.ebay.co.uk/itm/256123456789")).toBeNull();
  });
});
