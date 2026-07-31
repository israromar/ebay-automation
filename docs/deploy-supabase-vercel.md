# Supabase + Vercel deployment

## Project

- Supabase URL: `https://iizsdqqfmqfiogxhnwaq.supabase.co`
- ORM: Prisma → Postgres (Supabase)
- App DB access is **server-side only** via Prisma. Public Data API roles are revoked; RLS is enabled with no anon policies.

## Local `.env`

1. Open [Database settings](https://supabase.com/dashboard/project/iizsdqqfmqfiogxhnwaq/settings/database).
2. Copy **Transaction pooler** URI → `DATABASE_URL` and append `?pgbouncer=true` if missing.
3. Copy **Direct** URI → `DIRECT_URL` (port `5432`, no pgbouncer).
4. Replace `[YOUR-PASSWORD]` with the database password.
5. Run:

```bash
npx prisma generate
npm run dev
```

Schema is already applied on Supabase via MCP migrations. Use `npx prisma migrate deploy` only after linking `DIRECT_URL` if you add new Prisma migrations later.

## Vercel

1. Import this Git repo in Vercel.
2. Set the same env vars as `.env` (at least `DATABASE_URL`, `DIRECT_URL`, eBay/AliExpress keys you need).
3. Build command: `prisma generate && next build` (or rely on `postinstall` if added).
4. Deploy.

### Vercel caveats for this app

- **Hobby plan (12 serverless functions):** API routes are consolidated into a single catch-all (`src/app/api/[...path]/route.ts`) so deploys stay under the limit. Public URLs are unchanged (`/api/research`, etc.).
- DINOv2 / ORT and long automation runs are heavy for default serverless timeouts.
- Prefer keeping `npm run worker:tick` on a small always-on host or Vercel Cron + short ticks until a dedicated worker exists.
- File-based SQLite (`dev.db`) is no longer used.
- Set Auth env on Vercel too: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ALLOWED_EMAILS`.

## Security notes

- Never put the Supabase **service_role** key in `NEXT_PUBLIC_*` or the browser.
- Anon/publishable keys are optional here; Prisma does not need them for API routes.
- After schema changes, re-check advisors in the Supabase dashboard / MCP `get_advisors`.
