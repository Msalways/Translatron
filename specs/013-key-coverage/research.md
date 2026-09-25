# Research: Key Coverage Across Locales

**Date**: 2026-09-23 | **Epic**: 013-key-coverage

## Verified blind spot (code read, not impression)

- `reconcile()` iterates source-units × targets only (`reconciler.ts:192`) — a
  target-only key is never visited, so `ORPHANED` is unreachable in the bulk
  path (only single-key `explain` can hit it via `sourceUnit === undefined`).
- `WORK_REASONS` maps every actionable state except `ORPHANED` — no work unit
  even if reached.
- `runCheck` iterated source units only — target-only keys invisible to CI.

## Decisions

1. **Sidecar module, frozen loop**: `src/core/coverage.ts` sits beside the
   reconciler; the bulk loop's `reconciled[]` semantics stay byte-identical
   (002/008 suites prove it — zero changes needed there).
2. **Shared glob dialect**: exception matching reuses `matchesKeyPattern`
   from `skills/resolver.ts` (pure, stateless). Documented layering note:
   core imports a pure function from skills; acceptable, no state crosses.
3. **Fail-by-default** per P6 ("should fail unless…"); `warn` plumbed in the
   function signature for the future config-v3 policy knob, CLI-pinned to error.
4. **Dynamic source-locale line** in the golden block (review finding —
   never hardcode `en-GB` in user-facing output).
5. **No-payload return shape** (`{locale, keyPath}` only) makes LLM
   submission structurally impossible; asserted by test, not just documented.
6. **UNTRACKED overlap resolved**: source-absent target-only keys report
   ORPHANED, not UNTRACKED (source-gone dominates, matching reconciler
   precedence where source-gone outranks everything).
7. `--catalogs-only` ships as a pinned no-op gate now (test locks identical
   output) so the flag exists when registry sections land.
8. Registry-integrity wiring, sync-side removal, SOURCE_REMOVED, TM restore,
   removal policies: OUT — v3-compiler program (recorded in spec Assumptions).
