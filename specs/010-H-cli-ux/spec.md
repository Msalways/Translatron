# Feature Specification: CLI/UX

**Feature Branch**: `010-H-cli-ux`

**Created**: 2026-09-21

**Status**: Draft

**Input**: R&D §28–§38 + Epics H1–H7. Traceability: `CLI-01`, `CLI-02`, `UX-01`, `UX-02`.

## User Scenarios & Testing

### User Story 1 - Developer watches languages complete live (Priority: P1)

`translatronx sync` shows per-language progress bars and a summary
(TM reused / LLM translated / repairs / failed / files updated).

**Why this priority**: Parallel runs need legible progress.

**Independent Test**: Snapshot of renderer output for a scripted event stream.

**Acceptance Scenarios**:

1. **Given** a 4-language run with one repair, **When** rendered, **Then** output matches the §29 shape (bars + completion table).

### User Story 2 - CI consumes machine output; humans get provenance (Priority: P2)

`sync --json` emits run/language status JSON; `explain <key> --lang` shows state,
origin, skills, model, TM, validation, revision; `doctor` reports readiness.

**Independent Test**: JSON schema validation of `--json` output; golden `explain` output.

**Acceptance Scenarios**:

1. **Given** a partial run, **When** `--json` emitted, **Then** it validates against the §31 schema with per-language translated/failed counts.
2. **Given** `doctor` on a healthy project, **When** run, **Then** all checks pass with optional-skill notes.

### User Story 3 - check stays deterministic for CI gating (Priority: P3)

`check` reports per-key issues with non-zero exit, no LLM, no writes.

**Independent Test**: Broken-placeholder fixture exits non-zero with the §34 report.

**Acceptance Scenarios**:

1. **Given** a missing ja-JP key, **When** `check` runs, **Then** it lists the key and exits non-zero.

### Edge Cases

- Registry conflicts shown semantically (two human revisions + resolution prompt), never raw git.
- `status` shows origin/state/coverage/stale/manual/failures (§35).

## Requirements

### Functional Requirements

- **FR-001**: Normalized `TranslatronEvent` bus (RunStarted…RunCompleted) MUST feed CLI; CLI MUST NOT consume LangGraph events — Epic H1.
- **FR-002**: Progress renderer MUST show language-level bars + verbose batch mode — `UX-01`.
- **FR-003**: `--json` MUST emit §31 schema — `CLI-02`.
- **FR-004**: `doctor` MUST check catalogs/creds/registry/skills/CI config — Epic H5.
- **FR-005**: `explain` MUST trace provenance + skills + validation — `UX-02`.
- **FR-006**: `check` MUST be deterministic, exit non-zero on issues — `CLI-01`.
- **FR-007**: `status` MUST be provenance-oriented (§35) — Epic H7.

## Success Criteria

- **SC-001**: Renderer snapshots match §29/§33–§38 golden outputs.
- **SC-002**: `--json` validates against checked-in schema.
- **SC-003**: `check` on clean fixture exits 0; on broken fixture exits non-zero with key-level report.

## Assumptions

- Existing commands keep names/flags; new commands added alongside.
