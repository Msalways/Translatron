# Feature Specification: Registry Verify + Repair

**Feature Branch**: `017-registry-maintenance`

**Created**: 2026-09-23

**Status**: Draft

**Input**: v2 breakdown §17 (allowed: status/sync/verify/repair; forbidden: edit) + §18 (integrity UX) + Epic L/S5. The committed-folder model (012) changes what these mean: there is no ref to sync and no checkout to repair — verify reads files, repair quarantines them. A plumbing `refs/translatron/registry` and a `registry sync` transport are explicitly OUT (non-goal with rationale below).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Integrity failures are explicit, never silent (Priority: P1)

`translatronx registry verify` reads every segment and snapshot and reports per-file ok/fail with reasons (checksum mismatch, name-hash mismatch, schema rejection, conflicting revision IDs, snapshot heads disagreement). Exit 0 when clean, 1 with the §18-shaped report otherwise.

**Why this priority**: Machine-owned data must fail loudly on tampering — the core integrity promise (SEC-01).

**Independent Test**: Fixture (good + tampered + renamed + conflicting-ID segments + disagreeing snapshot) → exact per-file verdicts + exit 1.

**Acceptance Scenarios**:

1. **Given** a tampered segment, **When** verify runs, **Then** it names the file and `Checksum mismatch`, points at `registry repair`, and exits 1.
2. **Given** a clean registry, **When** verify runs, **Then** it summarizes counts and exits 0.

---

### User Story 2 - Repair quarantines, never rewrites (Priority: P1)

`translatronx registry repair` moves corrupt segments aside into `quarantine/` (existing mechanism), re-verifies, and reports what was quarantined vs what remains broken. History is never rewritten, nothing is deleted, valid revisions stay queryable throughout.

**Independent Test**: Corrupt fixture → repair → files moved with `.corrupt` suffix, re-verify clean, valid revisions intact.

**Acceptance Scenarios**:

1. **Given** 1 corrupt + 2 valid segments, **When** repair runs, **Then** 1 file lands in `quarantine/`, valid revisions remain fully queryable, and the report says so.
2. **Given** a clean registry, **When** repair runs, **Then** it reports nothing to do and changes nothing.

---

### User Story 3 - Status shows registry health at a glance (Priority: P2)

`translatronx registry status` prints segments/snapshots/revisions/removals/quarantined counts plus bootstrap presence. Read-only, instant, no network.

**Acceptance Scenarios**:

1. **Given** any registry state, **When** status runs, **Then** counts match `readRegistry` output exactly.

---

### Edge Cases

- Missing `.translatron/` → verify reports "no registry" with init guidance (exit 1); repair creates nothing; status reports absent.
- Legacy timestamp-named segments verify checksum-only (same rule as the reader).
- Snapshot covering quarantined-away segments: heads referencing missing revisions → reported as disagreement (informational; snapshots are additive history, not rewritten).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Pure `verifyRegistry(registryDir)` MUST return per-file verdicts for segments and snapshots plus cross-file ID-conflict findings, reusing `readSegmentFile(Full)`, `readSnapshotFile`, `checkRevisionConflicts` — SEC-01, L1–L3.
- **FR-002**: Pure-ish `repairRegistry(registryDir)` MUST quarantine via the existing `quarantineDir` mechanism, re-verify, and return moved/remaining lists; MUST NOT rewrite, delete, or regenerate history — L4.
- **FR-003**: `registry status|verify|repair` MUST wire as commander subcommands with help text; `registry edit` MUST NOT exist (assert absence in help output test); `registry sync` MUST NOT exist — committed-folder model syncs via normal git flow (§17 adapted) — UX-01.
- **FR-004**: Exit codes: verify 0 clean / 1 problems-or-absent; repair 0 done-or-nothing-to-do / 1 on unexpected error; status 0 always (absent registry included) — CLI.
- **FR-005**: Plumbing `refs/translatron/registry` is formally SUPERSEDED (not deferred): content-hash names + committed folder already satisfy §30 (merge test = proof). Recorded here with evidence, not built.

### Key Entities

- **Verdict**: `{ file, kind: 'segment'|'snapshot', ok, errors[] }` — the unit of reporting.
- **Repair outcome**: `{ quarantined[], cleanAfter: boolean, validRevisions }`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Fixture matrix green (tamper/rename/conflict/bad-snapshot/absent/legacy-name).
- **SC-002**: Repair E2E green (quarantine + re-verify + queryability preserved).
- **SC-003**: `registry --help` lists exactly status/verify/repair; no `edit`, no `sync`.
- **SC-004**: Full suite green; `tsc` clean; build succeeds.

## Assumptions

- Snapshots are never repaired/rewritten (additive history); disagreement is reported.
- `cache/` health is out (no persistent cache module exists; indexes rebuild per read).
- Plan/tasks/implement follow only on a positive spec review (user condition).
