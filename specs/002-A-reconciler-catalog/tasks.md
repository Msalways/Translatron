# Tasks: Reconciler + Catalog Abstraction

**Input**: `specs/002-A-reconciler-catalog/`

## Phase 1: Setup

- [x] A2-T001 [P] Create `src/catalogs/`, `tests/fixtures/reconciler/` dirs

## Phase 2: Foundational — catalog adapter (P3) 🎯 MVP slice 1

**Independent Test**: Nested JSON fixture reads to expected flat units.

- [x] A2-T002 [P] Adapter read test in `tests/unit/catalogs.test.ts`
- [x] A2-T003 `CatalogAdapter` interface in `src/catalogs/adapter.ts` (FR-006)
- [x] A2-T004 `generic-json` discover/read in `src/catalogs/generic-json.ts`

**Checkpoint**: Adapter reads fixtures.

## Phase 3: Reconciler matrix (P1) 🎯 MVP slice 2

**Independent Test**: 12-state matrix green; fixture repos map exactly.

- [x] A2-T005 Reconciler unit tests per state in `tests/unit/reconciler.test.ts` (FR-007)
- [x] A2-T006 `deriveState()` + `reconcile()` in `src/core/reconciler.ts` (FR-001–FR-003)

**Checkpoint**: All 12 states derive correctly.

## Phase 4: Deterministic planner (P1)

**Independent Test**: Grouping + batching + frozen-plan tests green.

- [x] A2-T007 Planner tests in `tests/unit/planner.test.ts`
- [x] A2-T008 Group/batch/freeze in `src/core/planner.ts` (FR-004, FR-005)

## Phase 5: Polish

- [x] A2-T009 Perf check on 10k-key fixture (< 1s); docs (`research/data-model/quickstart`)
