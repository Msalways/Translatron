# Research: Git Registry

> **SUPERSEDED by `specs/012-R-registry-folder`** (constitution v1.1.0).
> Retained as the design record.

**Date**: 2026-09-21 | **Epic**: 003-B-git-registry

## Format choice

`.trn` = pretty-printed JSON `{format, version, runId, createdAt, revisions,
checksum}`. Human-inspectable via git, parseable without custom binary code.
Checksum covers canonical key-sorted JSON (`stableStringify`) — **required**,
because zod `.extend()` reorders keys on parse (caught by tests: plain
`JSON.stringify` checksums failed round-trip verification).

## Sync protocol

git CLI subprocesses (zero new deps, reuses user auth) behind an injectable
`GitRunner` seam. `fetch → ensure branch → push → bounded non-FF retry (3) →
fetch + additive merge → retry`. `merge --allow-unrelated-histories`: two
clones bootstrapping the orphan branch independently have distinct roots;
segment files are unique per run so union merges succeed by construction.
Genuine same-file conflicts abort with a semantic error (invariant violation).
Never force-pushes.

## Decisions

1. `ensureRegistryBranch` checks out existing branch, else `--orphan` creates.
2. Corrupt segments move to `quarantine/*.corrupt` (opt-in dir) and are
   reported; valid revisions stay queryable. No silent drops.
3. Snapshots add compaction files; segments are never deleted by writers.
4. Snapshot verification recomputes heads — tamper (heads or checksum) throws.
5. Integration test uses real git (temp bare remote + clones); 60s timeout for
   Windows git subprocess latency.
