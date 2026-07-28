# MCP Smoke Checklist

Complete after copying `cursor-mcp.config.example.json` into Cursor MCP settings and supplying credentials.

- [ ] Playwright MCP lists tools and can open a blank page
- [ ] eBay `query_ebay_api` returns Browse search docs
- [ ] eBay `call_ebay_api` returns ≤5 active listings for a test keyword
- [ ] eBay Insights call recorded as allowed or denied
- [ ] gdrive MCP authenticates and reads a test spreadsheet
- [ ] Results pasted into `docs/research/ebay-mcp-evaluation.md`
