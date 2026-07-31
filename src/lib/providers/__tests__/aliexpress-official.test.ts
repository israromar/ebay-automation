import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AliExpressOfficialApiProvider } from "@/lib/providers/aliexpress-official";

describe("AliExpressOfficialApiProvider image search", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("compresses the source image, uploads it, and maps image-search products", async () => {
    const sourceImage = await sharp({
      create: {
        width: 900,
        height: 900,
        channels: 3,
        background: { r: 20, g: 120, b: 180 },
      },
    })
      .png()
      .toBuffer();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(sourceImage, { status: 200, headers: { "Content-Type": "image/png" } }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            aliexpress_affiliate_image_search_response: {
              resp_result: {
                result: {
                  products: {
                    product: [
                      {
                        product_id: "1234567890123",
                        product_title: "Cervical Traction Over Door Hanging Neck Stretcher",
                        target_sale_price: "7.07",
                        product_main_image_url: "https://example.com/ae.jpg",
                      },
                    ],
                  },
                },
              },
            },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new AliExpressOfficialApiProvider({
      appKey: "app-key",
      appSecret: "app-secret",
      trackingId: "tracking-id",
    });
    const products = await provider.searchProductsByImage({
      imageUrl: "https://example.com/ebay.png",
      limit: 10,
    });

    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({
      productId: "1234567890123",
      title: "Cervical Traction Over Door Hanging Neck Stretcher",
      priceMinor: 707,
    });
    expect(products[0].meta.warnings).toContain("retrieved_by_image");

    const form = fetchMock.mock.calls[1]?.[1]?.body as FormData;
    expect(form.get("method")).toBe("aliexpress.affiliate.image.search");
    expect(form.get("sign")).toMatch(/^[A-F0-9]{32}$/);
    const imageFile = form.get("image_file_bytes") as File;
    expect(imageFile.size).toBeLessThanOrEqual(100_000);
    expect(imageFile.type).toBe("image/jpeg");
  });
});

describe("AliExpressOfficialApiProvider advanced APIs", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps smartmatch recommendations", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            aliexpress_affiliate_product_smartmatch_response: {
              resp_result: {
                result: {
                  products: {
                    product: [
                      {
                        product_id: "3256806145778732",
                        product_title: "Over Door Neck Traction Device",
                        target_sale_price: "12.50",
                        lastest_volume: 1200,
                      },
                    ],
                  },
                },
              },
            },
          }),
          { status: 200 },
        ),
      ),
    );

    const provider = new AliExpressOfficialApiProvider({
      appKey: "app-key",
      appSecret: "app-secret",
      trackingId: "tracking-id",
    });
    const products = await provider.searchSmartMatch({ keywords: "neck traction", limit: 10 });
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({
      productId: "3256806145778732",
      priceMinor: 1250,
    });
    expect(products[0].meta.warnings).toContain("retrieved_by_smartmatch");
  });

  it("maps hotproduct results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            aliexpress_affiliate_hotproduct_query_response: {
              resp_result: {
                result: {
                  products: {
                    product: [
                      {
                        product_id: "3256808644322015",
                        product_title: "Fitness Resistance Bands Set",
                        target_sale_price: "8.99",
                        lastest_volume: 5764,
                      },
                    ],
                  },
                },
              },
            },
          }),
          { status: 200 },
        ),
      ),
    );

    const provider = new AliExpressOfficialApiProvider({
      appKey: "app-key",
      appSecret: "app-secret",
      trackingId: "tracking-id",
    });
    const products = await provider.searchHotProducts({ keyword: "fitness", limit: 10 });
    expect(products).toHaveLength(1);
    expect(products[0].meta.warnings).toContain("retrieved_by_hotproduct");
    expect(products[0].orderCount).toBe(5764);
  });
});
