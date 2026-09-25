# Tasks: Validation + Recovery

**Input**: `specs/006-F-validation-recovery/`

## Phase 1: Setup

- [x] F-T001 [P] Create `tests/fixtures/validation/{placeholders,icu,markup,schema,length}/` golden pairs

## Phase 2: Validators (P1) 🎯 MVP

**Independent Test**: Golden suite green per category; no-write-on-failure proven.

- [x] F-T002 Golden tests in `tests/unit/validation*.test.ts`
- [x] F-T003 `result.ts` ID/coverage validator (FR-001)
- [x] F-T004 `placeholders.ts` (FR-001)
- [x] F-T005 `icu.ts` + `markup.ts` (FR-001)

## Phase 3: Repair + budgets (P2)

**Independent Test**: Fixable fixture converges in budget; unfixable → FAILED; reviewer called ≤ once.

- [x] F-T006 Repair/budget tests
- [x] F-T007 `repair.ts` exact-failure flow + budgets + reviewer hook (FR-002–FR-004)

## Phase 4: Polish

- [x] F-T008 Wire into compiler path; 1-call happy-path assertion; docs
