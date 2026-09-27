import { isNextResponse, requireSessionWorkspace } from "@/lib/auth/session";
import { toCsv } from "@/lib/export/csv";
import { listListings, parseListingQuery } from "@/lib/services/listings";
import { loadHuntSettings } from "@/lib/services/providers";

const money = (minor: number | null | undefined) => (minor == null ? "" : (minor / 100).toFixed(2));

export async function GET(req: Request) {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;
  const settings = await loadHuntSettings(session.workspace.id);
  const query = { ...parseListingQuery(new URL(req.url).searchParams), page: 1, pageSize: 200 };

  const rows: Array<Record<string, string | number>> = [];
  for (let page = 1; page <= 25; page++) {
    const { items, total } = await listListings(session.workspace.id, { ...query, page }, settings);
    for (const l of items) {
      const s = l.bestSource;
      rows.push({
        ebay_item_id: l.ebayItemId,
        ebay_title: l.title,
        ebay_url: l.url,
        ebay_price: money(l.priceMinor),
        sold_30d: l.sold30d ?? "",
        demand_tier: l.demandTier,
        demand_source: l.demandSource,
        keyword: l.keyword,
        ae_title: s?.title ?? "",
        ae_url: s?.url ?? "",
        ae_price: money(s?.priceMinor),
        ae_shipping: money(s?.shippingMinor),
        ae_shipping_estimated: s ? (s.shippingEstimated ? "yes" : "no") : "",
        ae_rating: s?.rating?.toFixed(2) ?? "",
        ae_reviews: s?.reviewCount ?? "",
        ae_orders: s?.orderCount ?? "",
        match_confidence: s?.matchConfidence ?? "",
        net_profit: money(s?.netProfitMinor),
        margin_pct: s?.marginPct ?? "",
      });
    }
    if (page * query.pageSize >= total) break;
  }

  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="winning-products-${query.view}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
