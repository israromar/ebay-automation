# Trending research demand proxy

**Date:** 2026-07-28  
**Status:** Implemented for Research v1

## What “trending” means here

The Research module ranks **eBay Browse active-listing proxies**, not sold history:

- Seed keywords → Browse search
- Cluster similar titles (Jaccard)
- Filter by price band and active-listing count (competition signal)
- Opportunity score from cluster size, price spread, and distance from median price

Sold counts remain unavailable via public Browse API (see `sold-history-decision.md`). UI copy states this explicitly.

## Workflow

1. Operator runs research with keywords + criteria
2. Ideas land in `TrendIdea` queue (`DISCOVERED`)
3. Select / batch **Find AE match** → eBay-seeded `ProductCandidate` via AliExpress search + match scoring
4. Demand still requires **manual validation** before `APPROVED`

## Extensibility

`TrendIdea.dataSource` defaults to `ebay_browse_proxy`. A licensed trend/sold-data provider can later write ideas with a different `dataSource` without changing the AE-match → candidate path.
