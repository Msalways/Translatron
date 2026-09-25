# Feature Specification: Deep Agents Runtime + Language Worker

**Feature Branch**: `005-C-runtime-worker`

**Created**: 2026-09-21

**Status**: Draft

**Input**: R&D §5–§9, §19–§24 + Epics C1–C5. Traceability: `AGENT-01`, `AGENT-02`, `VAL-01`.

## User Scenarios & Testing

### User Story 1 - Compiler executes a plan without knowing deepagents (Priority: P1)

`TranslationCompiler` calls `TranslationRuntime.execute(plan, ctx)` and consumes
normalized `RuntimeEvent`s; swapping the runtime implementation requires no
compiler change.

**Why this priority**: The boundary protects the public API from framework churn.

**Independent Test**: Fake runtime drives a full sync to green in tests with zero `deepagents` imports.

**Acceptance Scenarios**:

1. **Given** a RunPlan, **When** executed via a stub runtime, **Then** compiler writes catalogs + registry and emits language progress events.
2. **Given** the codebase, **When** boundary-tested, **Then** no file outside `src/runtime/deepagents/` imports the framework.

### User Story 2 - Single language translates end-to-end (Priority: P2)

A `TranslationWorkUnit` batch for one locale returns structured
`{translations:[{unitId,text}]}` which validates and stages for write.

**Independent Test**: Mock model returns keyed translations; validator checks IDs exact, no dups/unknowns.

**Acceptance Scenarios**:

1. **Given** 18 source units, **When** the worker completes, **Then** all 18 IDs return exactly once as strings.

### Edge Cases

- Unknown/duplicate/missing IDs → deterministic failure, never partial file write.
- Provider 429/transient → retry middleware with policy; fallback chain per config.
- Empty-string translation of non-empty source → validation failure.

## Requirements

### Functional Requirements

- **FR-001**: `TranslationRuntime` interface (`execute` → `AsyncIterable<RuntimeEvent>`) MUST be the sole agent seam — `AGENT-01`.
- **FR-002**: `DeepAgentRuntime` MUST wrap `createDeepAgent` + model abstraction + retry/fallback middleware behind the seam — `AGENT-01`.
- **FR-003**: Worker tools MUST be narrow (TM, glossary, key context, related translations, skill resources, clarification); NO git/file/registry mutation tools — `SEC-01`.
- **FR-004**: Structured output MUST be unitId-keyed; positional arrays MUST be rejected — `VAL-01`.
- **FR-005**: Model resolver MUST map legacy provider config + `model: "openai:gpt-5"` strings to runtime models — `COMPAT-01`.
- **FR-006**: Immutable Translatron core policy MUST be non-overridable by user config — Epic C3.

## Success Criteria

- **SC-001**: Single-language E2E (mock model) green: translate → validate → stage.
- **SC-002**: Boundary + type tests prove zero framework leakage.
- **SC-003**: Retry/fallback unit tests cover 429 then success, and exhaustion → deterministic failure.

## Assumptions

- `deepagents` + `@langchain/langgraph` added as dependencies in this epic.
- Parallel fan-out is Epic 008; here the runtime may execute languages sequentially.
