# Research: Parallel Orchestration

**Date**: 2026-09-22 | **Epic**: 008-E-parallel-orchestration

## LangGraph usage (installed @langchain/langgraph v1)

- `StateGraph(Annotation.Root({ locales, summaries }))` with concat reducers.
- Fan-out via `addConditionalEdges(START, (state) => state.locales.map(l => new Send('language_worker', { locale: l })))` — the documented map-reduce pattern. The dispatch list is a pure function of the immutable `RunPlan`; no model output involved (SC-003).
- Fan-in via the `summaries` reducer; `graph.invoke()` resolves to the aggregated state.
- Worker node input typed as `{ locale: string }` (Send payload) — tsc accepts against the annotation schema.

## Decisions

1. **Engine parallelism is untrusted**: the language semaphore gates *inside* the worker node, so caps hold regardless of LangGraph's internal scheduling.
2. **One model call ≈ one `withModelCall` acquisition**: initial translate + every repair retranslate pass through global+provider semaphores, so repair storms stay capped (edge case from spec).
3. **`LanguageSummary`/`RunStatus`/`RunResult` live in `src/runtime/runtime.ts`** (the seam), not the supervisor — `src/core/events.ts` needs them and core cannot import from `deepagents/` paths even type-only (A1-T003 boundary test matches substrings). Supervisor and graph re-import from the seam.
4. **Crash vs validation failure**: worker throws → batch fails fast with `WORKER_ERROR` (no repair — repair is for validation output); validation failures → `repairBatch` with exact-error feedback appended to the worker prompt via the new optional `BatchFeedback` param (backwards compatible).
5. **Language status is binary** (`complete` iff zero failed units); accepted translations from failed languages still stream in events so the compiler can persist green work. Run-level `partial_success` covers the mixed case.
6. **Event streaming via unbounded `EventQueue`**: producers never block, so the generator cannot deadlock; `run-started` first, `run-completed` after graph settle.
