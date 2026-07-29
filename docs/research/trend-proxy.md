# Trending research demand proxy

**Date:** 2026-07-29  
**Status:** Implemented for Research v1

## What “trending” means here

The Research module ranks **eBay Browse active-listing proxies**, not sold history:

- Seed keywords → Browse search
- Cluster similar titles (Jaccard)
- Filter by price band and active-listing count (competition signal)
- Opportunity score from cluster size, price spread, and distance from median price

Sold counts remain unavailable via public Browse API (see `sold-history-decision.md`). UI copy states this explicitly.

## Seed keyword library (US Top 50)

Operators no longer need to invent seeds from scratch. The Research page loads a **persisted US trending library**:

- Curated catalog: `src/lib/research/us-trending-keywords.ts` (Top 50 ranked generic product queries)
- DB tables: `TrendKeywordSnapshot` + `TrendKeyword` (survives restarts)
- `GET /api/research/trends` — latest snapshot (auto-seeds from catalog if empty)
- `POST /api/research/trends/refresh` — upserts a new snapshot from the curated module with dated source evidence

**Ranking method:** multi-source strength across Google Trends rising queries, Amazon/TikTok Shop translation into physical goods, and eBay-friendly Home/Electronics accessory demand. Keywords are generic (AE-sourcable), not branded SKUs.

**Refresh semantics:** Refresh Trends reloads the curated research snapshot into SQLite. It does **not** scrape live TikTok/Amazon/eBay sold APIs. Update the catalog module when the next research pass lands, then click Refresh.

Research runs remain capped at **10 keywords** per POST `/api/research`.

## Workflow

1. Pick seeds from the US trending library (or type/paste chips)
2. Operator runs research with keywords + criteria
3. Ideas land in `TrendIdea` queue (`DISCOVERED`)
4. Select / batch **Find AE match** → eBay-seeded `ProductCandidate` via AliExpress search + match scoring (+ optional DINOv2 visual score)
5. Demand still requires **manual validation** before `APPROVED`

## Extensibility

`TrendIdea.dataSource` defaults to `ebay_browse_proxy`. A licensed trend/sold-data provider can later write ideas with a different `dataSource` without changing the AE-match → candidate path. Live marketplace scrapers can later replace the curated refresh body while keeping the same DB/API/UI contract.
