# Tasks: CLI/UX

**Input**: `specs/010-H-cli-ux/`

## Phase 1: Events + renderer (P1)

- [x] U-T001 Create `src/core/events.ts`, `src/cli/renderer/`; scripted event-stream fixture

## Phase 2: Progress + sync output (P1) 🎯 MVP

**Independent Test**: Renderer snapshots match §29 golden shape.

- [x] U-T002 Snapshot tests for progress + summary
- [x] U-T003 `events.ts` bus + adapter (FR-001)
- [x] U-T004 `renderer/progress.ts` + `json.ts` (FR-002, FR-003)

## Phase 3: doctor/explain/status/check (P2/P3)

**Independent Test**: `--json` validates; `check` exits 0 clean / non-zero broken.

- [x] U-T005 Command tests (golden + exit codes)
- [x] U-T006 `doctor.ts` + `explain.ts` (FR-004, FR-005)
- [x] U-T007 `check.ts` + `status.ts` provenance view (FR-006, FR-007)

## Phase 4: Polish

- [x] U-T008 Conflict UX (semantic prompt); docs
