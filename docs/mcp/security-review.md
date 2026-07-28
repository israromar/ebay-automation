# MCP Security Review Checklist

| MCP | Official? | Licence | Credentials | Network | Filesystem | Review result |
|-----|-----------|---------|-------------|---------|------------|---------------|
| @ebay/npm-public-api-mcp | Yes | Apache-2.0 | eBay client id/secret | api.ebay.com | None expected | Approved for **dev only** |
| @playwright/mcp | Microsoft | Apache-2.0 | None | Local browser | May write traces/screenshots | Approved for **dev only** |
| @isaacphi/mcp-gdrive | Community | MIT | Google OAuth | Google APIs | OAuth token dir | Approved for **dev only** after pin + scope review |
| YosefHayim/ebay-mcp | Community | Check repo | eBay user tokens | api.ebay.com | Local | **Deferred** — untrusted until full review |
| Browserbase MCP | Vendor | Check | API key | Browserbase cloud | Session artifacts | **Deferred** until pricing approved |
| Custom product-research MCP | First-party | Project | App session | localhost/app | None | Phase 5 — read-only default |

## Update strategy

Pin exact versions in committed example config. Re-review on upgrade. Never commit live secrets.
