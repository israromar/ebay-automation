# AliExpress API Feasibility

**Date:** 2026-07-26  
**Status:** Affiliate/Open Platform preferred; browser scraping not MVP default.

## Summary

No trusted AliExpress MCP exists. Prefer **AliExpress Open Platform Affiliate APIs** after app + affiliate portal approval. Systematic site scraping is prohibited by AliExpress Terms of Use without written permission.

## Official access

### AliExpress Open Platform / Affiliate

- Portal: AliExpress Portals + Open Platform developer console
- Example method: `aliexpress.affiliate.product.query`
- Typical request params: `keywords`, `category_ids`, `min_sale_price`, `max_sale_price`, `page_no`, `page_size`, `sort`, `target_currency`, `target_language`, `ship_to_country`, `delivery_days`, `fields`, `tracking_id`
- Gateway (documented historically): Taobao/Ali open router with `app_key`, HMAC/MD5 sign, timestamp, `v=2.0`

### Fields needed for qualification

| Field                    | Required for rules | Expected via Affiliate             | Notes                                |
| ------------------------ | ------------------ | ---------------------------------- | ------------------------------------ |
| Title / product ID / URL | Yes                | Usually                            | Confirm live                         |
| Price (sale)             | Yes                | Usually                            | Currency via `target_currency`       |
| Shipping to destination  | Yes for cost model | Partial                            | Verify `ship_to_country` effect      |
| Rating                   | Yes (≥4.7)         | Often                              | If missing → NEEDS_MANUAL_VALIDATION |
| Review count             | Yes (≥20)          | Often                              | Same                                 |
| Order / volume count     | Yes (≥50)          | Often (`last_volume` style fields) | Confirm mapping                      |
| Variants                 | Preferred          | Partial                            | Detail APIs may be needed            |
| Images                   | Dashboard          | Usually                            |                                      |

**Live keyword probe status:** Working with the configured Affiliate credentials.

### Affiliate image search

- Method: `aliexpress.affiliate.image.search`
- Input: multipart `image_file_bytes`, JPEG compressed to at most 100KB.
- Retrieval strategy: merge and deduplicate image hits with every keyword-query result before matching and ranking.
- Runtime switch: `ALIEXPRESS_IMAGE_SEARCH_ENABLED=true`; leave disabled until the app key receives image-search permission.
- Optional Affiliate value: `ALIEXPRESS_APP_SIGNATURE`.

**Live probe (2026-07-31):** Still `InsufficientPermission` after Advanced API approval. Image search is a **separate** permission from Advanced (smart match / hot products). Keep the runtime switch off until AliExpress grants figure-search access.

### Advanced Affiliates API (Active)

Approved Advanced access unlocks:

| Method | Purpose | Runtime switch | Status |
| --- | --- | --- | --- |
| `aliexpress.affiliate.product.smartmatch` | Keyword / `product_id` recommendations | `ALIEXPRESS_SMARTMATCH_ENABLED` (default on) | Live OK |
| `aliexpress.affiliate.hotproduct.query` | Hot / high-commission catalog | `ALIEXPRESS_HOTPRODUCT_ENABLED` (default on) | Live OK |

**Live probe (2026-07-31):** smartmatch and hotproduct succeed with the current app key. Retrieval unions these hits with `product.query` (and image search when authorized). Keyword-only smartmatch can be noisy — hard match gates still apply.

## Rate limits

Public sources cite ~1,000–5,000 calls/day depending on app tier. **Verify in console** after approval. Cache search results (5–10+ minutes) in production.

## Approval requirements

1. Create Open Platform application
2. Enroll in Affiliate Program / obtain tracking ID
3. Pass app audit if required
4. Store App Key / Secret outside the repo

## Terms regarding automated access

AliExpress Terms of Use prohibit systematic retrieval of Site Content (robots, spiders, automatic devices, or manual processes) to compile a database without written permission. Affiliate Program permits designated API content for advertising use cases — better legal footing than HTML scraping.

## Provider strategy

| Provider                         | MVP      | Notes                                          |
| -------------------------------- | -------- | ---------------------------------------------- |
| `AliExpressOfficialApiProvider`  | Primary  | Affiliate/Open Platform                        |
| `AliExpressManualImportProvider` | Fallback | CSV / URL + user-supplied metrics              |
| `AliExpressPlaywrightProvider`   | Deferred | Compliance-gated; inspection only in Phase 0–1 |

## Recommendation

Block production scraping. Ship Affiliate adapter + manual import. Use Playwright MCP only to map UI fields vs API coverage.
