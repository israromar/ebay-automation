# Supabase + Vercel deployment

## Database (Supabase)

- Supabase URL: `https://iizsdqqfmqfiogxhnwaq.supabase.co`
- ORM: Prisma → Postgres. The app reaches the database **server-side only**. RLS is enabled on every table with no anon/authenticated policies, so the public Data API exposes nothing.

1. Open [Database settings](https://supabase.com/dashboard/project/iizsdqqfmqfiogxhnwaq/settings/database).
2. Copy the **Transaction pooler** URI into `DATABASE_URL` and add `?pgbouncer=true` if it's missing.
3. Copy the **Direct** URI (port `5432`) into `DIRECT_URL`.
4. Apply migrations:

```bash
npx prisma migrate deploy
```

> `20260927120000_single_feature_hunter` **drops the legacy research/automation tables**: candidates, trend ideas, automation runs, schedules and so on. It then creates `HuntSettings`, `Hunt`, `TrackedListing`, `SoldSnapshot`, `SourceMatch` and `CronState`. Users and workspaces are kept. Take a Supabase backup first if you need the old data.

## Vercel

1. Import the repo in Vercel. The build command is the default (`postinstall` runs `prisma generate`).
2. Set the environment variables from `.env.example`:
   - `DATABASE_URL`, `DIRECT_URL`
   - `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`
   - `ALIEXPRESS_APP_KEY`, `ALIEXPRESS_APP_SECRET`, `ALIEXPRESS_TRACKING_ID` (+ `ALIEXPRESS_APP_SIGNATURE` if your app has one)
   - `CRON_SECRET` (for example `openssl rand -hex 32`)
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ALLOWED_EMAILS`
3. Deploy.

### Daily tracker cron

`vercel.json` schedules `GET /api/cron/snapshot` once a day. Vercel sends `Authorization: Bearer $CRON_SECRET`; any other caller gets `401`.

Each run has a budget of about 50 seconds. In that time it:

1. Snapshots due listings, about 1,000 per run. Listings snapshotted in the last 20 hours are skipped.
2. Recomputes demand tiers. It stops tracking ended or out-of-stock listings, and listings that sell under 25% of the threshold after 14 days.
3. Re-sources listings that have become winners, whose sources are older than 7 days, or whose last sourcing attempt failed.
4. Finishes hunts left running when a browser tab was closed.

If you track more listings than fit in one run, add a second cron entry (Pro plan), or run `npm run snapshot -- --all` from any machine or CI job with the same env.

### Companion extension

- `npm run build` (and `npm run dev`) run `npm run ext:build` first, so every deploy serves an up-to-date zip from Settings → Hunter Companion (`/api/settings/extension/download`). If a custom build command skips it, the download shows an error saying so. The app URL baked into it is `HUNTER_APP_URL` if set, otherwise Vercel's `VERCEL_PROJECT_PRODUCTION_URL`.
- Migration `20260927150000_companion_extension` adds `ExtensionToken` (RLS on) and purchase-history columns. Run `npx prisma migrate deploy`.
- `/api/extension/*` skips the session middleware and is authenticated by the extension's bearer token.
- Optional: `EXTENSION_DAILY_CAP` (default 300 checks per workspace per day).

### Source finder

- Migration `20260928090000_source_lookup` adds `SourceLookup` (RLS on). Run `npx prisma migrate deploy`.
- A lookup runs inside one API request (45 s budget, usually 5 to 25 s). It uses `sharp` for image fingerprints, which already ships with the app.
- Optional: `MAX_SOURCE_LOOKUPS_PER_DAY` (default 60).

### Function limits

- All API routes share a single catch-all function (`src/app/api/[...path]/route.ts`) with `maxDuration = 60`. That keeps the deploy within the Hobby plan's function limit.
- Hunts run in bounded steps of about 45 seconds. The browser polls `GET /api/hunts/:id`, and each poll processes one keyword, one batch of 20 Terapeak rows, or sources 6 listings.

## API quotas

- **eBay Browse:** the default quota is 5,000 calls a day, and each `getItem` counts as one call.
  - The batch `getItems` method (20 listings per call) is restricted to approved Buy API partners. Standard keysets get `403 Insufficient permissions`; the app detects this and switches to single `getItem` calls automatically.
  - **Without batch access:** a keyword costs about 101 calls (1 search + 100 listings), and tracking costs 1 call per listing per day. For example, 20 keywords a day plus 2,000 tracked listings uses about 4,000 calls. Lower `EBAY_DETAILS_PER_KEYWORD` or ask eBay for a higher quota (Application Growth Check) if you need more.
  - **With batch access:** a keyword costs about 11 calls, and tracking costs 1 call per 20 listings.
- **AliExpress Affiliate:** about 4 to 5 calls per sourced listing.
- `MAX_HUNTS_PER_DAY` (default 30) caps hunts plus imports per workspace.

## Security notes

- Never put the Supabase **service_role** key in `NEXT_PUBLIC_*` or send it to the browser.
- `/api/cron/*` is the only API path that skips the session check. It is protected by `CRON_SECRET`.
