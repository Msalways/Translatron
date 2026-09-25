# Implementation Plan: v3 Sync Engine (Compiler)

**Branch**: `014-compiler-engine` | **Date**: 2026-09-23 | **Spec**: `spec.md`

**Input**: `specs/014-compiler-engine/spec.md` (reviewed, verdict BUILD)

## Summary

New `src/core/compiler.ts` (`runSyncEngine` with injected `TranslationRuntime`), revision assembly in `src/registry/revisions.ts`, segment `removals` support, `GenericJsonAdapter.removeKeys`, additive `policies` config + `forced` work reason + `gitCommit` revision field, four pure seam relocations with re-exports, and a StubRuntime-driven E2E suite including the S10 lifecycle. No CLI wiring, no live-model code.

## Technical Context

**Language/Version**: TypeScript 5 ESM (strict)

**Primary Dependencies**: none new

**Storage**: Target catalogs (atomic staged writes) + `.translatron/` segments (one per run)

**Testing**: vitest; temp-dir harness projects; StubRuntime + local `TranslationRuntime` fakes; throw-on-call workers for no-model-call proofs

**Target Platform**: Node >= 18

**Project Type**: compiler

**Performance Goals**: SC-005 (< 10s for 2 locales × 20 keys on stubs); TM lookup stays O(1); reconcile stays O(keys)

**Constraints**: Both boundary tests pass unchanged; no `deepagents`/`@langchain` imports outside `src/runtime/deepagents/`; check/status/explain/doctor untouched; v2 `TranslationCompiler` untouched

**Scale/Scope**: ~4 new modules, ~8 edited files, 1 new E2E test file + registry/revisions unit tests

## Constitution Check

- I: PASS (engine is deterministic orchestration; agents only translate).
- II: PASS via FR-012 relocations — verified green before any engine code lands (relocation-first order).
- III: PASS (one segment per run, additive, verified reads).
- IV/V: PASS (parented human revisions; TM-first with anti-resurrection rules).

## Project Structure

```text
src/
  core/
    compiler.ts      # NEW: runSyncEngine + materials/backend assembly + report
    policy.ts        # NEW: relocated CORE_POLICY + corePolicyFingerprint (re-exported by deepagents/policy.ts)
    coverage.ts      # (013, reused for orphan listings)
  runtime/
    runtime.ts       # EDIT: TranslationToolBackend interface moves here; RuntimeContext.toolBackend?
    models.ts        # NEW: relocated resolveLegacyProvider + types (re-exported by deepagents/models.ts)
    deepagents/
      tools.ts       # EDIT: re-export TranslationToolBackend (impl unchanged)
      policy.ts      # EDIT: re-export from core/policy.ts
      models.ts      # EDIT: re-export from runtime/models.ts
      supervisor.ts  # EDIT: default worker path prefers context.toolBackend
  registry/
    revisions.ts     # NEW: revision builders + deterministic IDs + already-recorded guard
    schema.ts        # EDIT: additive optional removals[] on segment payload
    reader.ts        # EDIT: aggregate removals across segments
  catalogs/
    generic-json.ts  # EDIT: additive removeKeys (nested delete by key path)
  config/
    schema.ts        # EDIT: additive policies block
  core/
    domain.ts        # EDIT: additive WorkUnitReason 'forced' + TranslationRevision.gitCommit?
```

## Key Decisions (resolving spec-flagged items)

1. **ExecutionLimits**: R&D §8 constants hardcoded (`maxLanguages 4`, `maxBatchesPerLanguage 2`, `maxGlobalModelCalls 8`); `maxUnitsPerBatch` from `advanced.batchSize ?? 20`. Rationale: v2 `concurrency` semantics don't map onto the three semaphores; the `execution:` block arrives with config-v3.
2. **Dry-run report**: separate `EngineDryRun { runId, plannedTranslations, plannedRemovals, tmReuses, languages }` — `RunReport` stays the completed-run shape.
3. **Legacy skill**: engine builds it inline from `config.prompts` via `legacySkillToLoadedSkill` (no core→migration import).
4. **TM skill-equality reference**: freshly-resolved per-unit chain at engine time (documents the review correction).
5. **Order of implementation**: relocations first (FR-012) with full suite green → schema/additive edits → engine → E2E. Any red after step 1 stops the line.

## Complexity Tracking

No violations (relocations are pure moves; no new dependencies).
