# eBay / AliExpress Product Research Analyzer

Automation platform that compares AliExpress sourcing with eBay demand and profitability.

## Status

- **Phase 0 research:** see [`docs/research/`](docs/research/)
- **Sold history:** not available via public Browse API — MVP uses `NEEDS_MANUAL_VALIDATION` (see [`docs/research/sold-history-decision.md`](docs/research/sold-history-decision.md))
- **Production runtime does not require Cursor or MCP**

## Stack

Next.js 15, TypeScript, Prisma (SQLite locally; swap `DATABASE_URL` / provider for PostgreSQL in production), Tailwind, Zod, Playwright, Vitest.

## Why these packages

| Package                   | Why                                 | Alternative considered                     |
| ------------------------- | ----------------------------------- | ------------------------------------------ |
| Prisma                    | Typed schema + migrations           | Drizzle — similar; Prisma chosen for speed |
| Zod                       | Boundary validation                 | Manual checks — weaker                     |
| Playwright                | Browser tests + optional collectors | Puppeteer — Playwright preferred           |
| googleapis                | Official Sheets API                 | Community MCP — not for production         |
| @modelcontextprotocol/sdk | Internal Phase 5 MCP                | Skip if unused                             |
| Vitest                    | Fast unit tests                     | Jest — heavier                             |

## Quick start

```bash
cp .env.example .env
npm install
npx prisma db push
npx playwright install chromium
npm test
npm run poc
npm run dev
```

Open http://localhost:3000

## PoC

```bash
npm run poc
```

Writes `poc-output/poc-report.json`, CSV export, and a Playwright trace.

## MCP (Cursor, optional)

1. Copy [`docs/mcp/cursor-mcp.config.example.json`](docs/mcp/cursor-mcp.config.example.json) into Cursor MCP settings
2. Add eBay / Google credentials outside the repo
3. Follow [`docs/mcp/SMOKE_CHECKLIST.md`](docs/mcp/SMOKE_CHECKLIST.md)

Internal app MCP:

```bash
npm run dev   # terminal 1
npm run mcp   # terminal 2 — stdio server
```

Write tools require `RESEARCH_MCP_ALLOW_WRITES=true`.

## Definition of done (MVP)

- Keyword / AliExpress URL scan
- AliExpress qualification rules (configurable)
- eBay matching with confidence
- Honest sold-history reporting; no APPROVED without verified demand
- Transparent profit breakdown
- DB persistence + CSV / Sheets export
- Failed collections with reason codes
- Credentials never committed
- Production path independent of Cursor
