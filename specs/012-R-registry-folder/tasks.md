# Tasks: Committed Machine-Owned Registry Folder

**Input**: `specs/012-R-registry-folder/` (reviewed spec + plan)

## Phase 1: New bootstrap module (US1) 🎯 MVP slice 1

**Independent Test**: Two bootstraps byte-identical; `git check-ignore` covers `cache/`; read path creates nothing.

- [x] R-T001 `src/registry/bootstrap.ts`: `ensureRegistryHome(dir)` (segments/, snapshots/, static meta.json, nested `.gitignore` for `cache/`), idempotent, deterministic; export from `index.ts`
- [x] R-T002 Bootstrap tests (determinism, ignore policy, layout) in new `tests/integration/registry-merge.test.ts` (part 1)

## Phase 2: Content-hash naming + idempotent writer (US2)

**Independent Test**: Same content twice → same name, success, single copy; renamed file rejected.

- [x] R-T003 `writer.ts` + `snapshot.ts`: `<sha256>.trn` / `<sha256>.trnsnapshot` names from canonical payload (= stored checksum); identical content → no-op success; existing different-content file → throw; remove `segmentTimestamp`/`sanitizeFileSegment` if unreferenced
- [x] R-T004 Rewrite duplicate-run tests → idempotence tests in `tests/unit/registry.test.ts` + `tests/integration/risk-matrix.test.ts`

## Phase 3: Reader verification + identity policing (US3)

**Independent Test**: 64-hex names verified against payload; legacy names checksum-only; identical IDs deduped; conflicting IDs raise naming both.

- [x] R-T005 `reader.ts`: name↔hash verification rule, ID dedup (identical) / integrity error (conflicting), legacy fallback
- [x] R-T006 Reader tests for the above in `tests/unit/registry.test.ts`

## Phase 4: Deletion + repoint (US5 + FR-007…FR-011)

- [x] R-T007 Delete `git-sync.ts`, `registry-sync.test.ts`, `helpers/git-repo.ts`; drop barrel export; grep-verify zero `checkout|merge|REGISTRY_BRANCH` in `src/`
- [x] R-T008 Config: default `./.translatron`, remove `remote`; update `cli-ux.test.ts` shape assertions; repoint `project.ts` default, `migrate.ts` flag default/text, resolve help text
- [x] R-T009 Amend constitution §III → v1.1.0; correct `specs/003` branch references + registry docstrings

## Phase 5: Merge proof (US4) + closeout

**Independent Test**: Real-git two-clone merge exits 0, no markers, full recall (50 seeded pairs).

- [x] R-T010 Merge-proof test in `registry-merge.test.ts` (part 2)
- [x] R-T011 Full suite + `tsc` + spec checklist validation; mark tasks
