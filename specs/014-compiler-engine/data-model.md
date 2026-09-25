# Data Model: v3 Sync Engine (Compiler)

**Epic**: 014-compiler-engine

| Item | Location | Shape |
|---|---|---|
| `EngineInput` | `core/compiler.ts` | catalog/source/targets/files/revisions/skills/providers/policies/flags/dirs/runtime/ids |
| `EngineRunResult` | `core/compiler.ts` | `{ runId, status, summaries, tmReused, filesUpdated, segmentFile?, skipped, warnings, events }` |
| `EngineDryRun` | `core/compiler.ts` | `{ runId, plannedTranslations, plannedRemovals, tmReuses, languages }` |
| `RemovalRecord` | `registry/schema.ts` | `{catalogId,keyPath,sourceLocale,previousSourceHash,runId,createdAt}` — segment-level, never snapshotted |
| `PoliciesConfig` | `config/schema.ts` | `{ removal: remove\|warn-only\|preserve, stale: translate\|preserve }`, all-defaulted |
| `TranslationRevision.gitCommit` | `core/domain.ts` | `string \| null`, always present on engine revisions (null outside repos) |
| `WorkUnitReason` | `core/domain.ts` | gains `'forced'` |
| `RuntimeContext.toolBackend` | `runtime/runtime.ts` | optional engine-assembled backend (relocated interface) |
| Relocations | `core/policy.ts`, `runtime/models.ts` | pure moves, re-exported from `deepagents/` for compat |

Perf: 2 locales × 20 keys E2E on stubs well under the 10s budget (suite: 19 tests in ~5s including 10-project idempotence loop).
