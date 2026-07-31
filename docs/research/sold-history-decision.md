# Sold-History Decision Record

**Date:** 2026-07-30 (updated 2026-07-31)  
**Status:** Active

## Decision

1. **Primary MVP demand path = operator sold-history validation** on the candidate detail page (deep links + sold/avg/median entry).
2. **Marketplace Insights** is probed automatically when eBay credentials exist; on success it fills `getMarketDemand` without manual entry.
3. **Assisted purchase-history fetch** (`POST /api/candidates/[id]/sold-history/fetch`) is an operator-triggered helper: HTTP then Playwright parses `/bin/purchaseHistory?item=…` for last-30-day count + avg/median and autofills the form. It is **not** an unattended scheduler default.
4. Candidates without verified demand use `NEEDS_MANUAL_VALIDATION` / `DEMAND_NOT_VERIFIED` with `EBAY_SOLD_HISTORY_UNAVAILABLE`.
5. **Never** set status `APPROVED` without both:
   - Verified demand (`EbaySaleObservation` or Insights result applied through the same gates).
   - A validated AE source (product ID, URL, price, and match confidence).
6. Manual demand entry must return a conflict when no validated AE source is attached; missing AE cost is never treated as zero.
7. Third-party sold-data providers remain **out of scope** until approved in writing.
8. Unattended browser scraping remains **not** the production default; assisted fetch may hit login walls / bot checks and falls back to manual entry.

## Live probe (2026-07-30)

- Credentials present for Browse OAuth: yes
- `GET /buy/marketplace_insights/v1_beta/item_sales/search`: **403 Access denied**
- Conclusion: Insights not available for this app key yet; keep manual/assisted path as production demand source and leave Insights wired for when access is granted.

## Operator flow

1. Open candidate → **Fetch sold history (last 30d)** (or open listing sold history / sold+completed search if fetch fails).
2. Review autofilled sold last 30 days + avg/median sold price + evidence URL.
3. Apply demand → profit recalculated from avg sold price when provided → approve / demand-not-verified / unprofitable.

## Env

- `EBAY_PURCHASE_HISTORY_FETCH_ENABLED` — default on; set `false` to disable assisted fetch.
- `EBAY_PURCHASE_HISTORY_COOKIE` — optional logged-in eBay `Cookie` header (from browser DevTools). Purchase history usually requires sign-in; without this cookie the fetch returns `login_required` and the UI falls back to manual entry.
- Requires local Chromium for Playwright fallback: `npx playwright install chromium`.
- Prefer running fetch on a machine that can open eBay (local/dev worker), not serverless without browser deps.

## Rationale

Public Browse API cannot supply 30-day sold counts. Building scrapers as the unattended production path conflicts with compliance posture. Manual + Insights-when-available + optional operator-triggered fetch is the honest, shippable product path.
