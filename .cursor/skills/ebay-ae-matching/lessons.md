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

- Intel macOS: `onnxruntime-node` does not ship `darwin/x64`, so native ORT always fails.
- Under Next, ORT WASM then looks for `ort-wasm-simd-threaded.mjs` in `process.cwd()` because it cannot determine `import.meta.url` for `ort.node.min.mjs`.
- `requireVisual: true` while visual scores are unavailable → empty shortlist / everything Needs review.

**Fix pattern:**

- Bootstrap ORT early via `instrumentation.ts` + `NODE_OPTIONS --import register-ort-loader.mjs`.
- When native binding is missing, redirect `onnxruntime-node` → `onnxruntime-web`, set absolute `{ mjs, wasm }` `wasmPaths`, and symlink WASM assets into cwd as a Next fallback.
- Set `requireVisual` only when `visualAvailableCount > 0`.
- Log `visual_match_unavailable` with provider reason.
- Keep semantic hard-rejects independent of vision.
- DINOv2 image input must be `Blob`, not raw `Uint8Array`.
- Verify with `npm run visual:probe`.

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

## 6. eBay-only candidate approved after demand entry

**Report:** Candidate showed `APPROVED` and verified demand while every AE field was blank.

**Causes:**

- Manual demand recalculated profit with missing AE price defaulted to zero.
- Approval/export did not require an attached, validated AE source.
- Retrieved-but-rejected AE products were discarded, making the UI look like retrieval failed.

**Fix pattern:**

- Demand validation must return 409 unless AE ID, URL, price, and match confidence exist.
- Approved export queries must require AE ID, URL, and price.
- Persist top evaluated AE alternatives with match/qualification rejection reasons.
- Distinguish retrieval success from qualification failure in the UI.
- Validate critical product attributes (for example 37-grid vs 148-grid), not only generic title overlap.

## 7. Over-door neck traction matched to a lying pillow

**Report:** eBay `Neck Traction Stretcher ... Home Over Door` was matched to AE `Orthopedic Traction Pillow ... Massage Pillow`. Manual AE image search surfaced the correct hanging device family.

**Findings:**

- Keyword retrieval returned 77 products, including several hanging/door traction devices.
- DINOv2 ranked an over-door device first at 69 visual score; the selected pillow belonged to a different physical-use context.
- Exact-looking hanging suppliers did not pass every configured supplier threshold.
- Official `aliexpress.affiliate.image.search` accepted the signed multipart request but returned `InsufficientPermission` for the current app key.
- Advanced Affiliates API (smart match + hot products) is a **separate** grant from image search; Advanced Active does not unlock figure search.

**Fix pattern:**

- Hard-reject door/hanging traction vs lying/massage pillows as `product_context_mismatch`.
- Prefer form-factor query variants (`over door neck stretcher`) and boost shared form-factor matches.
- Support official image search with a ≤100KB JPEG and union image hits with keyword hits before ranking.
- Keep image search disabled until AliExpress grants the app permission; never scrape the consumer image-search UI as a production substitute.
- When Advanced is Active, union `hotproduct.query` / `product.smartmatch` with `product.query` under hard match gates.
- Persist whether an alternative came from keyword or image retrieval, and show alternatives even when a source is attached.

## 8. Missing AE shipping treated as free

**Report / risk:** Affiliate product payloads often omit shipping. Treating that as `$0` inflated profit and allowed false approvals.

**Fix pattern:**

- `isKnownShippingCost` distinguishes free shipping (`0`) from unknown (`null`/`undefined`).
- Profit is calculated only when shipping is known; otherwise store null economics and `MISSING_SHIPPING_COST`.
- Prefer known-shipping sources in the shortlist when available.
- Manual demand may record sold counts, but cannot approve without known shipping.
- Export requires non-null AE shipping.

## Validation commands

```bash
npm test -- --run
npx tsc --noEmit
# Live retrieval smoke (credentials required):
node --env-file=.env --import tsx -e '/* search buildAliExpressSearchQueries + official provider */'
```

When reproducing a user miss: print queries, whether the exact `productId` appears, top ranked IDs, pack parses, and profit/price gate outcomes.
