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

1. Snapshots due listings (20 per eBay `getItems` call). This is roughly 1,000 listings per run, and listings snapshotted in the last 20 hours are skipped.
2. Recomputes demand tiers. It stops tracking ended or out-of-stock listings, and listings that sell under 25% of the threshold after 14 days.
3. Re-sources listings that have become winners, whose sources are older than 7 days, or whose last sourcing attempt failed.
4. Finishes hunts left running when a browser tab was closed.

If you track more listings than fit in one run, add a second cron entry (Pro plan), or run `npm run snapshot -- --all` from any machine or CI job with the same env.

### Function limits

- All API routes share a single catch-all function (`src/app/api/[...path]/route.ts`) with `maxDuration = 60`. That keeps the deploy within the Hobby plan's function limit.
- Hunts run in bounded steps of about 45 seconds. The browser polls `GET /api/hunts/:id`, and each poll processes one keyword, one batch of 20 Terapeak rows, or sources 6 listings.

## API quotas

- **eBay Browse:** the default quota is 5,000 calls a day. A keyword costs about 11 calls (1 search + 10 `getItems` batches). Daily tracking costs 1 call per 20 listings.
- **AliExpress Affiliate:** about 4 to 5 calls per sourced listing.
- `MAX_HUNTS_PER_DAY` (default 30) caps hunts plus imports per workspace.

## Security notes

- Never put the Supabase **service_role** key in `NEXT_PUBLIC_*` or send it to the browser.
- `/api/cron/*` is the only API path that skips the session check. It is protected by `CRON_SECRET`.
