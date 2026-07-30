# eBay API Feasibility

**Date:** 2026-07-26  
**Status:** Research complete for public APIs; sold history UNCONFIRMED for new developers.

## Summary

Public eBay REST APIs support active listing search and item detail. Verified sold-history / completed-sales demand data requires the Limited Release Marketplace Insights API (or an approved alternative). Finding and Shopping APIs are decommissioned.

## APIs evaluated

### Browse API (confirmed)

| Endpoint                                 | Use                                              |
| ---------------------------------------- | ------------------------------------------------ |
| `GET /buy/browse/v1/item_summary/search` | Keyword search of active listings                |
| `GET /buy/browse/v1/item/{item_id}`      | Item detail (price, seller, shipping, condition) |
| `GET /buy/browse/v1/item/get_items`      | Bulk item detail                                 |

**Auth:** OAuth 2.0 client credentials (application token) for public data.  
**Sandbox:** Supported for Browse; verify scopes in developer console.  
**Rate limits:** Tier-dependent; application tokens often ~1,000 req/day on basic tier — confirm in [developer.ebay.com](https://developer.ebay.com/) dashboard.  
**Does NOT provide:** sold-in-last-30-days, completed sale prices, historical sold counts.

### Marketplace Insights API (unconfirmed / restricted)

- Path: `GET /buy/marketplace_insights/v1_beta/item_sales/search`
- Provides sold-item search / sales history
- **Limited Release** — select partners approved by eBay business units
- Buy API requirements / Application Growth Check may apply
- **Do not assume access** until a live call succeeds with project credentials

### Finding API

- Deprecated ~2024, decommissioned ~early 2025
- **Do not use**

### Sell APIs

- Inventory, orders, marketing for _our_ seller account
- Not a source of competitor sold history
- Useful later for listing automation (out of MVP)

### Feed / Buy / Catalog / Taxonomy

- Taxonomy: category trees and aspects — useful for matching
- Catalog: ePID / GTIN lookup — useful for matching
- Feed: bulk feeds — not required for MVP search workflow

### Search-by-image

- Not required for MVP; evaluate later if Browse/Commerce expose image search for the app key

## Authentication

| Mode                                   | When                            |
| -------------------------------------- | ------------------------------- |
| Application token (client credentials) | Public Browse search/detail     |
| User token (auth code + refresh)       | Sell APIs / private seller data |

Scopes: start with `https://api.ebay.com/oauth/api_scope` for Browse; add Buy/Sell scopes only as needed.

## Data retention / licence

- Comply with [eBay API License Agreement](https://go.developer.ebay.com/api-license-agreement)
- Respect rate limits; do not cache beyond permitted retention
- Do not redistribute raw eBay payloads as a competing dataset

## Decision table

| Data requirement      | Official API            | Browser extraction | Extension import | Third-party provider | Manual fallback |
| --------------------- | ----------------------- | ------------------ | ---------------- | -------------------- | --------------- |
| Current listing price | Yes — Browse            | Fragile / ToS risk | Possible         | Usually yes          | Yes             |
| Product URL           | Yes — Browse            | Yes                | Yes              | Yes                  | Yes             |
| Seller information    | Partial — Browse        | Yes                | Yes              | Often                | Yes             |
| Sold in last 30 days  | No unless Insights      | ToS/risk           | Possible         | Often (licence TBD)  | Yes             |
| Completed sales price | No unless Insights      | ToS/risk           | Possible         | Often                | Yes             |
| Listing competition   | Partial — result counts | Yes                | Possible         | Often                | Yes             |

## Production recommendation

Use **direct REST** `EbayBrowseApiProvider` in production. Use official eBay MCP only for Cursor-assisted discovery during development.
