# UI revamp plan (Stitch → Next.js)

**Status:** Stitch-fidelity pass live in-app (shadcn + media + denser Overview / Research / Candidates Match Review / auth). APIs unchanged.

## Implemented

- shadcn/ui + Inter / JetBrains Mono + Precision Analytical System tokens
- AppShell: Pulse Analytics sidebar, search → `/research?seed=`, marketplace header, media strip
- Auth: split-screen login with HQ hero (`/public/media/*`)
- Overview: KPI row, activity bars, recent analyses + watchlist + auto-research CTA
- Research: seed from header search, empty-state media, insight cards
- Candidates list: Discovered Products density (thumbs, refresh, empty hero)
- Candidate detail: Match Review 3-column + profit / qualification cards
- Automation / Scans / Schedules / Settings: token remapped; Automation header Stitch-styled

## Still optional polish

- Automation runs table closer to Automations Dashboard mock
- One-off Stitch screen sync later if desired (one screen at a time)

**Stitch project:** [Ebay Pulse Analytics](https://stitch.withgoogle.com/) · `projects/14116006011830868692`  
**Theme:** Precision Analytical System · light `#f7f9fb` · primary `#2563eb` / `#004ac6` · Inter + JetBrains Mono

---

## Why Stitch edits felt stuck

`edit_screens` / `generate_screen_from_text` call Gemini to **regenerate full desktop HTML + screenshots**. Each screen often takes **2–5+ minutes**. A sequential batch of 5 edits can take **15–25 minutes** with little stdout until each call returns. Prefer **one screen at a time** when updating Stitch.

---

## Existing Stitch screens (detail)

| Stitch screen                    | What it shows                                                                     | Maps to app                        | Fit                                                                                         |
| -------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------- |
| **Overview Dashboard**           | KPI cards, activity chart, recent analyses table, watchlist, “auto-research” rail | `/`                                | Strong shell; metrics are enterprise-inflated (12k products, competitors). Needs real KPIs. |
| **Product Research**             | Filters + dense ideas table + insight cards                                       | `/research`                        | Closest to core flow; filters/columns oversell 30d sold / UPC.                              |
| **Product Analyzer**             | Paste URL → score gauge, opportunity matrix, profit, supplier, risk               | Partial `/candidates/[id]` + scans | Nice; VeRO/trademark widgets not in product.                                                |
| **Discovered Products**          | Automation-scoped eBay product table                                              | `/candidates` list                 | Good table pattern; rename nav to Candidates.                                               |
| **Product Match Review**         | eBay ↔ AE side-by-side, confidence, profit, approve/reject                        | `/candidates/[id]`                 | Best match for detail page.                                                                 |
| **Automations Dashboard**        | Multi-automation ops metrics + runs table                                         | `/automation`                      | Overbuilt vs single autonomous-run pipeline.                                                |
| **Create Automation - Keywords** | Keyword seed wizard                                                               | `/automation` start form           | Keep as start-run modal/page.                                                               |
| **Saved Products**               | Saved/watchlist grid                                                              | None yet (or subset of candidates) | **Defer** — not a first-class route.                                                        |
| **Competitor Tracker**           | Competitor monitoring                                                             | None                               | **Out of v1** — don’t implement.                                                            |
| **Integrations**                 | eBay/AE/Sheets + Slack/webhooks/API keys                                          | `/settings` + env                  | Needs rewrite: **shared platform keys**, no BYOK/Slack.                                     |

**Missing in Stitch (should add later, one-by-one):** Sign in · Workspace settings (qualification rules) · Schedules · Scans history · Login empty states.

**Nav mismatch:** Stitch uses “eBay Pro Insight / ProOps + Upgrade Plan”. App should be **Product Research Analyzer** with: Overview · Automation · Research · Candidates · Scans · Schedules · Settings · Sign out.

---

## UI library research (recommendation)

Stack today: **Next 15 App Router · React 19 · Tailwind v4 · ad-hoc components**.

| Option                           | Pros                                                                                                                          | Cons                                                | Fit                                 |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------- |
| **shadcn/ui + Radix + Tailwind** | Owns source; matches Stitch “fintech light” look; RSC-friendly; tiny bundle; AI/codegen friendly; tables/dialogs/forms mature | Not a single npm package — CLI copy-in              | **Best fit**                        |
| **+ Tremor / Recharts**          | KPI cards + charts for Overview                                                                                               | Extra dep; use only on Overview                     | Optional companion                  |
| **Mantine**                      | Huge component set, fast forms                                                                                                | Different visual language; less Tailwind-native     | Good for speed, weaker Stitch match |
| **MUI / Ant Design**             | Enterprise tables                                                                                                             | Heavy; Material/Ant look fights Stitch blue fintech | Avoid for greenfield shell          |
| **Chakra / HeroUI**              | Nice DX                                                                                                                       | Less ideal for dense data tables                    | Secondary                           |

**Recommendation:** Adopt **shadcn/ui** (Button, Input, Table, Dialog, Tabs, Badge, Card, Dropdown, Sheet, Toast) + **lucide-react** icons + map Stitch tokens to CSS variables. Add **Recharts** only if Overview keeps a chart. Do **not** rip out pages wholesale — wrap new primitives under `src/components/ui/` and migrate route-by-route.

---

## Non-breaking implementation phases

### Phase 0 — Foundations (no user-facing risk)

1. Add fonts (Inter + JetBrains Mono).
2. Map Stitch tokens → `globals.css` CSS variables (keep teal fallback until cutover).
3. Install shadcn CLI + base components only.
4. Build `AppShell` (sidebar + header) behind a feature flag **or** replace `app-shell.tsx` carefully while keeping the same links.

**Exit:** Visual tokens + shell; all pages still work.

### Phase 1 — Shell + Overview (`/`)

- New sidebar/header matching Stitch.
- Overview KPIs wired to existing `/api/overview` (no fake metrics).
- Keep data fetching logic; restyle only.

### Phase 2 — Research (`/research`)

- Restyle controls/table/actions; **do not** change API contracts (`/api/research*`).
- Clarify “life est” vs 30d sold in UI copy.

### Phase 3 — Candidates list + detail

- `/candidates` ← Discovered Products pattern.
- `/candidates/[id]` ← Match Review pattern (profit, demand, fetch sold history).

### Phase 4 — Automation

- `/automation` ← Automations Dashboard + Create Keywords (simplified to real run model).

### Phase 5 — Settings / Schedules / Scans / Login

- Settings: qualification rules (existing API).
- Integrations card strip: read-only platform connection status (env presence), not secrets UI.
- Schedules + Scans: restyle existing pages.
- Login: align with Stitch once generated.

### Explicit non-goals (don’t break / don’t build)

- Competitor Tracker, Saved Products as separate IA, Stripe/Upgrade, BYOK vault, Slack/webhooks.
- No API route redesign in the UI pass.
- No Prisma schema changes for UI.

### Safety rules

- One route PR / one phase at a time.
- Keep `AUTH_DISABLED` + API catch-all intact.
- Visual match optional; DINOv2 stays lazy-loaded.
- Screenshot regression: manual check of login → research → match → automation.

---

## Suggested next actions (pick one)

1. **Approve library:** shadcn/ui (+ optional Recharts) → start Phase 0.
2. **Stitch:** regenerate **one** screen (e.g. Overview) and verify in dashboard before more.
3. **Skip Stitch regen** and implement Phase 0–1 from the audited screenshots we already have.
