# Tasks: Deep Agents Runtime + Language Worker

**Input**: `specs/005-C-runtime-worker/`

## Phase 1: Setup

- [x] C-T001 Add `deepagents`, `@langchain/langgraph`, `@langchain/core` deps; create `src/runtime/`

## Phase 2: Seam + stub (P1) 🎯 MVP slice 1

**Independent Test**: Compiler completes a sync against stub runtime with zero framework imports.

- [x] C-T002 Seam + stub tests in `tests/unit/runtime.test.ts`
- [x] C-T003 `runtime.ts`: TranslationRuntime/Event/Plan/Context (FR-001)
- [x] C-T004 `stub.ts` fake runtime (test harness)

## Phase 3: DeepAgent worker path (P1/P2)

**Independent Test**: Mock-model single-language batch returns exact keyed IDs.

- [x] C-T005 Boundary test: framework imports only under `src/runtime/deepagents/`
- [x] C-T006 `policy.ts` immutable core policy (FR-006)
- [x] C-T007 `models.ts` + `middleware.ts` resolver/retry/fallback (FR-005)
- [x] C-T008 `tools.ts` narrow allowlist (FR-003)
- [x] C-T009 `worker.ts` + `supervisor.ts` single-language path; structured output (FR-002, FR-004)
- [x] C-T010 `deepagents/runtime.ts` wiring

## Phase 4: Polish

- [x] C-T011 Retry/fallback + 429 unit tests; docs
