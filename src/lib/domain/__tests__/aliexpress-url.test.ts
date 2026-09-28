import { describe, expect, it } from "vitest";
import {
  aliexpressProductIdFromUrl,
  canonicalAliExpressItemUrl,
  isAliExpressBundleUrl,
  unbundleAliExpressUrl,
} from "@/lib/domain/aliexpress-url";

describe("AliExpress bundle-deal URLs", () => {
  const bundle =
    "https://www.aliexpress.com/ssr/300000512/BundleDeals2?productIds=1005006123456789:12000036000000001,1005001111111111&pha_manifest=ssr";

  it("rewrites /ssr/ and /gcp/ bundle pages to the first product's item page", () => {
    expect(isAliExpressBundleUrl(bundle)).toBe(true);
    expect(unbundleAliExpressUrl(bundle)).toBe("https://www.aliexpress.com/item/1005006123456789.html");
    expect(unbundleAliExpressUrl("https://www.aliexpress.us/gcp/300000512/nnmixupdatev3?productIds=1005007000000001")).toBe(
      "https://www.aliexpress.com/item/1005007000000001.html",
    );
  });

  it("leaves item pages, click links and non-AliExpress URLs alone", () => {
    const item = "https://www.aliexpress.com/item/1005006123456789.html?spm=x";
    expect(unbundleAliExpressUrl(item)).toBe(item);
    expect(unbundleAliExpressUrl("https://s.click.aliexpress.com/e/_abc")).toBe("https://s.click.aliexpress.com/e/_abc");
    expect(unbundleAliExpressUrl("https://example.com/ssr/1?productIds=1005006123456789")).toBe(
      "https://example.com/ssr/1?productIds=1005006123456789",
    );
  });

  it("extracts product ids and builds canonical URLs", () => {
    expect(aliexpressProductIdFromUrl("https://www.aliexpress.com/item/1005006123456789.html")).toBe("1005006123456789");
    expect(aliexpressProductIdFromUrl("https://m.aliexpress.com/gcp/1/x?x_object_id=1005001234567890")).toBe("1005001234567890");
    expect(aliexpressProductIdFromUrl("not a url")).toBeNull();
    expect(canonicalAliExpressItemUrl("1005")).toBe("https://www.aliexpress.com/item/1005.html");
  });
});
