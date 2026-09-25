# Research: Committed Machine-Owned Registry Folder

**Date**: 2026-09-23 | **Epic**: 012-R-registry-folder (replaces 003 mechanism)

## Decisions

1. **Committed, not ignored** (user-locked): `segments/`, `snapshots/`,
   `meta.json` travel with the branch; only `cache/` is ignored. Team sync
   is normal git flow; single-machine and team behavior identical.
2. **Content-hash names** (`<sha256>.trn` = stored checksum): same-content
   republishes collapse at the filesystem level; same-name-different-content
   requires a hash collision. Uniqueness is construction, not probability.
3. **Canonical serialization reused** (`stableStringify` from Epic 003) for
   both checksum and filename — a second canonicalizer would risk divergence.
4. **Legacy timestamp names read checksum-only**: detected as non-64-hex
   stems; no data migration, no rewrite.
5. **Bootstrap on write paths only**: read commands (`check`, `status`,
   `explain`, `doctor`) never create directories (review finding — preserves
   `check`'s no-writes promise).
6. **Conflicting revision IDs fail into quarantine**, consistent with the
   existing corruption policy (report + move aside when opted in, valid
   history stays queryable) rather than failing whole reads.
7. **`remote` config field removed**: verified behavior-free (only the
   deleted git-sync read it); zod strips it from old configs silently.
8. **`quarantine/` stays committed**: moved-aside files are tamper evidence
   preserved in history, consistent with "never silently discard."
9. **No deletions/renames in v1**: removes the entire modify/delete merge
   class; compaction stays deferred with snapshots additive-only.
10. **Plumbing ref, CAS push, `registry verify/repair`, ancestry cycles,
    format-v2 metadata**: explicitly post-v1 (recorded in spec Assumptions).
