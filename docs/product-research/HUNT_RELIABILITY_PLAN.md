# Hunt reliability and product-discovery recovery plan

Date: 8 November 2026

## Implementation status

Completed in the first recovery slice:

- status reads are non-mutating and hunt advancement is an explicit command;
- the dashboard retries transient failures indefinitely with capped backoff;
- discovery advances before sourcing so supplier work cannot starve the keyword cursor;
- discovery uses idempotent listing upserts and rejects non-GBP results;
- only trusted GBP demand inside the configured price band enters automatic sourcing;
- eBay and AliExpress requests have bounded timeouts;
- zero-source outcomes retain and display rejection summaries;
- legacy settings are detected in the Settings UI;
- the affected stale hunt was stopped and its workspace received the reviewed UK defaults.

The leased database job models, hunt/listing join table, full supplier-attempt table, and three-seller product clusters remain subsequent migrations.

## Executive diagnosis

The system is finding eBay listings, but the hunt orchestration and qualification pipeline prevent it from finishing or explaining its results. This is not primarily a “no products exist” problem.

The current active `automotive` hunt has `cursor = 0` and `scannedCount = 0`, yet many listings already reference that hunt and several sourcing batches appear in its log. Discovery therefore committed listing mutations before the request completed the hunt-progress update. The next request prioritizes pending sourcing over keyword discovery, so the hunt can repeatedly source partial results while remaining at `0 / 1`.

The dashboard drives work by repeatedly calling a mutating `GET /api/hunts/:id`. A slow provider call can exceed the serverless request window. After five network failures, the browser runner stops polling permanently, but the database still reports `RUNNING`. Reloading the page starts another step, which explains large gaps between log entries.

Separately, all observed sourcing attempts produced zero accepted suppliers. Rejected candidates and their gate reasons are not persisted, so the dashboard cannot distinguish “AliExpress returned nothing” from “100 candidates failed price,” “rating missing,” “wrong pack,” or another specific rule.

## Confirmed evidence

### Orchestration

- Active hunt: `RUNNING`, `cursor 0 / 1`, no committed scan count.
- The same hunt has partially created or reassigned listings and multiple sourcing log entries.
- Provider and listing writes are not part of one resumable, idempotent unit of work.
- The browser is the job runner; closing, sleeping, timing out, or losing five requests strands the hunt.
- A `GET` request changes database state, making retries and caches unsafe.

### Data quality

- The screenshot workspace still has legacy settings: 27 sold, 4.7 rating, 30 supplier orders, 20% margin, and an £8–£150 price band.
- The active hunt contains both USD and GBP listings because existing workspace listings are reassigned to the newest hunt.
- Several candidates are below the required £50 selling price.
- A generic `automotive` keyword returned irrelevant or weak candidates, including a die-cast transporter model.
- Estimated-demand listings are sourced before their demand is trusted.
- Three-distinct-seller aggregation is not implemented, so current “winner” logic cannot satisfy the final qualification specification.

### Supplier sourcing

- Database: 178 tracked listings and zero accepted `SourceMatch` rows.
- Successful zero-result sourcing is recorded only as `sourcedAt`; rejected candidates are discarded.
- There is no rejection funnel by rating, orders, shipping, match, cost, or margin.
- The current adapter converts AliExpress positive feedback into a five-star-like number. Full qualification must preserve the original metric and scale instead.
- Local environment lacks AliExpress credentials, so production sourcing cannot be reproduced locally with the current configuration.

## Recovery architecture

### 1. Make the server the durable job runner

Replace client-driven mutating polling with a database-backed state machine.

`POST /api/hunts` creates the hunt and its keyword jobs. `GET /api/hunts/:id` becomes read-only. A cron/worker endpoint leases due jobs and advances them independently of an open browser.

Recommended states:

```text
Hunt: QUEUED → RUNNING → COMPLETED | FAILED | CANCELLED
KeywordJob: QUEUED → DISCOVERING → DISCOVERED → COMPLETE | RETRY_WAIT | FAILED
ListingSourceAttempt: QUEUED → SEARCHING → GATED → COMPLETE | RETRY_WAIT | FAILED
```

Every job stores `attempts`, `leaseOwner`, `leaseExpiresAt`, `heartbeatAt`, `nextAttemptAt`, and a structured error. A worker may reclaim an expired lease safely.

### 2. Make each step idempotent

- Create one durable keyword row per normalized keyword.
- Upsert discoveries using marketplace + listing ID without changing historical hunt ownership.
- Add a `HuntListing` join table instead of overwriting `TrackedListing.huntId`.
- Mark a keyword `DISCOVERED` only after its result snapshot is persisted.
- Use a stable source-attempt key from listing ID + rules version + provider query version.
- Retrying a request must not duplicate listings, sale evidence, or source attempts.

### 3. Bound external work

- Add `AbortSignal.timeout` to every eBay, AliExpress, and image request.
- Give one worker invocation a smaller budget than the hosting limit.
- Process a fixed number of provider pages/candidates per lease.
- Store pagination cursors so continuation does not repeat completed pages.
- Apply exponential backoff with jitter only to retryable failures; fail configuration and authorization errors immediately.

### 4. Separate discovery, verification, and qualification

Discovery may use estimates to form a watchlist. It must not imply qualification.

```text
DISCOVERED
  → DEMAND_ESTIMATED
  → DEMAND_VERIFIED
  → SUPPLIER_MATCHED
  → COMPETITORS_VERIFIED
  → QUALIFIED | REJECTED | NEEDS_VERIFICATION
```

Only trusted demand should enter the expensive supplier queue by default. Estimated candidates may be sourced at lower priority when explicitly enabled.

## Implementation phases

### Phase 0 — Restore truthful operation

1. Stop the stale active hunt or mark it `FAILED_STALE`; do not leave it indefinitely running.
2. Display the persisted workspace settings and a visible “legacy settings” warning.
3. Add an explicit migration action that applies £50, 500 product orders, 4.5 rating, and 20% target margin to the selected workspace.
4. Prevent GBP hunts from reading or reassigning USD listings.
5. Rename current result status from `Winner` to `Candidate` until three-seller verification exists.

Release gate: a new UK hunt contains only GBP/EBAY_GB listings inside the configured price band, and stale work becomes visible within two minutes.

### Phase 1 — Durable orchestration

1. Add `HuntKeywordJob`, `HuntListing`, and `ListingSourceAttempt` models.
2. Make hunt status reads non-mutating.
3. Add a leased cron/worker processor with heartbeat and retry classification.
4. Add a stale-job watchdog.
5. Change the browser to observe progress only; reconnect indefinitely with capped backoff.
6. Preserve cancellation between every bounded unit of work.

Release gate: start a hunt, close the browser, and verify it completes. Kill a worker mid-keyword and verify the next worker resumes without duplicates.

### Phase 2 — Supplier observability and recovery

Persist one record for every supplier search attempt:

- provider request and query version;
- number returned, valid, deduplicated, and gated;
- original rating metric, value, and scale;
- product orders, price, shipping evidence, and variation;
- match score and hard mismatch reasons;
- profitability breakdown;
- rejection reasons and provider warnings;
- source reference and retrieval time.

Add a dashboard funnel:

```text
150 returned → 112 valid → 64 product matches → 18 reliable suppliers
→ 7 ship to UK → 3 profitable → 1 accepted
```

Release gate: every zero-source listing explains exactly why no candidate passed, and a retry can target only transient/provider failures.

### Phase 3 — UK discovery quality

1. Replace broad `automotive` keyword hunting with eBay category IDs and curated subcategories.
2. Add an automotive seed catalog: diagnostics, organizers, garage tools, maintenance accessories, and non-safety-critical electronics.
3. Enforce £50 before details/sourcing calls to avoid spending quota on disallowed products.
4. Exclude beauty taxonomy IDs and flag safety-critical, regulated, counterfeit-risk, and trademark-sensitive products.
5. Rank estimated candidates by demand signal, price, listing age, and sourceability rather than eBay Best Match alone.

Release gate: a category hunt reports its category coverage and exclusion counts, and no sub-£50 or excluded-category listing reaches sourcing.

### Phase 4 — Correct qualification

1. Add canonical product clusters using deterministic brand/model/MPN, pack, category, specification, variation, and fitment rules.
2. Store seller identity separately from listings.
3. Store deduplicated sold events with stable source references and timestamps.
4. Require three distinct sellers with at least 20 verified rolling-30-day units each and at least 60 total.
5. Hard-reject incompatible model, pack, kit, accessory-only, variation, or vehicle fitment.
6. Add opportunity score only after mandatory gates are resolved.

Release gate: the acceptance cases in `PRODUCT_RULES.md` pass with exact boundary tests, and no estimated/lifetime figure can produce `QUALIFIED`.

### Phase 5 — Dashboard and extension contract

Dashboard progress must show:

- current phase and current keyword;
- completed/total keyword jobs;
- listings scanned, excluded, watched, demand-verified, source-attempted, and accepted;
- last heartbeat and next retry;
- provider-specific errors;
- rejection funnel;
- `Cancel`, `Retry failed`, and `Resume stale` actions.

The extension should submit page context and user-authorized verification evidence to the same product cluster. It must display the server's qualification state and missing evidence, not calculate a competing status locally.

Release gate: dashboard and extension show the same status, rule version, evidence timestamps, and reason codes for a listing.

## Required automated tests

### Orchestration

- Request ends after listing upserts but before job completion; retry resumes without duplicates.
- Worker lease expires; a second worker safely claims the job.
- Browser closes during a hunt; server completes independently.
- Five transient API failures do not strand `RUNNING` state.
- Cancellation stops before the next provider call.
- Unique listing collision is handled by upsert and does not loop.

### Marketplace isolation

- EBAY_GB hunt uses `deliveryCountry:GB`, `priceCurrency:GBP`, and only GBP rows.
- Existing USD listing is not reassigned into a UK hunt.
- £49.99 is excluded; £50.00 is accepted.

### Supplier diagnostics

- Zero API results, provider failure, and all-candidates-rejected are distinct states.
- Each gate reason is counted and persisted.
- Missing rating, shipping, orders, or variation becomes `NEEDS_VERIFICATION` or rejection as defined.
- Positive-feedback percentage is never silently labelled as a five-star seller rating.

### Qualification

- Exactly three sellers × 20 units qualifies when every other gate passes.
- Two sellers, or 30/25/19, does not qualify.
- Duplicate sale events are counted once.
- Wrong model, pack, variation, or automotive fitment rejects the supplier match.

## Operational checklist

- Keep development and production provider configuration parity without copying secrets into source control.
- Add a safe configuration-status endpoint that reports presence, marketplace, and provider capability—not credential values.
- Alert on stale running hunts, repeated retries, zero acceptance across a large supplier sample, and provider authorization failures.
- Record rule/config versions on every hunt so old results remain explainable after settings change.
- Do not migrate existing workspace thresholds silently; require an explicit reviewed settings update.

## Definition of done

A hunt is working when it completes without an open browser, is safely resumable, contains only the requested marketplace and category scope, explains every exclusion, persists provider provenance, and never labels a product qualified without all mandatory demand, supplier, match, and profitability evidence.
