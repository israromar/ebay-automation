# Winning Product Hunter (eBay → AliExpress)

One feature, done properly: find **eBay listings selling ≥ 20 units in the last 30 days** and pair each one with an **AliExpress source rated ≥ 4.7★** that still leaves a profit.

Both thresholds (and every other gate) are editable in **Settings**.

## How it works

```
keywords (typed, or the trending US list)
   │
   ▼  eBay Browse API: search ~200 fixed-price listings per keyword
   ▼  getItems (20 per call): lifetime sold + listing creation date
   ▼  30-day demand estimate → shortlist listings at or above the threshold
   ▼  AliExpress Affiliate API: product.query + hotproduct + smartmatch
   ▼  hard gate: rating ≥ 4.7, reviews, orders, title match, landed cost < eBay, margin
   ▼  top 3 sources saved per listing
   ▼  daily cron: snapshot lifetime sold again → demand becomes measured
```

### Where "sold in the last 30 days" comes from

eBay has no public API for 30-day sold counts. Marketplace Insights is Limited Release, and since July 2026 sold/completed search results require sign-in. The app therefore uses two sources, and every result carries a badge saying which one it came from.

**1. Hybrid tracker (automatic, official Browse API only).** The tracker records each listing's lifetime `estimatedSoldQuantity` once a day.

| Tier          | Computation                                                                                                | When                                           |
| ------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **Estimated** | lifetime ÷ listing age × 30                                                                                | Day 0. Used to shortlist only, never a winner. |
| **Projected** | (latest − first snapshot) ÷ days × 30                                                                      | After 3+ days of snapshots                     |
| **Verified**  | Difference over 30 days of snapshots, **or** the listing is younger than 30 days (lifetime = last 30 days) | Day 30, or immediately for new listings        |

**2. Terapeak import (manual, verified immediately).** In Seller Hub → Research → Product research, open the **Sold** tab. Copy the table (or export it) and paste or upload it on `/import`. Each row is linked to a live eBay listing by item ID or title. The row is marked Verified and then tracked and sourced like any other listing.

A **winner** has Projected or Verified demand at or above the threshold, **and** at least one AliExpress source that passed the gate.

### AliExpress gate

A source must pass **all** of these:

- Rating ≥ 4.7. A missing rating is a fail.
- Reviews ≥ 20.
- Orders ≥ 50.
- Title-match confidence ≥ 70. This reuses the matcher in `src/lib/domain/matching.ts`: pack-size, accessory and context checks.
- Landed cost below the eBay price.
- Net margin ≥ 10% after eBay fees.

Notes on the numbers:

- The Affiliate API returns `evaluate_rate` as a percentage of positive feedback. It is converted as `% ÷ 20`, so 94% becomes 4.7★.
- The Affiliate API does not return shipping. The **AE shipping estimate** from Settings is used instead and labelled "est." in the UI.

## Stack

Next.js 15 (App Router), TypeScript, Prisma on Supabase Postgres, Tailwind + shadcn/base-ui, Zod, Vitest. Auth is Supabase with an email allowlist, or `AUTH_DISABLED=true` for local single-user mode.

## Quick start

```bash
cp .env.example .env      # DATABASE_URL, DIRECT_URL, eBay + AliExpress keys, CRON_SECRET
npm install
npx prisma migrate deploy
npm run dev               # http://localhost:3000
```

Run the tracker locally, or from any cron host:

```bash
npm run snapshot          # one ~50s pass
npm run snapshot -- --all # until every due listing is snapshotted
```

After pulling changes that touch `prisma/schema.prisma`, **stop `npm run dev`**, run `npx prisma generate && npx prisma migrate deploy`, and start it again. A running dev server keeps the old Prisma client loaded, and the API says so.

There is **no fixture or sample data**. Without API keys, hunts stop with a clear configuration error.

## Scripts

| Command                           | What                                                                      |
| --------------------------------- | ------------------------------------------------------------------------- |
| `npm run dev` / `build` / `start` | Next.js                                                                   |
| `npm test`                        | Vitest: demand tiers, Terapeak parser, sourcing gate, matching, providers |
| `npm run lint` / `typecheck`      | ESLint / `tsc --noEmit`                                                   |
| `npm run snapshot`                | Daily sold-snapshot tracker (same code as the Vercel cron)                |
| `npm run db:migrate`              | `prisma migrate deploy`                                                   |

## Layout

```
src/app/                   /            Hunt: run hunts, results table, CSV export
                           /listings/[id] demand chart, top 3 AE sources, profit breakdown
                           /import      Terapeak paste/CSV import
                           /settings    thresholds and API status
src/app/api/[...path]      single catch-all API router (Vercel Hobby function limit)
src/lib/api-handlers/      hunts, listings, export, terapeak import, settings, cron
src/lib/services/          hunt.ts (bounded steps), tracker.ts (cron), sourcing.ts, tracking.ts
src/lib/domain/            demand.ts, sourcing.ts, terapeak-import.ts, matching.ts, profit.ts (pure, unit-tested)
src/lib/providers/         ebay-browse.ts, aliexpress-official.ts
```

## Deploy

See [`docs/deploy-supabase-vercel.md`](docs/deploy-supabase-vercel.md).
