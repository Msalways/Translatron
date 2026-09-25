# Feature Specification: Git Registry

> **SUPERSEDED by `specs/012-R-registry-folder`** (constitution v1.1.0): the
> orphan-branch + checkout/merge/push mechanism specified below was replaced
> with a committed machine-owned `.translatron/` folder and content-hash
> segment names. `git-sync.ts` and the push-convergence test were deleted.
> Retained as the design record; new work follows 012.

**Feature Branch**: `003-B-git-registry`

**Created**: 2026-09-21

**Status**: Draft

**Input**: R&D §15–§16 + Epics B1–B6. Traceability: `REG-01`, `REG-02`, `REG-03`.

## User Scenarios & Testing

### User Story 1 - Team shares provenance through git (Priority: P1)

Two developers sync and push; both histories merge additively with no human git
conflict, and `explain` shows both revisions' lineage.

**Why this priority**: Git-native team state replaces the SQLite shared-state problem.

**Independent Test**: Simulated concurrent segment pushes converge to identical revision sets.

**Acceptance Scenarios**:

1. **Given** two runs producing segments on diverged heads, **When** git-sync runs, **Then** both segments persist and push succeeds after retry.
2. **Given** a fresh clone, **When** the indexer builds, **Then** identity→revision graph matches the pusher's.

### User Story 2 - Corrupt cache never loses durable data (Priority: P2)

Deleting the local cache or corrupting a segment file degrades to re-fetch/rebuild,
never to silent revision loss.

**Independent Test**: Corrupt-segment fixture is quarantined; valid revisions remain queryable.

**Acceptance Scenarios**:

1. **Given** a checksum-mismatched segment, **When** read, **Then** it is ignored with a warning and durable revisions stay intact.

### Edge Cases

- Non-fast-forward push → fetch, additive merge, retry (bounded).
- Snapshot compaction must not drop revisions newer than the snapshot.
- Empty registry branch on first run → initialized cleanly.

## Requirements

### Functional Requirements

- **FR-001**: Registry MUST store versioned `.trn` segments, one immutable segment per run — `REG-02`.
- **FR-002**: Reader MUST build in-memory identity→revision graph with disposable local cache rebuild — `REG-03`.
- **FR-003**: Git-sync MUST implement fetch → read head → additive merge → push → bounded non-FF retry with no human conflict — `REG-01`.
- **FR-004**: Snapshots (`*.trnsnapshot`) MUST compact and verify; corruption recovery MUST quarantine bad segments — `REG-03`.
- **FR-005**: Writer/reader MUST round-trip `TranslationRevision` schema with checksum — `REG-01`.

## Success Criteria

- **SC-001**: Concurrent-push simulation converges with zero lost revisions across 50 seeded runs.
- **SC-002**: Fresh-clone rebuild matches origin revision count exactly.
- **SC-003**: Corrupt segment causes warning + quarantine, zero valid-revision loss.

## Assumptions

- Orphan branch `translatron/registry` accessed via local git CLI; remote configured by user.
- Revision schema v1; version field allows future migration.
