# Invite a second operator (v1)

Invite-only SaaS: shared platform eBay/AliExpress keys, Supabase Auth, one personal workspace per user. No Stripe or BYOK in v1.

## Prerequisites

- Supabase project with Auth enabled (Email provider: password and/or magic link).
- App env configured (see `.env.example`):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `ALLOWED_EMAILS` — comma-separated allowlist
  - Shared `EBAY_*` / `ALIEXPRESS_*` keys (unchanged)
  - Optional: `MAX_RESEARCH_RUNS_PER_DAY` (default `20`) soft cap per workspace
  - Local/workers without Auth: `AUTH_DISABLED=true`

## Add the second user

1. **Allowlist** — add their email to `ALLOWED_EMAILS` and redeploy / restart:

   ```bash
   ALLOWED_EMAILS=you@example.com,other@example.com
   ```

2. **Create the Auth user** (pick one):
   - Supabase Dashboard → Authentication → Users → Add user (email + password), or
   - Send a magic link / invite from the Dashboard, or
   - Have them sign up on `/login` with the same email (only allowlisted emails can stay signed in).

3. **First login** — on success the app creates a `User` row (with `supabaseUserId`), a personal `Workspace`, and default `WorkspaceSettings`. They start with an empty workspace.

4. **Confirm isolation** — each user only sees their research ideas, candidates, settings, and automation runs. Shared API keys still power Browse / Affiliate calls.

## Preserve existing data (owner)

Before (or right after) enabling Auth for production data:

```bash
# Preview
DRY_RUN=1 OWNER_EMAIL=you@example.com npx tsx scripts/migrate-owner-workspace.ts

# Apply — attach orphan/legacy projects + trend/automation runs to your workspace
OWNER_EMAIL=you@example.com npx tsx scripts/migrate-owner-workspace.ts
```

Also apply Prisma migrations so `User.supabaseUserId` exists:

```bash
npx prisma migrate deploy
```

## Ops notes

- A third email not on `ALLOWED_EMAILS` is signed out and sent to `/login?error=not_allowed`.
- Soft caps (`MAX_RESEARCH_RUNS_PER_DAY`) count `TrendResearchRun` rows per workspace in the last 24h (manual research + automation research stages).
- Schedules remain global metadata in v1; job listings are filtered by workspace.
- Workers / CLI: set `AUTH_DISABLED=true` so `ensureDefaultWorkspace()` still works without a browser session.
