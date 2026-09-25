# Tasks: Parallel Orchestration

**Input**: `specs/008-E-parallel-orchestration/`

## Phase 1: Scheduler + graph skeleton (P1)

- [x] P-T001 Create `scheduler.ts`, `graph.ts`; timed-fake-worker harness

## Phase 2: Fan-out + supervisor (P1) 🎯 MVP

**Independent Test**: 4-language concurrent completion; supervisor sees summaries only.

- [x] P-T002 Orchestration tests (concurrency + summaries) in `tests/unit/orchestration.test.ts`
- [x] P-T003 `dispatch_language_jobs` + graph fan-out (FR-001)
- [x] P-T004 Supervisor constrained tools (FR-002); fan-in aggregator (FR-004)

## Phase 3: Caps + partial success (P2/P3)

**Independent Test**: Caps respected under 10-language load; fault injection → PARTIAL_SUCCESS + retry recovers.

- [x] P-T005 Cap + partial-success tests
- [x] P-T006 `scheduler.ts` semaphores (FR-003)
- [x] P-T007 Partial persistence + `retry --lang` (FR-005)

## Phase 4: Polish

- [x] P-T008 10-language fixture; docs
