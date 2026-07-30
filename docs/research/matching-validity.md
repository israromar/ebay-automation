# Matching Validity Invariants

These invariants apply to eBay → AliExpress sourcing, candidate approval, and export.

## Candidate validity

A candidate may be `APPROVED` only when all of the following are true:

1. A validated AliExpress source is attached:
   - `aliexpressProductId`
   - `aliexpressUrl`
   - `aliexpressPriceMinor`
   - `matchConfidence`
2. AE landed cost is below the expected eBay selling price.
3. Net margin meets the workspace minimum.
4. Demand is verified and meets the minimum recent-sales rule.
5. No blocking match, supplier, visual, pack, feature, or context rejection remains.
6. AE shipping cost is known (including free shipping as `0`). Missing shipping is unknown—not zero—and blocks approval.

Missing AE cost is unknown—not zero. Manual demand validation must return a conflict instead of approving an eBay-only candidate. Demand entry with a validated AE source but unknown shipping may record sold counts, but must not approve.

## Export validity

Export independently requires:

- Candidate status is `APPROVED` or `EXPORT_PENDING`.
- AE product ID, URL, price, and shipping are non-null.

This defense prevents stale or historically corrupted statuses from reaching downstream listing workflows.

## Retrieval transparency

Do not equate “no attached AE source” with “AE returned no products.”

For each eBay-seeded scan:

1. Run every generated AE query variant.
2. Persist top evaluated alternatives even when rejected.
3. Show rejection evidence:
   - Match reasons (pack, feature, accessory, context)
   - Supplier qualification (rating, reviews, orders)
   - Missing provider fields
   - Price/margin rejection
4. Attach only the source that passes every hard gate.

## Critical attributes

Explicit product attributes override broad title similarity:

- Pack quantity: 1 vs 2 vs 11 pieces
- Grid/cavity count: 37-grid vs 148-grid
- Capacity, dimensions, model, compatibility, and included accessories

If both titles explicitly state conflicting values, hard-reject. If the eBay listing requires a multi-pack and AE does not state a pack, do not assume quantity one is equivalent.

## Incident: blank AE candidate marked approved

An ice-tray candidate was marked `APPROVED` after manual demand entry while all AE fields were null. Live reproduction showed:

- AE retrieval returned 158 products.
- Most relevant 37-grid products failed pack or supplier requirements.
- Retrieved alternatives were discarded from the UI.
- Manual profit calculation defaulted missing AE price to zero.

Corrections:

- Demand validation requires a validated AE source and returns HTTP 409 otherwise.
- Approved export rechecks required AE fields.
- Evaluated AE alternatives are persisted and displayed with reasons.
- Grid-count mismatch is a hard product mismatch.
- The corrupted candidate was reverted from `APPROVED`.

## Required verification

For every matching incident:

```bash
npm test -- --run
npx tsc --noEmit
```

Also perform a live provider reproduction when credentials are available: print generated queries, result counts, exact-product presence, top alternatives, qualification reasons, price/margin outcomes, and final status.
