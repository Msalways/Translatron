# Research: Registry Verify + Repair

**Date**: 2026-09-23 | **Epic**: 017-registry-maintenance

## Decisions

1. **Verify reuses reader verifiers, not copies**: `readSegmentFileFull`,
   `readSnapshotFile`, `checkRevisionConflicts`/`trackRevisionIds` compose
   into per-file verdicts. One implementation of each rule, everywhere.
2. **Test caught a model subtlety**: appending whitespace to a segment does
   NOT break verification — checksums cover parsed content, not raw bytes.
   Correct (whitespace isn't tampering); fixtures tamper inside the body.
3. **`sync` and plumbing are specified non-goals** (FR-003/FR-005): the
   committed-folder model syncs via normal git flow — proven by 012's merge
   test. `refs/translatron/registry` is SUPERSEDED with evidence, not
   deferred: every §30 criterion it served is met by other means.
4. **Repair = quarantine + re-verify**: no regeneration (history is the
   only source of its own truth), no deletion (moved-aside files persist
   under `quarantine/`).
5. **Two self-caught defects during implementation**: a `require()` in ESM
   and a dead-code line in the report renderer — both fixed before tests ran.
