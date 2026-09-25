# Tasks: Translation Memory

**Input**: `specs/007-G-translation-memory/`

## Phase 1: Index + lookup (P1) 🎯 MVP

**Independent Test**: TM-covered units cost zero model calls; source change → miss.

- [x] G-T001 TM tests (hit/miss/priority/examples) in `tests/unit/translation-memory.test.ts`
- [x] G-T002 `translation-memory.ts`: index + `lookup()` (FR-001, FR-002)
- [x] G-T003 Origin priority + bounded `getExamples()` (FR-003, FR-004)

## Phase 2: Polish

- [x] G-T004 10k benchmark; wire lookup before runtime call in compiler; docs
