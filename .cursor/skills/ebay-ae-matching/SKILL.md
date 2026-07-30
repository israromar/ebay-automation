---
name: ebay-ae-matching
description: >-
  Hard rules for eBay→AliExpress sourcing retrieval, pack/kit parsing, price
  direction, visual matching fallbacks, and status validity in ebay-automation.
  Use when changing matching, ranking, scan-orchestrator, AliExpress search
  queries, DINOv2 visual match, trend-match status, rejection codes, or when the
  user reports wrong AE matches, inverted prices, Needs review for everything,
  or missing products that exist on AliExpress.
---

# eBay → AliExpress Matching

## Product goal

Find AE sources that are the **same product kit**, **cheaper landed cost than eBay**, and **profitable after fees**. A text-similar but wrong/expensive source is a failure.

## Diagnose before coding

When the user says a match is wrong, classify first:

| Failure           | Symptom                                                | Where to look                                                                  |
| ----------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Retrieval miss    | Correct AE exists on site but not chosen / not in pool | `buildAliExpressSearchQueries`, `searchAliExpressSources`, provider sort/limit |
| Pack/kit miss     | `11-Piece` vs `5-Level` / accessory                    | `extractPackQuantity`, `scoreAliExpressSourceMatch`                            |
| Price inversion   | AE ≥ eBay or large negative profit still attached      | `hasSourcingPriceAdvantage`, profit gate in orchestrator                       |
| Visual false gate | Everything `Needs review`, `VISUAL_MATCH_UNAVAILABLE`  | Do not hard-require visual unless scores actually available                    |
| Semantic miss     | Mouth tape ↔ sewing tape, earbuds ↔ case               | context / accessory hard-rejects                                               |

**Live-verify** with the official AE provider + the reported titles before declaring fixed.

## Non-negotiable rules

1. **Retrieval before ranking.** Ranking cannot fix a product never returned.
2. **Run all query variants.** Never stop after the first query fills a result cap.
3. **Preserve kit quantity in queries.** Multi-piece titles need a leading `Npcpcs …` query, with or without seed keyword.
4. **Pack parse must handle hyphens/unicode dashes.** `11-Piece` / `11–Piece` → `11`. Unknown pack → `null`, never default `1`.
5. **When eBay pack > 1, AE must declare a matching pack.** Missing pack → hard reject (`pack_quantity_missing`). Explicit mismatch → hard reject.
6. **AE landed cost must be below eBay price** before attaching a source. Also enforce minimum net margin. Apply even for `NEEDS_MANUAL_VALIDATION` paths.
7. **Visual is evidence, not a kill-switch for runtime failure.** `requireVisual` only when at least one comparison returned `available: true`.
8. **Statuses must be truthful.** Blocking reasons (`SOURCE_PRICE_NOT_BELOW_EBAY`, `MARGIN_TOO_LOW`, pack/visual/confidence failures) must not surface as successful `AE_MATCHED`.
9. **Every user-reported miss becomes a regression test** with the real title pair (and query assertion when retrieval was the bug).

## Change checklist

Copy and track:

```
Matching change:
- [ ] Failure class identified (retrieval / pack / price / visual / semantic)
- [ ] Live AE search reproduced (or unit fixture if API unavailable)
- [ ] Query variants preserve quantity / critical attributes
- [ ] Wrong candidate hard-rejected or outranked with reason
- [ ] Correct candidate enters pool and ranks competitively
- [ ] Price + margin gates applied before attach
- [ ] Visual required only when available
- [ ] Trend/candidate status reflects blocking reasons
- [ ] Regression test added for the reported titles
- [ ] npm test + tsc clean
```

## Key files

- Queries / pack / score: `src/lib/domain/matching.ts`
- Rank + price advantage: `src/lib/domain/source-ranking.ts`
- Orchestration gates: `src/lib/services/scan-orchestrator.ts`
- Idea status: `src/lib/domain/trend-match-status.ts`
- Visual: `src/lib/domain/visual-matching.ts`, `src/lib/providers/dinov2-visual-match.ts`
- AE API: `src/lib/providers/aliexpress-official.ts`

## Judgement traps (do not repeat)

- Fixing rank weights while the correct SKU is absent from search results
- Treating “Needs review” as acceptable for inverted AE > eBay economics
- Defaulting unknown pack quantity to `1` (makes generics falsely match kits)
- Stripping digits/`pcs` from every search token and never re-injecting quantity
- Making visual mandatory while ORT/WASM is broken in Next → zero AE matches
- Claiming success from unit tests alone when the bug is affiliate retrieval/sort

## Incident detail

See [lessons.md](lessons.md) for concrete past failures and the required fix pattern.
