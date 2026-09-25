# Tasks: Foundation Domain Model

**Input**: `specs/001-A-foundation-domain/` (spec.md, plan.md)

**Prerequisites**: plan.md, spec.md

## Phase 1: Setup

- [x] A1-T001 Create `src/core/` directory + `src/core/index.ts` barrel

## Phase 2: Foundational — domain types (P1) 🎯 MVP

**Goal**: Canonical v3 types importable with zero forbidden dependencies.

**Independent Test**: `npx vitest run tests/unit/domain.test.ts` green; `tsc --noEmit` clean.

### Tests

- [x] A1-T002 [P] [US1] Revision JSON round-trip property test (`fast-check`, 100 runs) in `tests/unit/domain.test.ts`
- [x] A1-T003 [P] [US1] Boundary test: scan `src/core/` imports, assert none match `deepagents|@langchain|better-sqlite3|openai|anthropic|groq-sdk`
- [x] A1-T004 [P] [US1] Status-union test: all 12 states assignable, unknown string rejected by zod schema

### Implementation

- [x] A1-T005 [US1] Define identity/status/fingerprint types in `src/core/domain.ts` (FR-001, FR-003, FR-007)
- [x] A1-T006 [US1] Define `TranslationRevision` + zod schema in `src/core/domain.ts` (FR-002)
- [x] A1-T007 [P] [US2] Define `SourceUnit/TargetSnapshot/ReconciledTranslation` (FR-004–FR-006)
- [x] A1-T008 [P] [US2] Define `RunPlan/LanguagePlan/TranslationWorkUnit/ExecutionLimits` (FR-008, FR-009)
- [x] A1-T009 Re-export compatible names from `src/types/index.ts` (no breaking change to existing imports)

**Checkpoint**: Domain imports cleanly; downstream epics can start.

## Phase 3: Polish

- [x] A1-T010 [P] `research.md`, `data-model.md`, `quickstart.md`, `contracts/revision.schema.json`
- [x] A1-T011 Run `typecheck`, `lint`, full unit suite; update `.specify/feature.json` to next epic when done
