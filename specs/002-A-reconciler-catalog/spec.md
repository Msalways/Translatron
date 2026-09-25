# Feature Specification: Reconciler + Catalog Abstraction

**Feature Branch**: `002-A-reconciler-catalog`

**Created**: 2026-09-21

**Status**: Draft

**Input**: R&D §17–§18 + Epics A2–A3. Traceability: `CORE-01`, `CORE-02`.

## User Scenarios & Testing

### User Story 1 - Developer sees exactly what changed and why (Priority: P1)

Running sync derivation over source + targets + registry yields per-key×locale
states; new keys → NEW, edited translations → MANUAL, changed source → SOURCE_STALE.

**Why this priority**: Deterministic change detection is the compiler's core promise.

**Independent Test**: Fixture repo with known edits produces the exact expected state map.

**Acceptance Scenarios**:

1. **Given** a new source key with no target, **When** reconciled, **Then** state is NEW.
2. **Given** a target differing from the last agent revision, **When** reconciled, **Then** state is MANUAL and the key is excluded from auto-translation.

### User Story 2 - Skill change marks stale without overwriting (Priority: P2)

After `ja-JP/SKILL.md` changes, affected translations become SKILL_STALE and are
left untouched until explicit `sync --affected-by-skill`.

**Why this priority**: Fingerprint-driven staleness is the skills contract.

**Independent Test**: Fingerprint rotation flips CLEAN → SKILL_STALE, file bytes unchanged.

**Acceptance Scenarios**:

1. **Given** a CLEAN translation and a rotated skill fingerprint, **When** reconciled, **Then** state is SKILL_STALE.

### User Story 3 - JSON catalogs read through adapter interface (Priority: P3)

Source/target JSON files load via `CatalogAdapter`, producing normalized catalogs.

**Independent Test**: Nested JSON fixture round-trips through adapter read.

**Acceptance Scenarios**:

1. **Given** nested `en-GB.json`, **When** read via `generic-json` adapter, **Then** flat units with hashes/placeholders are returned.

### Edge Cases

- Target key with no registry history → UNTRACKED (never auto-claim).
- Source key deleted but target remains → ORPHANED.
- Tracked target file entry deleted → TARGET_DELETED.
- Two competing human revisions → CONFLICT surfaced, not silently merged.

## Requirements

### Functional Requirements

- **FR-001**: Reconciler MUST derive all 12 states in §17 from (source, target, registry) — `CORE-01`, `CORE-02`.
- **FR-002**: MANUAL detection MUST compare target hash vs last agent-owned revision — `CORE-02`.
- **FR-003**: SKILL_STALE/CONTEXT_STALE MUST compare current vs revision fingerprints — `SKILL-03`.
- **FR-004**: Planner MUST group work units by (locale, skill fingerprint, glossary fingerprint, context class) then token-batch — `PAR-01`.
- **FR-005**: Plan MUST be immutable for the run (frozen object) — `AGENT-02`.
- **FR-006**: `CatalogAdapter` interface (discover/read/write) with `generic-json` implementation MUST replace direct extractor use in compiler — `CORE-01`.
- **FR-007**: Every state transition MUST have a unit test — Epic A2 acceptance.

### Key Entities

- **ReconciledTranslation**: input/output of reconciler.
- **NormalizedCatalog**: adapter read result (units + locale + source path).

## Success Criteria

- **SC-001**: 12-state transition matrix fully tested; fixture repos produce exact state maps.
- **SC-002**: Planner groups fixtures into expected locale/skill batches; token budget respected.
- **SC-003**: No SQLite access in reconciler/planner/adapter code paths.

## Assumptions

- Fingerprint helpers come from Epic 009 skills / Epic 007 TM; reconciler consumes them via domain types (stubbed in tests).
