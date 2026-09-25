# Implementation Plan: Deep Agents Runtime + Language Worker

**Branch**: `005-C-runtime-worker` | **Date**: 2026-09-21 | **Spec**: `spec.md`

**Input**: `specs/005-C-runtime-worker/spec.md`

## Summary

`TranslationRuntime` seam in `src/runtime/runtime.ts`, `DeepAgentRuntime` +
supervisor/worker/models/tools/middleware under `src/runtime/deepagents/`
(new deps `deepagents`, `@langchain/langgraph`), immutable core policy,
structured keyed output, model resolver, stub runtime for offline tests.
Sequential execution acceptable; parallelism in Epic 008.

## Technical Context

**Language/Version**: TypeScript 5 ESM

**Primary Dependencies**: NEW `deepagents`, `@langchain/langgraph`, `@langchain/core`

**Storage**: N/A (results staged in memory; writes by compiler)

**Testing**: vitest with stub runtime + mock model (no keys/network)

**Target Platform**: Node >= 18

**Project Type**: compiler agent-runtime

**Performance Goals**: Stub-driven E2E < 5s; mock single-language 18 units green

**Constraints**: Framework types never escape `src/runtime/deepagents/`; narrow tool allowlist; core policy non-overridable

**Scale/Scope**: ~900 lines + stub harness

## Constitution Check

- II: PASS — seam + boundary tests are the deliverable.
- I: PASS (compiler still decides what/whether; runtime only translates).
- V: PASS (retry/fallback policy in middleware).

## Project Structure

```text
src/
└── runtime/
    ├── runtime.ts        # TranslationRuntime, RuntimePlan/Context/Event
    ├── stub.ts           # offline fake runtime (tests + --dry-run)
    └── deepagents/
        ├── runtime.ts    # DeepAgentRuntime
        ├── supervisor.ts # minimal single-language path
        ├── worker.ts     # worker factory
        ├── models.ts     # model resolver + fallback
        ├── tools.ts      # narrow tool allowlist
        ├── middleware.ts # retry/fallback/limits
        └── policy.ts     # immutable core policy
```

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| 2 new deps | R&D mandates deepagents+LangGraph | custom harness would redo orchestration |
