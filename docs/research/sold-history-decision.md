# Sold-History Decision Record

**Date:** 2026-07-30  
**Status:** Active

## Decision

1. **Primary MVP demand path = operator sold-history validation** on the candidate detail page (deep links + sold/avg/median entry).
2. **Marketplace Insights** is probed automatically when eBay credentials exist; on success it fills `getMarketDemand` without manual entry.
3. Candidates without verified demand use `NEEDS_MANUAL_VALIDATION` / `DEMAND_NOT_VERIFIED` with `EBAY_SOLD_HISTORY_UNAVAILABLE`.
4. **Never** set status `APPROVED` without verified demand (`EbaySaleObservation` or Insights result applied through the same gates).
5. Third-party sold-data providers remain **out of scope** until approved in writing.
6. Browser scraping is **not** the production default.

## Live probe (2026-07-30)

- Credentials present for Browse OAuth: yes
- `GET /buy/marketplace_insights/v1_beta/item_sales/search`: **403 Access denied**
- Conclusion: Insights not available for this app key yet; keep manual path as production demand source and leave Insights wired for when access is granted.

## Operator flow

1. Open candidate → **Open listing sold history** / sold+completed search (must be logged into eBay).
2. Enter sold last 30 days + avg/median sold price + evidence URL.
3. Apply demand → profit recalculated from avg sold price when provided → approve / demand-not-verified / unprofitable.

## Rationale

Public Browse API cannot supply 30-day sold counts. Building scrapers as the default production path conflicts with compliance posture. Manual + Insights-when-available is the honest, shippable product path.
