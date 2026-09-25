# Tasks: v3 Sync Engine (Compiler)

**Input**: `specs/014-compiler-engine/` (reviewed spec + plan)

## Phase 1: Seam relocations (FR-012) — suite must stay green throughout

- [x] E-T001 Move `TranslationToolBackend` → `runtime/runtime.ts` (+ `toolBackend?` on `RuntimeContext`); re-export from `deepagents/tools.ts`
- [x] E-T002 Move `CORE_POLICY` + `corePolicyFingerprint` → new `core/policy.ts`; re-export from `deepagents/policy.ts`
- [x] E-T003 Move `resolveLegacyProvider` + types → new `runtime/models.ts`; re-export from `deepagents/models.ts`
- [x] E-T004 Supervisor default worker path prefers `context.toolBackend`; full suite green (gate)

## Phase 2: Additive schema + adapter surface (FR-005/006/008/009/010)

- [x] E-T005 `TranslationRevision.gitCommit?` + schema; `WorkUnitReason 'forced'`; `policies` config block; segment `removals[]` + reader aggregation; legacy segments without `removals` parse unchanged (fixture assertion)
- [x] E-T006 `GenericJsonAdapter.removeKeys` (+ unit tests: nested delete, missing keys no-op, non-object guard)

## Phase 3: Revision assembly (FR-006/FR-007)

- [x] E-T007 `src/registry/revisions.ts`: deterministic IDs, agent/human/adoption/restore builders, parent chaining, already-recorded guard, git HEAD helper (null outside repos); unit tests

## Phase 4: Engine (FR-001…FR-004, FR-009…FR-011)

- [x] E-T008 `src/core/compiler.ts`: reconcile → TM-first (chain-equality + glossary + context rules) → enriched planning → runtime → staged write → revisions → segment → report + events; policies (`removal`, `stale`, `forceRegenerate`, `affectedBySkill`, `dryRun`); partial-success persistence
- [x] E-T009 `EngineDryRun` shape + dry-run path (zero writes assertion)

## Phase 5: E2E (FR-014, SC-001…SC-005)

- [x] E-T010 Happy path + idempotence property (10 seeded projects) + throw-on-call restore (20 histories)
- [x] E-T011 Orphan removal (all 3 policies) + human-revision once-only + UNTRACKED adoption + partial success + S10 12-step lifecycle + S7/S8
- [x] E-T012 Full suite + boundary-test verification + checklist validation; mark tasks
