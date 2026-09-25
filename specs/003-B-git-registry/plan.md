# Implementation Plan: Git Registry

> **SUPERSEDED by `specs/012-R-registry-folder`** (constitution v1.1.0).
> Retained as the design record.

**Branch**: `003-B-git-registry` | **Date**: 2026-09-21 | **Spec**: `spec.md`

**Input**: `specs/003-B-git-registry/spec.md`

## Summary

Versioned `.trn` segment format with checksums, immutable per-run writer,
in-memory reader/indexer with disposable cache, git-CLI sync with bounded
non-FF retry, snapshot compaction + quarantine recovery. Depends on Epic 001.

## Technical Context

**Language/Version**: TypeScript 5 ESM

**Primary Dependencies**: none new (git via child_process, node:crypto)

**Storage**: Orphan branch `translatron/registry`: `segments/*.trn`, `snapshots/*.trnsnapshot`

**Testing**: vitest + temp git repos (`git init` in tmp dirs)

**Target Platform**: Node >= 18, git >= 2.30

**Project Type**: compiler infra

**Performance Goals**: Index 10k revisions < 2s; incremental segment append O(new)

**Constraints**: Additive merge only; never delete/force-push; quarantine-not-crash on corruption

**Scale/Scope**: ~800 lines + sync simulations

## Constitution Check

- III: PASS — this epic IMPLEMENTS the canonical registry replacing SQLite.
- I: PASS (serialization + merge deterministic).
- II: PASS (no agent imports).

## Project Structure

```text
src/
└── registry/
    ├── schema.ts     # segment/snapshot zod schemas + version
    ├── writer.ts     # one immutable segment per run
    ├── reader.ts     # parse + identity→revision index + cache
    ├── git-sync.ts   # fetch/merge/push/retry via git CLI
    ├── snapshot.ts   # compaction + verify
    └── index.ts
tests/
├── unit/registry.test.ts
└── integration/registry-sync.test.ts  # concurrent-push simulation
```

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| git CLI subprocess (not isomorphic-git dep) | zero new deps, uses user's auth | library adds API surface + auth complexity |
