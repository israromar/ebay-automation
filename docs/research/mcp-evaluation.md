# MCP Evaluation

**Date:** 2026-07-26  
**Session note:** At plan time, Cursor had `cursor-app-control`, `cursor-ide-browser`, and Harness (needsAuth). Playwright / eBay / Sheets MCPs were not installed.

## Official eBay MCP — `@ebay/npm-public-api-mcp`

| Item | Finding |
|------|---------|
| Repo | https://github.com/eBay/npm-public-api-mcp |
| Package | `@ebay/npm-public-api-mcp` (pin e.g. `1.0.9`) |
| Licence | Apache-2.0 |
| Tools | `query_ebay_api`, `call_ebay_api` |
| Prompt | `interpret_user_request` |
| Auth | Client ID/Secret; application or user token modes |
| Production REST | GET-only in production per README |
| Sandbox | Not officially supported in current release |
| Browse search | Yes, if OpenAPI includes Browse and credentials allow |
| Item detail | Yes via Browse getItem |
| Category/aspects | Via Taxonomy/Browse if specs loaded |
| Sold history | **Only if Insights is callable** — MCP does not add capability |
| Production use | **No** — prefer direct REST adapters |
| Security | Privileged; holds API secrets; pin version; never commit env |

### Smoke checklist (after credentials)

1. `query_ebay_api`: "Browse API item_summary search parameters"
2. `call_ebay_api`: search `q=portable rechargeable blender`, limit 5
3. `call_ebay_api`: attempt Marketplace Insights `item_sales/search` — expect deny/404/403 if restricted
4. Record tool schemas, sample fields, errors in `docs/research/ebay-mcp-evaluation.md`

## Community eBay Sell MCP — YosefHayim/ebay-mcp

- Focus: Sell API surface; optional Finding-based comps tooling
- Treat as **untrusted** until code/permissions/deps reviewed
- **Not** primary competitor demand source

## Playwright MCP — `@playwright/mcp`

- Official Microsoft; exploration and selector discovery
- **Not** production scheduler
- Translate workflows into app Playwright code

## Browserbase MCP

- Evaluate after local PoC; optional `BrowserbaseBrowserProvider`
- Document pricing before enabling costs

## Browser MCP (browsermcp)

- User Chrome session — interactive/dev only

## Google Sheets MCPs

| Candidate | Role |
|-----------|------|
| isaacphi/mcp-gdrive | Drive + Sheets read/update — preferred for Cursor testing |
| shionhonda/mcp-gsheet | Sheets-focused |
| xing5/mcp-google-sheets | Sheets-focused |

Production export uses **official Google Sheets API**, not community MCP.

## Custom product-research MCP

Phase 5: thin tools calling internal HTTP APIs — no duplicate scrape/profit logic. Read-only by default; writes require approval.

## Recommended Cursor config

See [docs/mcp/cursor-mcp.config.example.json](../mcp/cursor-mcp.config.example.json) and [docs/mcp/security-review.md](../mcp/security-review.md).
