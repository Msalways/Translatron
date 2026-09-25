# Tasks: Testing Hardening

**Input**: `specs/011-K-testing-hardening/`

## Phase 1: Risk matrix (P1) 🎯 MVP

**Independent Test**: Each of the 10 scenarios fails-before/passes-after by construction (reviewed, not TDD).

- [x] K-T001 Concurrent-dev + divergent-human + push-race tests
- [x] K-T002 Worker-crash + 429 + mid-branch-skill + source-after-manual tests
- [x] K-T003 Stale-SQLite migration + CI-fresh-clone + 10-lang-sync tests

## Phase 2: Property + contract + snapshots (P2)

- [x] K-T004 fast-check suites (revision round-trip, hash stability, plan freeze, state machine)
- [x] K-T005 Agent-contract suite on stub runtime; CLI snapshot suite
- [x] K-T006 Opt-in `tests/live/` gated by `RUN_LIVE_TESTS=1`

## Phase 3: CI (P2)

- [x] K-T007 Coverage thresholds + key-free default in CI workflow
