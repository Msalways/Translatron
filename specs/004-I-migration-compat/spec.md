# Feature Specification: Migration + Backward Compatibility

**Feature Branch**: `004-I-migration-compat`

**Created**: 2026-09-21

**Status**: Draft

**Input**: R&D §39–§40 + Epics I1–I6, J1–J4. Traceability: `MIG-01`, `COMPAT-01`.

## User Scenarios & Testing

### User Story 1 - v2 user migrates with a dry run first (Priority: P1)

`translatronx migrate` prints source/translation counts by classification with
"No changes made"; `migrate --apply` creates the registry and validates before
marking complete, keeping the SQLite backup.

**Why this priority**: Safe migration is the v3 adoption gate.

**Independent Test**: v2 fixture (SQLite + locale files) dry-run counts match hand-computed classification.

**Acceptance Scenarios**:

1. **Given** a v2 project, **When** `migrate` runs without flags, **Then** zero files/branches change.
2. **Given** `--apply`, **When** migration completes, **Then** registry validates and the old SQLite still exists.

### User Story 2 - Old config keeps working with warnings (Priority: P2)

A v2 `translatron.config.ts` (providers array, prompts, `ledgerPath`) loads via
adapter into the v3 model with clear deprecation warnings.

**Independent Test**: Fixture v2 config loads; warnings name each deprecated field.

**Acceptance Scenarios**:

1. **Given** `prompts.{formatting,glossary,brandVoice,customContext}`, **When** loaded, **Then** they normalize to a legacy project skill + glossary layer.
2. **Given** `ledgerPath`, **When** loaded, **Then** a deprecation warning points to the registry.

### Edge Cases

- DB/file mismatch (ledger says CLEAN, file differs) → reported, file truth wins, classified human/imported.
- Missing v2 DB → migrate treats all existing targets as imported/unknown, never fails hard.

## Requirements

### Functional Requirements

- **FR-001**: v2 ledger reader MUST be read-only — `MIG-01`.
- **FR-002**: Classification MUST map CLEAN+model→agent, CLEAN w/o model→imported, MANUAL→human, FAILED→failure metadata — `MIG-01`.
- **FR-003**: Migration MUST verify DB against actual files, never trust ledger blindly — `MIG-01`.
- **FR-004**: `--apply` MUST create registry first, validate, then mark complete; MUST retain SQLite backup — `MIG-01`.
- **FR-005**: Config adapter MUST normalize legacy providers/prompts/ledgerPath with non-blocking deprecation warnings — `COMPAT-01`.
- **FR-006**: CLI MUST keep `sync/check/status/retry/import/context` behavior through migration — `COMPAT-01`.

## Success Criteria

- **SC-001**: Dry-run report on reference fixture matches expected counts exactly.
- **SC-002**: Applied migration yields a registry that `check` and `status` accept.
- **SC-003**: Legacy config suite passes with warnings and zero errors.

## Assumptions

- `better-sqlite3` stays as a migration-only dependency.
