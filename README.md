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

eBay has no public API for 30-day sold counts. Marketplace Insights is Limited Release, and since July 2026 sold/completed search results require sign-in. The app therefore uses three sources, and every result carries a badge saying which one it came from.

**1. Hybrid tracker (automatic, official Browse API only).** The tracker records each listing's lifetime `estimatedSoldQuantity` once a day.

| Tier          | Computation                                                                                                | When                                           |
| ------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **Estimated** | lifetime ÷ listing age × 30                                                                                | Day 0. Used to shortlist only, never a winner. |
| **Projected** | (latest − first snapshot) ÷ days × 30                                                                      | After 3+ days of snapshots                     |
| **Verified**  | Difference over 30 days of snapshots, **or** the listing is younger than 30 days (lifetime = last 30 days) | Day 30, or immediately for new listings        |

**2. Terapeak import (manual, verified immediately).** In Seller Hub → Research → Product research, open the **Sold** tab. Copy the table (or export it) and paste or upload it on `/import`. Each row is linked to a live eBay listing by item ID or title. The row is marked Verified and then tracked and sourced like any other listing.

**3. Hunter Companion Chrome extension (automatic, exact, verified immediately).** See [below](#hunter-companion-chrome-extension). It reads each listing's `/bin/purchaseHistory` page with your signed-in eBay session and counts every purchase in the last 30 days. Badge: **eBay history**. It takes precedence over the other two sources for 7 days after each check.

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

## Source finder (eBay link → AliExpress source)

Paste any eBay listing link (built for **ebay.co.uk**; .com, .de, .fr, .it, .es, .com.au and .ca also work) on `/source-finder`. You get the AliExpress products most likely to be the same item, each with a **confidence score**. The closest candidates are always shown, even when none is a confident match.

**How a lookup works (about 5 to 25 seconds):**

1. **Read the listing.** The eBay Browse API is called with the listing's own marketplace (`EBAY_GB`, GBP), so prices stay in the local currency. Multi-variation links (`?var=`) are resolved through the item group. The lookup reads the title, price, up to 4 photos and the item specifics.
2. **Search AliExpress.** Up to 3 title queries, plus the item specifics (`Type`/`Colour`), smartmatch and hot products are sent in the local currency and ship-to country. AliExpress image search is added when `ALIEXPRESS_IMAGE_SEARCH_ENABLED=true`.
3. **Score titles.** Every candidate gets a text score from the existing matcher (pack size, brand, accessory and context checks).
4. **Compare photos.** The top 30 get an **image fingerprint** comparison (`src/lib/domain/image-fingerprint.ts`: background trimmed, dHash with mirror, colour histogram, edge/shape histogram). It's free, with no AI model or API key. It's very strong when both listings reuse the same factory photo (common in dropshipping) and weaker for lifestyle shots from other angles, so the image score is shown separately from the title score.
5. **Combine** (`src/lib/domain/source-confidence.ts`): 55% title + 45% image, with boosts for the same photo and the same pack size. Accessories and wrong pack sizes are capped at 25. A missing image means 90% of the title score. Tiers: **High ≥ 75**, **Medium 50–74**, **Low < 50**.

**What each candidate shows:** rating, orders, landed cost, estimated profit and margin in the listing's currency, whether it passes your sourcing rules, and reason chips ("Same photo", "Different colour", "Accessory, not the product", and so on).

**Saving and sharing:** every lookup is saved (History), can be re-run, and exports to CSV. The Chrome extension adds a **Find AliExpress source** button on eBay item pages across these sites.

**Limits:** `MAX_SOURCE_LOOKUPS_PER_DAY` (default 60 per workspace). Image downloads only go to AliExpress and eBay image hosts.

## Hunter Companion Chrome extension

The extension uses the same mechanisms as two public extensions, rebuilt for this app; none of their code is used.

- **eBay Sold History Button** mechanism: eBay's per-listing purchase-history page (`https://www.ebay.com/bin/purchaseHistory?item=<id>`) lists every recent purchase with date, price and quantity. It only renders for signed-in users, which is why the server can't fetch it.
- **Skip AliExpress Bundle Deals** mechanism: Bundle Deals / SuperDeals / "Pick 3" pages (`/ssr/…` or `/gcp/…?productIds=<id>:<sku>`) hide or inflate the single-item price, so they are redirected to `https://www.aliexpress.com/item/<id>.html`.

**What it does:**

- **Background verification.** Every minute, while Chrome is open, it leases a few listings from the app's queue (`GET /api/extension/queue`). The queue holds listings near or above your sold threshold that haven't been checked in 3 days. For each one it opens the purchase-history page with your eBay cookies and posts the HTML to `POST /api/extension/purchase-history`.
- **Parsing on the server.** The app parses the page (`src/lib/domain/ebay-purchase-history.ts`), so a change in eBay's markup is fixed by redeploying the app, not by updating the extension. The listing becomes **VERIFIED** with the exact count. A new winner without sources is sourced on AliExpress immediately.
- **Pacing and pausing.** It checks one listing every 4 to 7 seconds, with a daily cap (300 by default; `EXTENSION_DAILY_CAP` on the server, and a setting in the extension). On any eBay sign-in page or bot check it **pauses for 6 hours**, shows a red `!` badge and waits for you to press Resume. It never tries to get around either.
- **eBay item pages.** A panel shows the exact sold/30d, the best AliExpress source and its profit, with **Verify now** and **Track in Hunter** buttons.
- **AliExpress bundle pages.** They are redirected to the single-item page (a declarativeNetRequest rule), and bundle links in search results are rewritten. The server applies the same rule to every stored source (`src/lib/domain/aliexpress-url.ts`), and the affiliate link is kept separately.

**Install (load unpacked):** Settings → **Hunter Companion** → download the zip, unzip it, open `chrome://extensions`, turn on Developer mode, click **Load unpacked** and pick the folder. Then create a token on the same card and paste it in the extension's Options. Stay signed in to eBay in that Chrome profile.

**Security:** the token is a per-workspace bearer credential. Only its SHA-256 is stored, and it can be revoked in Settings. Your eBay cookies never leave the browser; only the page HTML for listings the app asked about is sent, and it is parsed and discarded.

**Risk:** reading eBay pages automatically, even with your own account and at human pace, is against eBay's user agreement. Keep the daily cap modest.

**Build:** `npm run ext:build` writes `extension/dist` and `public/hunter-companion.zip`. It runs automatically before both `npm run dev` and `npm run build`. The Settings download goes through `/api/settings/extension/download`, which rebuilds the zip on demand in development and returns a clear error in production if the deploy didn't build it. The app URL baked in as the default comes from `HUNTER_APP_URL`, then Vercel's production URL, then `http://localhost:3000`; the Options page can change it.

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
| `npm run ext:build`               | Build the Chrome extension and `public/hunter-companion.zip`              |

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
extension/src/             Chrome extension: background.ts (queue), content-ebay.ts, content-aliexpress.ts, popup, options
extension/static/          manifest assets, rules.json (bundle-deal redirect), popup/options HTML
scripts/build-extension.ts esbuild bundle + manifest + icons + zip
```

## Deploy

See [`docs/deploy-supabase-vercel.md`](docs/deploy-supabase-vercel.md).
