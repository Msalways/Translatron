# Feature Specification: Translation Memory

**Feature Branch**: `007-G-translation-memory`

**Created**: 2026-09-21

**Status**: Draft

**Input**: R&D §14 + Epics G1–G3. Traceability: `PERF-01`.

## User Scenarios & Testing

### User Story 1 - Repeated strings cost zero LLM calls (Priority: P1)

A source unit identical (fingerprint + locale + context) to an accepted registry
revision reuses it after validation, with no model invocation.

**Why this priority**: This is the v3 cost story.

**Independent Test**: Counter on model calls stays zero for TM-covered units.

**Acceptance Scenarios**:

1. **Given** an exact accepted revision, **When** planning, **Then** the unit resolves TM HIT → validate → reuse.
2. **Given** a source change (hash differs), **When** planning, **Then** no TM hit occurs.

### User Story 2 - Human translations win ties (Priority: P2)

Where human and agent revisions both match, the human revision is preferred as TM source.

**Independent Test**: Dual-candidate fixture resolves to the human revision.

**Acceptance Scenarios**:

1. **Given** competing candidates, **When** retrieved, **Then** origin priority human > agent > imported applies.

### Edge Cases

- Context-incompatible candidate (different context fingerprint) → no hit.
- Batch example retrieval returns a small compatible set, never the whole registry.

## Requirements

### Functional Requirements

- **FR-001**: Exact index MUST key on source fingerprint + target locale + context compatibility — `PERF-01`.
- **FR-002**: Only accepted revisions MUST be TM candidates; FAILED never — `PERF-01`.
- **FR-003**: Origin priority MUST prefer manual-accepted over model-generated — Epic G2.
- **FR-004**: Worker context MUST receive a bounded compatible example set — Epic G3.

## Success Criteria

- **SC-001**: TM-covered sync performs zero model calls for those units.
- **SC-002**: Priority + compatibility rules covered by unit tests.
- **SC-003**: Lookup is indexed (~O(1)), benchmarks on 10k-revision fixture.

## Assumptions

- Fuzzy/vector TM explicitly out of scope for v3.0.
