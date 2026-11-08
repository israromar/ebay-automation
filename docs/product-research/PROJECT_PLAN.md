# MarketProof project plan

The Next.js dashboard is the system of record. The Chrome extension is a companion evidence collector, not a separate product database.

## Delivered

- eBay Browse and AliExpress Affiliate adapters with protected server-side credentials.
- User-authorized eBay purchase-history verification through the companion extension.
- Terapeak import, daily snapshots, deterministic source matching, profitability, persistence, and CSV export.
- UK marketplace defaults and a shared research-framework view.

## Implementation sequence

1. Add canonical product clusters so equivalent eBay listings can be aggregated across distinct sellers.
2. Store seller identity and deduplicated sale events with source references and retrieval timestamps.
3. Require three verified sellers with at least 20 units each before `QUALIFIED`.
4. Preserve AliExpress reputation type instead of presenting positive-feedback percentage as a five-star seller rating.
5. Add automotive taxonomy/fitment checks, safety-risk flags, and category exclusions.
6. Add opportunity scoring and qualification evidence to dashboard rows and the extension panel.
7. Add service-worker restart and dashboard/extension contract tests.

Automated discovery remains bounded by provider permissions, rate limits, and marketplace policies.
