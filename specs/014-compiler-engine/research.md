# Research: v3 Sync Engine (Compiler)

**Date**: 2026-09-23 | **Epic**: 014-compiler-engine

## The hash-only TM correction (spec change during review)

The original US2 promised same-key restore without model calls. Impossible:
the registry stores hashes, never text (PRD content-light principle), so a
deleted target's text exists nowhere to restore from. Corrected semantics:
reuse resolves candidate text from **current target files**, which means
**cross-key exact matches** (NEW key B shares sourceHash with translated
sibling A). Text-less histories fall back to translation. The skill
chain-equality + glossary-match rules make resurrection of stale guidance
structurally impossible — verified by the skill-rotation test.

## Decisions

1. **Reconcile-per-locale** (not one call with a union map): locale-specific
   `currentSkillMap`s; merged after. Avoids cross-locale over-marking.
2. **Reuse preserves candidate origin/model** (new runId/createdAt, current
   acceptance fingerprints, parent = reused revision). Authorship unchanged;
   re-acceptance recorded. Keeps N2 origin preference stable across restores.
3. **Already-recorded guard on target hash** covers MANUAL re-runs and
   UNTRACKED adoptions uniformly; force path bypasses TM deliberately.
4. **Failures persist nowhere**: no `failedKeys` plumbing exists, so FAILED
   is unreachable in-engine v1; re-derivation as NEW/TARGET_DELETED IS the
   retry mechanism. Next run retries naturally.
5. **Engine re-validates runtime output** (defense in depth): the Epic 008
   graph validates, but `StubRuntime` and foreign `TranslationRuntime`
   impls bypass it. Invalid output is excluded from files/registry and
   counted failed with exact errors.
6. **Summaries derive locally** (`translated`/`failed` from accepted +
   validated counts); `repairs`/`reviews` are 0 — runtime events don't carry
   them (recorded runtime follow-up, per spec Assumptions).
7. **Empty plan skips `runtime.execute` entirely** (LangGraph empty-Send
   behavior untrusted; also gives the zero-worker idempotence proof).
8. **Removal records are per-key, not per-locale**; files carry one tombstone
   while each locale file is cleaned independently.
9. **`applyChanges` added beside `removeKeys`**: J5's write-once rule needs a
   single staged cycle; `removeKeys` remains the spec'd test surface.
10. **Legacy skill assembled inline** from `config.prompts` (no core →
    migration import); config-v3 unifies later.
11. **Limits**: R&D §8 constants hardcoded; only `maxUnitsPerBatch` reads
    config (`advanced.batchSize`). v2 `concurrency` doesn't map onto the
    three semaphores — the `execution:` block arrives with config-v3.
12. **CLI wiring deferred** (would trip the Epic 005 boundary test — the
    test scans all of `src/`). Runtime instantiation belongs to config-v3.
