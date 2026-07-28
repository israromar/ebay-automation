# Sold-History Decision Record

**Date:** 2026-07-26  
**Status:** Approved default from architecture plan

## Decision

1. **MVP demand path = manual validation only** until Marketplace Insights access is demonstrated or a licensed provider is explicitly approved.
2. Candidates without verified demand use `NEEDS_MANUAL_VALIDATION` / `DEMAND_NOT_VERIFIED` with `EBAY_SOLD_HISTORY_UNAVAILABLE`.
3. **Never** set status `APPROVED` without verified `EbaySaleObservation` data (manual entry counts as verified when operator confirms evidence).
4. Insights access should be requested via eBay developer portal; result recorded in `ebay-mcp-evaluation.md`.
5. Third-party sold-data providers remain **out of scope** until a comparison is approved in writing.

## Rationale

Public Browse API cannot supply 30-day sold counts. Building scrapers as the default production path conflicts with compliance posture in the product brief.
