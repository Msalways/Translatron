# Data Model: Parallel Orchestration

**Epic**: 008-E-parallel-orchestration

| Item | Location | Shape |
|---|---|---|
| `Semaphore` | `runtime/deepagents/scheduler.ts` | `{ max, active, maxObserved, acquire/withLock }` |
| `SchedulerLimits` | `scheduler.ts` | `{ maxLanguages, maxBatchesPerLanguage, maxGlobalModelCalls, providerCaps? }` |
| `ConcurrencyScheduler` | `scheduler.ts` | language + per-locale batch + global + per-provider semaphores; `fromExecutionLimits()` |
| `effectiveModelConcurrency` | `scheduler.ts` | `min(language, batch, global[, provider])` per R&D §8 |
| `LanguageSummary` | `runtime/runtime.ts` (seam) | `{ locale, status, translated, failed, batches, repairs, reviews, error? }` |
| `RunResult` / `RunStatus` | `runtime/runtime.ts` (seam) | `{ runId, status: complete\|partial_success\|failed, summaries, translated, failed }` |
| `TranslatronEvent` | `core/events.ts` | 14-kind normalized union (R&D §30 names) |
| `SUPERVISOR_TOOL_NAMES` | `supervisor.ts` | exactly the 6 constrained tools |

Perf: 4-language wall time ≈ slowest single language (test: 16 delayed batches < 500ms vs 640ms sequential floor).
