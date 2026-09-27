# Invite a second operator (v1)

Invite-only SaaS: shared platform eBay/AliExpress keys, Supabase Auth, one personal workspace per user. No Stripe or BYOK in v1.

## Prerequisites

- Supabase project with Auth enabled (Email provider: password and/or magic link).
- App env configured (see `.env.example`):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `ALLOWED_EMAILS` — comma-separated allowlist
  - Shared `EBAY_*` / `ALIEXPRESS_*` keys (unchanged)
  - Optional: `MAX_HUNTS_PER_DAY` (default `30`) soft cap per workspace
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

3. **First login** — on success the app creates a `User` row (with `supabaseUserId`), a personal `Workspace`, and default `HuntSettings`. They start with an empty workspace.

4. **Confirm isolation** — each user only sees their own hunts, tracked listings, sources and settings. Shared API keys still power Browse / Affiliate calls.

## Ops notes

- A third email not on `ALLOWED_EMAILS` is signed out and sent to `/login?error=not_allowed`.
- Soft cap (`MAX_HUNTS_PER_DAY`) counts hunts and Terapeak imports started per workspace in the last 24h.
- The daily snapshot cron covers every workspace's tracked listings.
- Local single-user mode: set `AUTH_DISABLED=true` to skip login and use one default workspace.
