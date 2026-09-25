# Research: Review Routing

**Date**: 2026-09-23 | **Epic**: 016-review-routing

## Decisions

1. **Single mechanism, not a parallel bucket**: globs resolve to
   `needsReviewKeys` and the pure reconciler re-runs. `status`/`explain`
   show NEEDS_REVIEW with zero special-casing (proven by test).
2. **Precedence NEEDS_REVIEW > MANUAL is inherited**, not implemented:
   reconciler order puts review above manual, so review-wins-over-force
   falls out — including for forced MANUAL keys (proven by test).
3. **Stale-review re-derives conditionally**: second reconcile runs only
   when stale units exist under `stale: 'review'`; otherwise single-pass
   (byte-identical behavior, existing E2E proves it).
4. **`explain` needed the same input** (`needsReviewKeys` additive-optional)
   or routed units explained as NEW — caught by test, fixed in module +
   CLI wiring.
5. **Review action stays out**: routing + visibility ships; approval happens
   by editing files (MANUAL flow) or narrowing globs. No LLM reviewer.
