# Feature Specification: Testing Hardening

**Feature Branch**: `011-K-testing-hardening`

**Created**: 2026-09-21

**Status**: Draft

**Input**: R&D Epic K + risk scenarios. Traceability: `TEST` (all).

## User Scenarios & Testing

### User Story 1 - Every risky scenario is a regression test (Priority: P1)

The suite covers: simultaneous developers, divergent human edits, push races,
worker crash, provider 429, mid-branch skill change, source-after-manual,
stale-SQLite migration, CI fresh clone, 10-language sync.

**Why this priority**: Distributed + agentic behavior fails in ways unit tests miss.

**Independent Test**: Each scenario has a dedicated test (matrix below).

**Acceptance Scenarios**:

1. **Given** two concurrent runs, **When** both push, **Then** revisions converge with none lost.
2. **Given** provider 429 then success, **When** run, **Then** retry middleware recovers and budgets hold.

### User Story 2 - Property tests guard invariants (Priority: P2)

Revision round-trips, hash stability, plan immutability, and state-machine
transitions hold across randomized inputs.

**Independent Test**: `fast-check` suites green at 100+ runs each.

**Acceptance Scenarios**:

1. **Given** random revisions, **When** round-tripped, **Then** all fields survive.

## Requirements

### Functional Requirements

- **FR-001**: Suite MUST include domain unit, property, registry-sync, concurrent-writer, migration-fixture, agent-contract (mock runtime), provider-integration, CLI-snapshot, fixture-repo, failure/recovery layers.
- **FR-002**: All 10 risk scenarios MUST have dedicated tests.
- **FR-003**: Agent-contract tests MUST run with stub runtime (no network/keys).
- **FR-004**: CI MUST run full suite with coverage thresholds; `check` used as CI gate example.

## Success Criteria

- **SC-001**: Full `vitest` green on clean checkout with documented key-free subset.
- **SC-002**: Race/property suites pass 3 consecutive runs (flake check).
- **SC-003**: Coverage report published per release.

## Assumptions

- Provider integration tests requiring keys are opt-in (`RUN_LIVE_TESTS=1`), others use fakes.
