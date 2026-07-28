# eBay Official MCP — Detailed Evaluation

**Package:** `@ebay/npm-public-api-mcp`  
**Maintainer:** eBay (official)  
**Evaluation date:** 2026-07-26

## Tools and inputs

| Tool | Purpose | Typical inputs |
|------|---------|----------------|
| `query_ebay_api` | Natural-language search over eBay OpenAPI specs | Free-text discovery prompt |
| `call_ebay_api` | Execute live GET against eBay REST | Endpoint + params inferred by client |

## Auth model

- Application token: Client ID + Client Secret (+ optional scopes)
- User token: refresh token for private data
- Auto token refresh documented in README (~2 hours)

## Capabilities vs product needs

| Need | Supported via MCP? |
|------|--------------------|
| Browse search | Yes (if credentials work) |
| Item detail | Yes |
| Category/aspect metadata | Likely via Taxonomy/Browse specs |
| Completed / sold history | **Not unless Insights approved** |
| Suitable for Cursor research | Yes |
| Suitable as production runtime | **No** |

## Live probe results

| Probe | Result | Notes |
|-------|--------|-------|
| Browse search | PENDING — credentials not configured | |
| getItem | PENDING | |
| Insights item_sales/search | PENDING — expect restricted | |

Update this table after first live smoke test.
