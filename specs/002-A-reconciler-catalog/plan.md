# Implementation Plan: Reconciler + Catalog Abstraction

**Branch**: `002-A-reconciler-catalog` | **Date**: 2026-09-21 | **Spec**: `spec.md`

**Input**: `specs/002-A-reconciler-catalog/spec.md`

## Summary

Build `src/core/reconciler.ts` (12-state derivation from source+target+registry),
`src/core/planner.ts` (group + token-batch, frozen plan), and
`src/catalogs/{adapter,generic-json}.ts`, with a transition-matrix test suite.
Depends on Epic 001 domain types.

## Technical Context

**Language/Version**: TypeScript 5 ESM (strict)

**Primary Dependencies**: none new (uses `src/utils/hash.ts`)

**Storage**: N/A (reads registry via domain types; registry impl in Epic 003)

**Testing**: vitest + fixtures under `tests/fixtures/reconciler/`

**Target Platform**: Node >= 18

**Project Type**: compiler

**Performance Goals**: O(keys) scan; 10k-key fixture < 1s

**Constraints**: No SQLite/agent imports; pure functions, no I/O except catalog reads

**Scale/Scope**: ~600 lines + matrix tests

## Constitution Check

- I: PASS (pure deterministic logic).
- II/III: PASS (no runtime/storage imports).
- IV: PASS — MANUAL/UNTRACKED/CONFLICT never auto-claim.

## Project Structure

```text
src/
├── core/
│   ├── reconciler.ts    # derive states
│   └── planner.ts       # group + batch, frozen RunPlan
├── catalogs/
│   ├── adapter.ts       # CatalogAdapter interface
│   └── generic-json.ts  # nested-JSON read/discover (+write passthrough)
tests/
├── unit/
│   ├── reconciler.test.ts  # 12-state matrix
│   └── planner.test.ts
└── fixtures/reconciler/    # source/target/registry triples
```

**Structure Decision**: Single-project; `src/catalogs/` per R&D package structure.

## Complexity Tracking

No violations.
