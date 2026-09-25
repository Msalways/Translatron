# Tasks: Skills System

**Input**: `specs/009-D-skills/`

## Phase 1: Types + discovery (P1)

- [x] S-T001 Create `src/skills/`, skill-tree fixtures

## Phase 2: Resolution chain (P1) 🎯 MVP

**Independent Test**: locale×domain matrix resolves exact chains; zero-skill run valid.

- [x] S-T002 Resolution tests in `tests/unit/skills.test.ts`
- [x] S-T003 `types.ts` + `loader.ts` (FR-001, FR-002, FR-005)
- [x] S-T004 `resolver.ts` fallback + domain scopes (FR-003)

## Phase 3: Fingerprints + staleness (P2)

**Independent Test**: Byte change → new hash; rotation → SKILL_STALE with untouched files.

- [x] S-T005 Fingerprint/stale tests
- [x] S-T006 `fingerprint.ts` + provenance hookup (FR-004)

## Phase 4: Polish

- [x] S-T007 Perf check; docs
