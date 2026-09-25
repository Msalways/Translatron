# Implementation Plan: Parallel Orchestration

**Branch**: `008-E-parallel-orchestration` | **Date**: 2026-09-21 | **Spec**: `spec.md`

**Input**: `specs/008-E-parallel-orchestration/spec.md`

## Summary

LangGraph programmatic fan-out behind `dispatch_language_jobs`, supervisor Deep
Agent with constrained tools, code semaphores (language/batch/global/provider),
fan-in aggregator returning summaries, partial-success persistence +
`retry --lang`. Depends on Epics 001, 005, 006.

## Technical Context

**Language/Version**: TypeScript 5 ESM

**Primary Dependencies**: `@langchain/langgraph` (from Epic 005), `p-limit`-style semaphore (hand-rolled or tiny dep — decide in research.md)

**Storage**: Registry segments per completed language (Epic 003)

**Testing**: vitest with timed fake workers + fault injection

**Target Platform**: Node >= 18

**Project Type**: compiler orchestration

**Performance Goals**: 4-language wall time ≈ slowest single language; caps never exceeded

**Constraints**: Concurrency from code counters, never model-emitted counts; crash isolation per language

**Scale/Scope**: ~700 lines + orchestration tests

## Constitution Check

- I: PASS (topology is code, not model output).
- II: PASS (inside runtime boundary).
- V: PASS (semaphores + partial success).

## Project Structure

```text
src/runtime/deepagents/
├── graph.ts        # LangGraph fan-out/fan-in
├── supervisor.ts   # (extend) exception-driven tools
└── scheduler.ts    # semaphores: language/batch/global/provider
src/core/
└── events.ts       # RuntimeEvent → TranslatronEvent adapter (or Epic 010)
```

## Complexity Tracking

No violations (LangGraph already approved in Epic 005).
