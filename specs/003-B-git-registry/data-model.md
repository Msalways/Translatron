# Data Model: Git Registry

**Epic**: 003-B-git-registry | **Source**: `src/registry/`

| Item | Shape | Notes |
|---|---|---|
| `SegmentFile` | { format: 'translatron-registry-segment', version: 1, runId, createdAt, revisions: TranslationRevision[], checksum } | `segments/<ts>-<runId>.trn`, immutable |
| `SnapshotFile` | { format, version: 1, createdAt, baseSegments: string[], heads: Record<identityKey, revisionId>, revisions, checksum } | `snapshots/<ts>-<n>.trnsnapshot` |
| `RevisionIndex` | Map<identityKey, TranslationRevision[]> newest-first | in-memory, disposable |
| `identityKey` | `catalogId + sourceLocale + targetLocale + keyPath` | concatenation (documented) |
| `SyncResult` | { pushed, attempts, head } | bounded retry, default 3 |

Perf (10k revisions): write 255ms · index 516ms (< 2s) · snapshot 217ms.
