# Research: Config v3 Ergonomics + v3 Sync Wiring

**Date**: 2026-09-23 | **Epic**: 015-config-v3-sync

## Decisions

1. **Normalization is pure and total**: `normalizeConfig` guarantees non-empty
   providers (minimal form defaults to `openai:gpt-5` + warning — the engine
   indexes `providers[0]`, so this is a safety invariant, not just UX).
2. **Unknown top-level keys warn, contradictions throw**: COMP-02 forbids
   rejecting legacy shapes; ambiguity (providers+model) must fail fast.
3. **ENGINE_LIMITS deduped**: it duplicated `DEFAULT_EXECUTION_LIMITS`
   byte-for-byte; removed, canonical constant used in both engine and
   normalization (config imports domain, never the engine — layering).
4. **Boundary test needed NO amendment**: the Epic 005 regex matches only
   bare `deepagents` / `@langchain/*` specifiers; the relative factory-class
   import in `cli.ts` doesn't trip it. FR-013's premise was wrong in the
   safe direction — recorded in the spec Notes; SC-003 pins the test green.
5. **Missing target files yield empty snapshots** (found during live smoke:
   fresh projects planned zero work because locales without files had no
   snapshot). This also makes `check` report MISSING for uncreated locales —
   the desired CI-02 semantic.
6. **`loadProjectState` takes an optional config override** (additive;
   existing callers unaffected) so v3 shorthands flow without touching v2.
7. **v2 `sync` untouched**: flags added, one branch line; verified by the
   unchanged v2 suites + live `--help`.
8. **`toLegacyConfig` moved to `config/normalize.ts`** and `loadConfig` gained
   a v3 fallback (review finding: `check`/`status`/`doctor`/`registry` all
   rejected v3-minimal configs — only `sync --v3` worked. Now every command
   accepts them; broken legacy still throws its original error).
   `defineConfig` accepts the v3 shorthand at type level.
