# Data Model: Committed Machine-Owned Registry Folder

**Epic**: 012-R-registry-folder | **Source**: `src/registry/`

| Item | Shape | Notes |
|---|---|---|
| `.translatron/` home | `{segments/, snapshots/, meta.json, .gitignore, cache/}` | created by `ensureRegistryHome`; only `cache/` ignored |
| `meta.json` | `{format: 'translatron-registry', version: 1}` | static, byte-deterministic, never updated |
| Segment file | `<sha256>.trn` = checksum of canonical payload | identical content → identical file (idempotent publish) |
| Snapshot file | `<sha256>.trnsnapshot` | same scheme; `baseSegments` references file names |
| `SeenRevisionIds` | `Map<id, {hash, file}>` | cross-file identity policing during reads |
| Legacy names | `<timestamp>-<run>.trn` | checksum-only verification, read-only compat |

Perf: naming adds one hash per write (already computed as checksum — zero marginal cost); reads add one string compare per file.
