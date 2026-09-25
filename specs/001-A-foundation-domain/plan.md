# Implementation Plan: Foundation Domain Model

**Branch**: `001-A-foundation-domain` | **Date**: 2026-09-21 | **Spec**: `spec.md`

**Input**: `specs/001-A-foundation-domain/spec.md`

## Summary

Create `src/core/domain.ts` as the single canonical v3 type module (identity,
revision, snapshots, reconciled view, plans, limits) plus zod schemas for
persisted revisions and boundary tests proving no framework/SQLite leakage.

## Technical Context

**Language/Version**: TypeScript 5 ESM (strict)

**Primary Dependencies**: zod (existing)

**Storage**: N/A (types only; persistence in Epic 003)

**Testing**: vitest, fast-check (existing)

**Target Platform**: Node >= 18

**Project Type**: compiler (CLI SDK)

**Performance Goals**: Zero runtime overhead (types erased at compile)

**Constraints**: No imports of deepagents/@langchain/*/better-sqlite3/provider SDKs in `src/core/`

**Scale/Scope**: ~400 lines types + schemas + tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- I. Deterministic envelope: PASS (pure types, no logic).
- II. Runtime boundary: PASS — this epic CREATES the boundary; violation test included.
- III. No SQLite: PASS — no storage code.
- IV/V: N/A.

## Project Structure

### Documentation (this feature)

```text
specs/001-A-foundation-domain/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0: existing SourceUnit shape, zod patterns in repo
├── data-model.md        # Phase 1: entity/field table
├── quickstart.md        # Phase 1: import examples
├── contracts/           # Phase 1: revision JSON schema
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
src/
├── core/
│   ├── domain.ts        # canonical types + zod schemas
│   └── index.ts         # barrel
tests/
└── unit/
    └── domain.test.ts   # round-trip, boundary, status-union tests
```

**Structure Decision**: Single-project layout; new `src/core/` per R&D package structure.

## Complexity Tracking

No violations.
