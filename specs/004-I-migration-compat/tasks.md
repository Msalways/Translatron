# Tasks: Migration + Backward Compatibility

**Input**: `specs/004-I-migration-compat/`

## Phase 1: Setup

- [x] M-T001 [P] Create `src/migration/`, seed v2 fixture (SQLite + locales + legacy config)

## Phase 2: Reader + classification (P1) 🎯 MVP slice 1

**Independent Test**: Dry-run counts match hand-computed classification; file-truth wins mismatches.

- [x] M-T002 Fixture + classification tests in `tests/unit/migration.test.ts`
- [x] M-T003 `v2-ledger.ts` read-only reader (FR-001)
- [x] M-T004 `classifier.ts` mapping + DB-vs-files verify (FR-002, FR-003)

## Phase 3: Apply + config compat (P1/P2)

**Independent Test**: `--apply` yields valid registry; SQLite retained; legacy config loads with warnings.

- [x] M-T005 `migrate.ts` dry-run + atomic apply (FR-004)
- [x] M-T006 `config-adapter.ts` providers/prompts/ledgerPath normalization + warnings (FR-005)
- [x] M-T007 `cli/commands/migrate.ts`; keep legacy commands green (FR-006)

## Phase 4: Polish

- [x] M-T008 Boundary test: SQLite imports only under `src/migration/`; docs
