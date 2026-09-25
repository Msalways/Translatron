# Feature Specification: Committed Machine-Owned Registry Folder

**Feature Branch**: `012-R-registry-folder`

**Created**: 2026-09-23

**Status**: Draft

**Input**: Replaces Epic 003's orphan-branch mechanism with a committed `.translatron/` folder. Locked direction: machine-owned AND in-repos, content-hash segment names, developers never touch it, no merge conflicts from it. Source: `translatron-vnext-machine-owned-registry-task-breakdown-v2.md` §§2, 5–8, 30 (OWN-02, REG-02, REG-INV-01…06, GIT-03, SEC-01, TEST-01).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - First write bootstraps a committed registry home (Priority: P1)

A developer runs a Translatron command that publishes registry data (migration apply, conflict resolution, future sync publish) in a project with no `.translatron/` directory. Translatron creates `.translatron/segments/`, `.translatron/snapshots/`, a static `meta.json`, and a nested `.gitignore` ignoring `cache/` — then proceeds. Committing the project shares full provenance with the team; no branch switching ever occurs. Read-only commands (`check`, `status`, `explain`, `doctor`) MUST NOT create anything: on a missing home they behave exactly as on an empty registry today.

**Why this priority**: Without bootstrap there is no registry; everything else keys off this layout. Restricting it to write paths keeps `check`'s no-writes promise intact.

**Independent Test**: Call the bootstrap helper twice in two temp dirs and byte-compare `meta.json` + `.gitignore` — identical. Assert `cache/` is git-ignored via `git check-ignore`. Assert a read (`readRegistry`) against a missing home creates nothing on disk.

**Acceptance Scenarios**:

1. **Given** a project without `.translatron/`, **When** a publishing command runs, **Then** `.translatron/{segments,snapshots,meta.json,.gitignore}` exists and `cache/` is ignored.
2. **Given** two independent bootstraps, **When** their `meta.json` and `.gitignore` are compared byte-for-byte, **Then** they are identical (no timestamps, versions, or random values inside).
3. **Given** a project without `.translatron/`, **When** `check`/`status`/`explain`/`doctor` runs, **Then** no `.translatron/` directory is created and behavior matches the empty-registry path.

---

### User Story 2 - Segments publish under content-hash names, idempotently (Priority: P1)

A run publishes revisions via `writeSegment`. The file name is the sha256 of the canonical payload (the same hash stored as the segment checksum), so identical content always yields the identical file: republishing is a no-op success, and same-name-different-content is impossible without a hash collision. Tampering is detectable two ways (filename mismatch, checksum mismatch).

**Why this priority**: This is the mechanism that makes "no conflicts from this folder" a construction guarantee rather than a hope.

**Independent Test**: Publish the same revision set twice → same file name, second write succeeds without duplicating data, `readRegistry` returns each revision once.

**Acceptance Scenarios**:

1. **Given** a revision set, **When** published twice (e.g., retry after a crash), **Then** both calls succeed with the same file name and the registry contains each revision exactly once.
2. **Given** a segment file renamed to a non-matching hash, **When** read, **Then** it is rejected/quarantined as integrity failure (filename MUST equal recomputed payload hash).
3. **Given** a segment with edited content under its original name, **When** read, **Then** checksum verification fails exactly as today.

---

### User Story 3 - Reader deduplicates and polices revision identity (Priority: P2)

Two branches publish overlapping revision sets (same new key synced twice). After merge, `readRegistry` returns each revision ID once; a revision ID appearing with *different* content is rejected as an ancestry violation (v2 doc L2-lite), never silently merged.

**Why this priority**: Merges must be total (no loss) and safe (no silent contradiction).

**Independent Test**: Index two segments sharing an identical revision + one conflicting-ID pair → identical ID appears once; conflicting ID raises integrity error naming the ID.

**Acceptance Scenarios**:

1. **Given** two segments containing byte-identical revisions, **When** indexed, **Then** each revision ID appears exactly once in `revisions` and the index.
2. **Given** two segments with the same revision ID but different content, **When** read, **Then** an integrity error names the offending ID (fail-closed, no silent merge).

---

### User Story 4 - Branch merges provably never conflict (Priority: P2)

Two clones diverge; each appends segments on its own branch; `git merge` completes with exit 0, zero conflict markers, and the merged tree reads back the union of all revisions.

**Why this priority**: This is the user's explicit guarantee — it must be a test, not an assertion.

**Independent Test**: Real-git test with two temp clones (same harness style as the deleted push-convergence test): diverge → append distinct segments → merge → assert exit code, grep tree for `<<<<<<<`, `readRegistry` returns the full union.

**Acceptance Scenarios**:

1. **Given** two diverged branches with distinct segments, **When** merged, **Then** git exits 0 with no conflict markers and every revision from both sides is queryable.
2. **Given** the same content published on both branches, **When** merged, **Then** one file exists (identical bytes collapse) and revisions appear once.

---

### User Story 5 - Only Translatron writes under `.translatron/` (Priority: P3)

No module outside `src/registry/` creates, modifies, renames, or deletes files under the registry home. A boundary test scans for filesystem-write imports/calls targeting the registry path outside the registry module, mirroring the existing core/framework boundary tests.

**Why this priority**: "Dev should not touch it" starts with "our own code touches it only through one door."

**Independent Test**: Boundary scan passes; `resolve`/`migrate`/future writers all funnel through `writeSegment`/`writeSnapshot`.

**Acceptance Scenarios**:

1. **Given** the source tree, **When** scanned for `writeFileSync/renameSync/mkdirSync/unlinkSync` calls resolving under a registry path outside `src/registry/`, **Then** zero matches (tests/helpers excluded).

---

### Edge Cases

- Empty revision set → writer still refuses (existing behavior kept).
- Missing `segments/` on read → empty registry, no error (existing behavior kept; bootstrap is a separate explicit step, not a read side-effect).
- Legacy timestamp-named `*.trn` segments (Epic 003 era) → still read: the reader is filename-agnostic except the new hash-verification, which applies only to content-hash names; legacy names fall back to checksum-only verification. No data migration required.
- `quarantine/` stays inside the registry home (committed): moved-aside corrupt files are tamper evidence preserved in history, consistent with "never silently discard." Quarantine remains opt-in (`quarantineDir` param), default read path only reports.
- Snapshots use content-hash names under the same scheme; `baseSegments` references resolve by file name as today.
- Nothing is ever deleted or renamed in v1 (no compaction): the entire modify/delete merge-conflict class cannot occur.
- `cache/` contents are never read as truth: a corrupt or stale cache is deleted and rebuilt from segments/snapshots (existing disposable-index semantics kept).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST bootstrap `.translatron/{segments,snapshots,meta.json,.gitignore}` idempotently via a new `ensureRegistryHome(dir)` helper (`src/registry/bootstrap.ts`) — OWN-02, REG-INV-01.
- **FR-002**: `meta.json` MUST contain only static format facts (format marker + version) and MUST be byte-deterministic across independent bootstraps — OWN-02.
- **FR-003**: Segment file names MUST equal the sha256 of the canonical payload (identical to the stored checksum); snapshot names follow the same scheme — REG-02, SEC-01.
- **FR-004**: `writeSegment` MUST be idempotent for identical content (same name, no-op success) and MUST refuse to overwrite an existing file whose content differs — REG-INV-02, REG-INV-03.
- **FR-005**: `readSegmentFile` MUST reject files whose name does not match the recomputed payload hash (content-hash names, recognized as 64 lowercase hex + `.trn`/`.trnsnapshot`) and MUST keep checksum-only verification for legacy timestamp names — SEC-01.
- **FR-006**: `readRegistry`/index MUST deduplicate byte-identical revision IDs and MUST raise an integrity error naming any ID with conflicting content — REG-03, SEC-01.
- **FR-007**: `src/registry/git-sync.ts`, `REGISTRY_BRANCH`, branch checkout/merge/push logic, `tests/integration/registry-sync.test.ts`, the now-orphaned `tests/helpers/git-repo.ts`, and dead naming helpers (`segmentTimestamp`, `sanitizeFileSegment`, snapshot timestamp naming) MUST be deleted; no `checkout`/`merge`/`rev-parse --verify <branch>` invocations remain in `src/` — OWN-02, REG-INV-06.
- **FR-008**: Config `registry.dir` default MUST become `./.translatron`; the `remote` field MUST be removed from the schema (verified behavior-free: nothing outside the deleted git-sync reads it; zod strips it from old configs without error) — COMP (config remains loadable).
- **FR-009**: `src/cli/project.ts`, `src/cli.ts` (resolve), `src/cli/commands/migrate.ts` (`--registry-dir` default + help text) MUST repoint to the new default; behavior otherwise unchanged — UX-01.
- **FR-010**: Only `src/registry/` may issue filesystem mutations under the registry home (boundary test, tests/helpers excluded) — OWN-02, REG-INV-01.
- **FR-011**: Constitution §III MUST be amended v1.0.0 → v1.1.0 replacing the orphan-branch clause with the committed-folder clause, keeping all other clauses byte-identical in meaning; `specs/003-B-git-registry/` branch references MUST be corrected — Governance.
- **FR-012**: The real-git merge proof test, bootstrap-determinism test, `.gitignore`-policy test (`git check-ignore`), idempotent-publish test, and ID-dedup/conflict test MUST exist and pass — TEST-01.

### Key Entities

- **Segment file**: `<sha256>.trn` — canonical payload + checksum, immutable, committed.
- **meta.json**: static bootstrap facts only; byte-deterministic.
- **Disposal cache**: `cache/`, ignored, rebuildable, never truth.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Two-branch real-git merge completes with exit 0, zero conflict markers, 100% revision recall across 50 seeded segment pairs.
- **SC-002**: Republishing identical content 100 times yields 1 file and N revisions exactly once (idempotence property).
- **SC-003**: Full suite green with zero references to orphan branches, `checkout`, or `remote` in `src/` (grep-verified), and no test-count regression vs. baseline (deleted push test replaced 1:1 by merge-proof + determinism tests at minimum).
- **SC-004**: A fresh clone shows working `status`/`explain` provenance with zero setup beyond `git clone` (manual verification against fixture).

## Assumptions

- `.translatron/` committed except `cache/` (user-locked). Single-machine and team behavior identical by design.
- `remote` field removed (recommendation; behavior-free per verification). Old configs parse; the key is silently stripped by zod — acceptable and documented.
- Ref plumbing (`registry/git/*`), CAS push, `registry verify/repair` commands, ancestry-cycle checks beyond ID conflicts, segment format v2 metadata, and compaction/deletion are explicitly post-v1 (recorded, not built).
- Snapshot `baseSegments` continues to reference file names (now hashes); no format change beyond naming.
- Plan/tasks/implement follow only on a positive spec review (user condition).
