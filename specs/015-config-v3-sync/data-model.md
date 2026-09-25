# Data Model: Config v3 Ergonomics + v3 Sync Wiring

**Epic**: 015-config-v3-sync

| Item | Location | Shape |
|---|---|---|
| `NormalizedV3Config` | `config/normalize.ts` | `{ sourceLocale, targetLanguages, providers (non-empty), skillsDir, skillPaths, limits, maxUnitsPerBatch, warnings }` |
| `EngineInput.limits` | `core/compiler.ts` | `Partial<ExecutionLimits>`, merged over defaults at plan time |
| `assembleEngineInput` | `cli/sync-v3.ts` | `(state, normalized, flags, runtime) → EngineInput` (pure) |
| `toLegacyConfig` | `cli/sync-v3.ts` | v3 shorthands consumed; legacy keys pass through; validated output |
| `loadRawConfig` | `config/loader.ts` | unvalidated cosmiconfig search (v3 entry point) |
| `sync` flags | `cli.ts` | v3 default; `--v2`, `--dry-run`, `--affected-by-skill`; exits 0/0/3 (complete/partial/failed) |
