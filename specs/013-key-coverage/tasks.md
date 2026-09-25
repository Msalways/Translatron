# Tasks: Key Coverage Across Locales

**Input**: `specs/013-key-coverage/` (reviewed spec + plan)

## Phase 1: Coverage module (US3 foundation, FR-001/FR-002)

**Independent Test**: S11/S12 matrix green; return shape carries no source text.

- [x] K-T001 `src/core/coverage.ts`: `findTargetOnlyKeys` (stable locale/key order, `except` via shared `matchesKeyPattern`)
- [x] K-T002 `tests/unit/coverage.test.ts`: exempt vs reported, S12 both-directions, shape assertion (no `sourceText`/`unitId` keys in output)

## Phase 2: Check integration (US1/US2, FR-003/FR-004)

**Independent Test**: P6 fixture golden-matches byte-identical; clean fixtures unchanged.

- [x] K-T003 `check.ts`: orphan issues (`ORPHANED`), severity input (default error), warnings array, P6 block with dynamic source-locale line, `sourceLocale` required on input/result
- [x] K-T004 `schema.ts`: additive `catalogs.targetOnly`; `cli.ts`: wire patterns + sourceLocale; update existing check call sites/tests for new required field

## Phase 3: Flag + perf + closeout (US4, SC-004)

- [x] K-T005 `--catalogs-only` flag (forward-compat gate; equivalence test when no registry sections exist)
- [x] K-T006 10k×10 synthetic perf probe (< 5s)
- [x] K-T007 Full suite + `tsc` + checklist validation; mark tasks
