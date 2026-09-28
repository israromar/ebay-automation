import { afterEach, describe, expect, it, vi } from "vitest";
import { convertUsdMinor, resetFxCache, usdTo } from "@/lib/services/fx";

afterEach(() => {
  vi.unstubAllGlobals();
  resetFxCache();
});

describe("fx", () => {
  it("uses live ECB rates and caches them", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ base: "USD", rates: { GBP: 0.75, EUR: 0.9 } })));
    vi.stubGlobal("fetch", fetchMock);
    const gbp = await usdTo("gbp");
    expect(gbp).toEqual({ currency: "GBP", rate: 0.75, source: "live" });
    expect(convertUsdMinor(200, gbp)).toBe(150);
    await usdTo("EUR");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to built-in rates when the service is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    const gbp = await usdTo("GBP");
    expect(gbp.source).toBe("fallback");
    expect(convertUsdMinor(200, gbp)).toBe(158);
  });

  it("never converts USD", async () => {
    expect(await usdTo("USD")).toEqual({ currency: "USD", rate: 1, source: "live" });
  });
});
