# Tasks: Config v3 Ergonomics + v3 Sync Wiring

**Input**: `specs/015-config-v3-sync/` (reviewed spec)

- [x] C-T001 `src/config/normalize.ts`: `normalizeConfig` (locales/model/skills.paths/execution → canonical + warnings) + locale display table; matrix tests in `tests/unit/config-v3.test.ts`
- [x] C-T002 `EngineInput.limits?: Partial<ExecutionLimits>` merged over DEFAULT_EXECUTION_LIMITS (R&D 8) in `runSyncEngine`; test override respected
- [x] C-T003 `assembleEngineInput(state, normalized, flags, runtime)` (pure, in `src/cli/sync-v3.ts` or `src/cli/project.ts`); v3-default `sync` plus `--v2/--dry-run/--affected-by-skill` wiring with ProgressRenderer + JSON + exit codes; assembly tests with StubRuntime
- [x] C-T004 Boundary test green unchanged + full suite + research/data-model/quickstart; mark tasks
