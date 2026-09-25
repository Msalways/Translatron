# Implementation Plan: Committed Machine-Owned Registry Folder

**Branch**: `012-R-registry-folder` | **Date**: 2026-09-23 | **Spec**: `spec.md`

**Input**: `specs/012-R-registry-folder/spec.md` (reviewed, verdict BUILD)

## Summary

Replace the orphan-branch mechanism with a committed `.translatron/` folder:
new `bootstrap.ts` (idempotent home + deterministic meta + nested ignore),
content-hash segment/snapshot naming in writer + snapshot writer, name
verification + ID dedup/conflict rules in reader, deletion of git-sync and its
test/helper, config default repoint + `remote` removal, CLI wording updates,
constitution §III amendment. Reader keeps checksum-only fallback for legacy
timestamp names; no data migration.

## Technical Context

**Language/Version**: TypeScript 5 ESM (strict)

**Primary Dependencies**: node:crypto, node:fs (existing); zod (existing)

**Storage**: `.translatron/{segments,snapshots,meta.json}` committed; `cache/` ignored

**Testing**: vitest; real-git merge proof reuses temp-clone pattern from deleted test

**Target Platform**: Node >= 18, git on PATH for merge-proof test only

**Project Type**: compiler infra

**Performance Goals**: No perf-sensitive paths (naming is one hash per write; read adds one string compare per file)

**Constraints**: No `checkout`/`merge` in `src/` after; check/status/explain/doctor stay side-effect-free; zod strips unknown `remote` key silently

**Scale/Scope**: ~7 files edited, 3 deleted, 2 new modules, ~6 test files touched

## Constitution Check

- §III amended v1.0.0 → v1.1.0 (reason: storage mechanism corrected; migration note: reader accepts legacy names, no data rewrite).
- Gates I, II, IV, V unaffected.

## Project Structure

```text
src/registry/
  bootstrap.ts   # NEW: ensureRegistryHome + static meta + nested ignore
  schema.ts      # EDIT: branch constant/docs removed (keep dirs, formats, versions, stableStringify)
  writer.ts      # EDIT: content-hash names, idempotent republish, clobber refusal
  snapshot.ts    # EDIT: content-hash names
  reader.ts      # EDIT: name verification, ID dedup/conflict rule
  index.ts       # EDIT: drop git-sync export
  git-sync.ts    # DELETE
tests/
  integration/registry-sync.test.ts  # DELETE
  helpers/git-repo.ts                # DELETE (sole importer gone — verified)
  unit/registry.test.ts              # EDIT: duplicate-run test → idempotence test
  integration/risk-matrix.test.ts    # EDIT: duplicate-run test → idempotence test
  unit/cli-ux.test.ts                # EDIT: registry config shape assertions
  integration/registry-merge.test.ts # NEW: real-git merge proof + determinism + ignore-policy tests
```

## Complexity Tracking

No violations (deletions only reduce surface).
