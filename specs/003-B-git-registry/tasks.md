# Tasks: Git Registry

**Input**: `specs/003-B-git-registry/`

## Phase 1: Setup

- [x] B-T001 Create `src/registry/`, temp-git test helper in `tests/helpers/git-repo.ts`

## Phase 2: Format + writer/reader (P1) 🎯 MVP

**Independent Test**: Revision round-trip through segment file; index queries return expected graphs.

- [x] B-T002 [P] Schema + checksum tests in `tests/unit/registry.test.ts`
- [x] B-T003 `schema.ts`: segment/snapshot zod + version (FR-005)
- [x] B-T004 `writer.ts`: per-run immutable segment (FR-001)
- [x] B-T005 `reader.ts`: parse + index + disposable cache rebuild (FR-002)

**Checkpoint**: Write → read → query works locally.

## Phase 3: Git sync + snapshot (P1/P2)

**Independent Test**: Concurrent-push simulation converges; corrupt segment quarantined.

- [x] B-T006 Sync simulation tests in `tests/integration/registry-sync.test.ts`
- [x] B-T007 `git-sync.ts`: fetch/head/merge/push/bounded retry (FR-003)
- [x] B-T008 `snapshot.ts`: compact + verify + quarantine (FR-004)

## Phase 4: Polish

- [x] B-T009 10k-revision index benchmark; docs
