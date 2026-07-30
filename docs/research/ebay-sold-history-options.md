# eBay Sold-History Options

**Date:** 2026-07-26  
**Decision (plan default):** Manual validation only for MVP. Never auto-APPROVE without verified demand. Paid providers require explicit approval after this comparison.

## Why this is blocking

Business rule: ≥5 confirmed sales in the previous 30 days. Public Browse API cannot supply this. Marketplace Insights can, but only if approved.

## Option A — Marketplace Insights API (preferred official)

- Endpoint: `item_sales/search`
- Pros: Official, licence-aligned, structured sold history
- Cons: Limited Release; may be unavailable to new developers
- Action: Request access via eBay developer / Buy API growth process; probe with credentials; document pass/fail

## Option B — Manual validation (MVP default)

- Status: `NEEDS_MANUAL_VALIDATION`
- Reason: `EBAY_SOLD_HISTORY_UNAVAILABLE`
- UI: operator pastes sold count, average/median sold price, evidence URL, timestamp
- Pros: Honest, compliant, unblocks profit math for review
- Cons: Not fully automated

## Option C — Licensed third-party providers (approval required)

| Provider                             | Marketplaces        | Sold history                   | AliExpress     | Pricing (public)  | Notes                                                  |
| ------------------------------------ | ------------------- | ------------------------------ | -------------- | ----------------- | ------------------------------------------------------ |
| SoldComps                            | Multiple eBay sites | Up to ~90 days, keyword search | No             | Free–$79/mo bands | Unofficial scraper-backed; licence/ToS review required |
| Apify sold-listings actors           | eBay                | Completed listings             | No             | Per-result        | Same compliance caveats                                |
| ShopAPIS                             | eBay NA             | Sold + active                  | No             | Vendor quote      | Review licence                                         |
| Bright Data / Oxylabs ecommerce APIs | Broad               | Via scrape                     | Possible       | $$$               | Enterprise compliance; still ToS risk vs marketplaces  |
| Zik / Terapeak UI                    | eBay                | Yes (UI)                       | Research tools | Subscription      | No bulk API for our stack                              |

**Do not integrate any paid provider until pricing, licence, data freshness, geo coverage, and ToS risk are approved.**

## Option D — Browser extraction (not production default)

- Technically: eBay sold/completed search UI
- Risks: ToS, CAPTCHA, brittle selectors, rate limits
- Allowed use: research / selector discovery with Playwright MCP; PoC traces only
- On CAPTCHA: `MANUAL_INTERVENTION_REQUIRED` — never bypass

## Option E — Browser extension import

- User-supervised capture from authenticated session
- Useful as a future manual assist; not unattended scheduler

## MVP policy

```txt
demandSource = Insights | Manual | LicensedProvider(approved)
if demand not verified → cannot APPROVED
status ∈ { DEMAND_NOT_VERIFIED, NEEDS_MANUAL_VALIDATION }
reason includes EBAY_SOLD_HISTORY_UNAVAILABLE when no source
```
