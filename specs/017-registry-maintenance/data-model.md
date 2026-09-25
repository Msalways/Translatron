# Data Model: Registry Verify + Repair

**Epic**: 017-registry-maintenance

| Item | Location | Shape |
|---|---|---|
| `FileVerdict` | `cli/registry/verify.ts` | `{ file, kind: segment\|snapshot, ok, errors[] }` |
| `VerifyReport` | `cli/registry/verify.ts` | `{ registryDir, present, verdicts, idConflicts, segmentCount, snapshotCount, ok }` |
| `RepairOutcome` | `cli/registry/repair.ts` | `{ registryDir, quarantined[], validRevisions, cleanAfter, detail[] }` |
| `RegistryStatus` | `cli/registry/status.ts` | `{ registryDir, present, segments, snapshots, revisions, removals, quarantined }` |
| Commands | `registry` group | `status` (exit 0) / `verify` (0 clean, 1 problems) / `repair` (0 done-or-nothing) — no `edit`, no `sync` |
