import { afterEach, describe, expect, it, vi } from "vitest";
import { toCsv } from "@/lib/export/csv";
import { AliExpressOfficialApiProvider } from "@/lib/providers/aliexpress-official";
import { EbayBrowseApiProvider, EbayConfigError, mapItemDetails } from "@/lib/providers/ebay-browse";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("EbayBrowseApiProvider", () => {
  it("throws a config error instead of returning fixtures when keys are missing", async () => {
    const ebay = new EbayBrowseApiProvider({ clientId: "", clientSecret: "" });
    await expect(ebay.searchProducts({ keyword: "blender" })).rejects.toBeInstanceOf(EbayConfigError);
  });

  it("maps lifetime sold, creation date and stock from getItem payloads", () => {
    const d = mapItemDetails({
      itemId: "v1|256123456789|0",
      legacyItemId: "256123456789",
      title: "Resistance Bands",
      itemWebUrl: "https://www.ebay.com/itm/256123456789?_trkparms=x",
      price: { value: "24.99", currency: "USD" },
      shippingOptions: [{ shippingCost: { value: "0.00" } }],
      itemCreationDate: "2026-01-02T03:04:05.000Z",
      estimatedAvailabilities: [{ estimatedSoldQuantity: 812, estimatedAvailabilityStatus: "IN_STOCK" }],
    });
    expect(d).toMatchObject({
      legacyItemId: "256123456789",
      url: "https://www.ebay.com/itm/256123456789",
      priceMinor: 2499,
      shippingMinor: 0,
      estimatedSoldQuantity: 812,
      outOfStock: false,
    });
    expect(d.itemCreationDate?.toISOString()).toBe("2026-01-02T03:04:05.000Z");
  });

  it("batches getItems 20 ids per call and filters search to fixed-price listings in the price band", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("oauth2/token")) return jsonResponse({ access_token: "tok", expires_in: 7200 });
        if (url.includes("/item_summary/search")) {
          return jsonResponse({ total: 1, itemSummaries: [{ itemId: "v1|1|0", title: "A", price: { value: "10" } }] });
        }
        const ids = new URL(url).searchParams.get("item_ids")!.split(",");
        return jsonResponse({
          items: ids.map((id) => ({ itemId: id, title: id, estimatedAvailabilities: [{ estimatedSoldQuantity: 5 }] })),
        });
      }),
    );
    const ebay = new EbayBrowseApiProvider({ clientId: "id", clientSecret: "secret" });
    const ids = Array.from({ length: 45 }, (_, i) => `v1|${100000000 + i}|0`);
    const details = await ebay.getItemsBatch(ids);
    expect(details.size).toBe(45);
    expect(calls.filter((c) => c.includes("item_ids=")).length).toBe(3);

    await ebay.searchProducts({ keyword: "bands", minPriceMinor: 800, maxPriceMinor: 15000 });
    const search = new URL(calls.find((c) => c.includes("item_summary"))!);
    expect(search.searchParams.get("filter")).toContain("buyingOptions:{FIXED_PRICE}");
    expect(search.searchParams.get("filter")).toContain("price:[8.00..150.00]");
  });
});

describe("AliExpressOfficialApiProvider", () => {
  it("maps evaluate_rate (% positive) to a 0-5 star rating", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          aliexpress_affiliate_product_query_response: {
            resp_result: {
              result: {
                products: {
                  product: [
                    {
                      product_id: "1",
                      product_title: "A",
                      sale_price: "5",
                      evaluate_rate: "94.0%",
                      evaluation_count: "120",
                      lastest_volume: "900",
                    },
                    { product_id: "2", product_title: "B", sale_price: "5", evaluate_rate: "4.9" },
                    { product_id: "3", product_title: "C", sale_price: "5" },
                  ],
                },
              },
            },
          },
        }),
      ),
    );
    const provider = new AliExpressOfficialApiProvider({ appKey: "key", appSecret: "secret" });
    const [a, b, c] = await provider.searchProducts({ keyword: "x", limit: 3 });
    expect(a).toMatchObject({ rating: 4.7, reviewCount: 120, orderCount: 900, priceMinor: 500 });
    expect(b?.rating).toBe(4.9);
    expect(c?.rating).toBeUndefined();
  });

  it("paginates official AliExpress search to 150 products", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const params = new URLSearchParams(String(init?.body));
      const page = Number(params.get("page_no"));
      const size = Number(params.get("page_size"));
      const products = Array.from({ length: size }, (_, index) => ({
        product_id: `${page}${String(index).padStart(10, "0")}`,
        product_title: `Product ${page}-${index}`,
        sale_price: "10",
        evaluate_rate: "98%",
        lastest_volume: "100",
      }));
      return new Response(
        JSON.stringify({
          aliexpress_affiliate_product_query_response: {
            resp_result: { result: { products: { product: products } } },
          },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new AliExpressOfficialApiProvider({
      appKey: "key",
      appSecret: "secret",
    });
    const products = await provider.searchProducts({
      keyword: "portable blender",
      limit: 150,
    });

    expect(products).toHaveLength(150);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("toCsv", () => {
  it("quotes, escapes and neutralises formulas but keeps negative numbers", () => {
    const csv = toCsv([{ title: '=HYPERLINK("x")', note: 'a, "b"', margin: "-5.5", n: 3 }]);
    expect(csv).toBe(`title,note,margin,n\n"'=HYPERLINK(""x"")","a, ""b""",-5.5,3\n`);
  });
});
