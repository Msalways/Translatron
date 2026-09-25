# Feature Specification: Parallel Orchestration

**Feature Branch**: `008-E-parallel-orchestration`

**Created**: 2026-09-21

**Status**: Draft

**Input**: R&D §6–§8, §27 + Epics E1–E7. Traceability: `PAR-01`, `PAR-02`, `PAR-03`.

## User Scenarios & Testing

### User Story 1 - Four languages translate concurrently under one supervisor (Priority: P1)

A 4-language plan fans out via `dispatch_language_jobs` through LangGraph;
supervisor sees summaries and handles only exceptions, then finalizes.

**Why this priority**: Parallel languages is the headline vNext capability.

**Independent Test**: Fake workers with delays complete in ~1/4 sequential time; supervisor receives per-language summaries.

**Acceptance Scenarios**:

1. **Given** fr/de/ja/es plans, **When** run, **Then** all four progress concurrently and aggregate on completion.
2. **Given** all-green workers, **When** finalized, **Then** supervisor performs no per-string reasoning.

### User Story 2 - One locale failing doesn't sink the run (Priority: P2)

ja-JP fails; fr/de/es persist as COMPLETE, run reports PARTIAL_SUCCESS, and
`retry --lang ja-JP` recovers.

**Independent Test**: Fault-injected worker → partial registry write + correct status.

**Acceptance Scenarios**:

1. **Given** 3 green + 1 failed language, **When** run ends, **Then** status is PARTIAL_SUCCESS and green catalogs/segments are durable.

### User Story 3 - Concurrency caps are code-enforced (Priority: P3)

Effective concurrency = min(language, batch, global, provider) caps under load.

**Independent Test**: Load fixture never exceeds configured semaphore counts.

**Acceptance Scenarios**:

1. **Given** caps 4/2/8, **When** 10 languages queued, **Then** observed model-call concurrency ≤ 8.

### Edge Cases

- Worker crash mid-batch → language FAILED, others unaffected, retry possible.
- Repair storms stay within global caps.

## Requirements

### Functional Requirements

- **FR-001**: Single deterministic `dispatch_language_jobs` tool MUST fan out language work — `PAR-01`.
- **FR-002**: Supervisor MUST use constrained tools (dispatch/inspect/retry/repair/review/finalize) and exception-driven flow — `PAR-02`.
- **FR-003**: Semaphores MUST enforce language/batch/global/provider limits in code — `PAR-03`.
- **FR-004**: Fan-in MUST aggregate structured results; supervisor gets summaries — Epic E6.
- **FR-005**: Partial success MUST persist green languages and support `retry --lang` — §27.

## Success Criteria

- **SC-001**: 10-language fixture completes with caps respected and progress events per language.
- **SC-002**: Fault injection yields PARTIAL_SUCCESS with green work durable.
- **SC-003**: Concurrency never depends on model-emitted task counts (static check on supervisor prompt/tools).

## Assumptions

- LangGraph.js programmatic fan-out; LLM never invents the execution graph.
