/**
 * Live AliExpress Affiliate API probe.
 * Usage: npx tsx scripts/aliexpress-probe.ts "portable blender"
 */
import "dotenv/config";
import { AliExpressOfficialApiProvider } from "../src/lib/providers/aliexpress-official";

async function main() {
  const keyword = process.argv[2] ?? "portable blender";
  const appKey = process.env.ALIEXPRESS_APP_KEY ?? "";
  const appSecret = process.env.ALIEXPRESS_APP_SECRET ?? "";
  const trackingId = process.env.ALIEXPRESS_TRACKING_ID ?? "default";

  if (!appKey || !appSecret) {
    throw new Error("Missing ALIEXPRESS_APP_KEY / ALIEXPRESS_APP_SECRET in .env");
  }

  const provider = new AliExpressOfficialApiProvider({
    appKey,
    appSecret,
    trackingId,
  });

  const products = await provider.searchProducts({
    keyword,
    limit: 5,
    shipToCountry: "US",
    currency: "USD",
  });

  console.log(
    JSON.stringify(
      {
        keyword,
        count: products.length,
        sample: products.slice(0, 3).map((p) => ({
          productId: p.productId,
          title: p.title,
          priceMinor: p.priceMinor,
          currency: p.currency,
          rating: p.rating,
          orderCount: p.orderCount,
          url: p.url,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
