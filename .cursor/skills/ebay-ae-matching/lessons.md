# Matching incident lessons

Concrete failures from production debugging. Prefer the checklist in `SKILL.md`; use this when reproducing similar reports.

## 1. Wrong kit retrieved (resistance bands)

**Report:** eBay `11-Piece Resistance Bands Set` matched a generic `5-Level Resistance Bands Set`, while a real `11pcs TPE…Door Anchor…` listing existed on AE.

**Causes:**

- Seed query `resistance bands` filled the 150-result cap; later variants never ran.
- `11-Piece` failed pack regex (required whitespace) → defaulted to pack `1`.
- Unknown/generic titles also defaulted to pack `1` → false pack “match”.
- Correct `11pcs` AE was hard-rejected as 11 vs 1.

**Fix pattern:**

- Quantity-first query: `11pcs resistance bands set` (works without seed too).
- Parse hyphen/unicode dashes via normalized title; unknown → `null`.
- Hard-reject AE with missing pack when eBay pack > 1.
- Soft boost exact pack match; run all query variants; raise pool cap after multi-query merge.
- Regression: exact eBay/AE/generic titles in `core.test.ts`.

## 2. Price inversion still attached (mouth tape)

**Report:** AE ~$26.64 vs eBay ~$5.21, huge negative profit, still shown as a candidate for review.

**Causes:**

- Margin / price checks only ran on paths that reached “approved-like” statuses.
- Manual-validation path still attached the expensive AE source.

**Fix pattern:**

- `hasSourcingPriceAdvantage` before shortlist/select.
- Minimum net margin filter on candidates before attach.
- Rejection `SOURCE_PRICE_NOT_BELOW_EBAY` / `MARGIN_TOO_LOW` → `UNPROFITABLE`, block `AE_MATCHED`.

## 3. Everything Needs review / no AE (visual gate)

**Report:** After enabling DINOv2, every product needed review; Visual Match “Not available”.

**Causes:**

- `requireVisual: true` while ORT WASM could not load under Next (`ort-wasm-simd-threaded.mjs` path).
- Unavailable visual treated like failed visual match → empty shortlist.

**Fix pattern:**

- Set `requireVisual` only when `visualAvailableCount > 0`.
- Log `visual_match_unavailable` with provider reason.
- Keep semantic hard-rejects independent of vision.
- DINOv2 image input must be `Blob`, not raw `Uint8Array`.

## 4. Accessory / semantic false positives

**Reports:** earbuds ↔ case/cover; sleep mouth tape ↔ sewing hem tape.

**Fix pattern:**

- Accessory patterns → `accessory_vs_main`.
- Product context groups (e.g. sleep/wellness vs textile/sewing) → `product_context_mismatch`.
- Always add the reported title pair as a unit test.

## 5. Status lying after partial attach

**Cause:** Trend idea marked matched while confidence/visual/price reasons should block.

**Fix pattern:**

- `deriveTrendIdeaMatchStatus` with an explicit blocking-reason set.
- Include price, margin, pack/visual/confidence, and no-source codes.

## Validation commands

```bash
npm test -- --run
npx tsc --noEmit
# Live retrieval smoke (credentials required):
node --env-file=.env --import tsx -e '/* search buildAliExpressSearchQueries + official provider */'
```

When reproducing a user miss: print queries, whether the exact `productId` appears, top ranked IDs, pack parses, and profit/price gate outcomes.
