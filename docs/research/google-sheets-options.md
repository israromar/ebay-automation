# Google Sheets Options

**Date:** 2026-07-26

## Production

Use **Google Sheets API v4** directly via `GoogleSheetsApiExporter`.

- Auth: service account (preferred for server) or OAuth installed-app for single-user
- Scopes: minimum `https://www.googleapis.com/auth/spreadsheets` (and Drive only if file create needed)
- Store credentials outside repo; never commit JSON keys
- Features: append approved rows, dedupe by candidate fingerprint, store row/range id, retry, export audit

### Export columns

Timestamp, Scan ID, Search keyword, Product name, Product image, AliExpress URL, AliExpress product ID, AliExpress price, AliExpress shipping, Adjusted source cost, Rating, Review count, Order count, eBay URL, eBay item ID, eBay current price, Average completed-sale price, Sold during last 30 days, Active listing count, Match confidence, Estimated marketplace fees, Estimated total cost, Estimated profit, Net margin percentage, Return on cost percentage, Status, Rejection reason, Last verified timestamp, Data source

## Development MCP

Prefer `@isaacphi/mcp-gdrive` for Cursor inspection (read tabs, validate columns, insert test rows). Not a production dependency.

## CSV fallback

`CsvExporter` always available for local/offline export.
