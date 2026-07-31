# Autonomous Research Control Center

**Date:** 2026-07-30  
**Status:** Active

## Goal

One button runs the full research pipeline and pauses once for human approval before spreadsheet export.

## Workflow stages

1. `KEYWORDS` — load/refresh US trending keyword library, select top-N
2. `EBAY_DISCOVERY` — trend research via Browse API clusters
3. `SOURCE_MATCH` — AE retrieval + match + qualify + visual + demand probe (`ScanOrchestrator.matchTrendIdeas`)
4. `DECISION` — classify each candidate: `READY_FOR_APPROVAL` | `NEEDS_EVIDENCE` | `REJECTED`
5. `APPROVAL` — human gate (sold counts / confirmation)
6. `EXPORT` — CSV or Google Sheets for approved candidates only

## Hard gates (never bypassed by agents)

- Valid AE source (id, url, price, match confidence)
- Known AE shipping (missing ≠ `$0`)
- Source price below eBay and minimum net margin
- Demand verified before `APPROVED`
- Export requires AE id/url/price/shipping

## Capability fallbacks

| Capability                            | Fallback                       |
| ------------------------------------- | ------------------------------ |
| AE official API missing               | Manual fixture provider        |
| AE image search disabled/unauthorized | Keyword retrieval only         |
| eBay Insights denied                  | Demand marked `NEEDS_EVIDENCE` |
| Visual match disabled                 | Text match only                |
| Google Sheets missing                 | CSV export                     |

## Budgets

Configured per run:

- `topKeywords`, `productsPerKeyword`, `topIdeas`, `searchLimit`
- `maxRuntimeMs` (default 15 minutes)
- Optional `highQualityFilter` — when on:
  - eBay discovery raises `minEbayPriceMinor` (default $25)
  - SOURCE_MATCH uses stricter AE volume + net margin floors
  - DECISION rejects unless AE landed cost ≤50% of eBay, margin ≥15%, AE orders ≥100
  - AE “availability” uses `orderCount` / latest volume (API has no stock field)

## APIs

- `GET/POST /api/automation/runs`
- `GET /api/automation/runs/:id` (also advances running stages)
- `POST /api/automation/runs/:id/cancel|resume|approve|export`

## Worker

`npm run worker:tick` processes `AUTONOMOUS_RESEARCH` jobs. The UI also advances stages by polling `GET /runs/:id`.
