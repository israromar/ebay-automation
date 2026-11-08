# Integrated architecture

## Dashboard

Next.js owns authentication, secrets, provider calls, qualification rules, Supabase/Postgres persistence, exports, and research history.

## Extension

Manifest V3 content scripts read the current eBay or AliExpress page. The background worker uses a revocable workspace token, performs paced verification, stops on login or bot checks, and sends evidence to the dashboard API. Marketplace cookies never leave the browser.

## Evidence states

- `VERIFIED`: the source can prove the metric, period, seller, and product equivalence.
- `UNVERIFIED`: a value exists but cannot prove the mandatory rule.
- `UNKNOWN`: the provider did not return the metric.
- `REJECTED`: a hard category, variation, compatibility, supplier, or profitability rule failed.

The next schema boundary is `ProductCluster → CompetitorListing → SaleEvidence`. A cluster may become qualified only after three distinct sellers independently satisfy the rolling 30-day rule.
