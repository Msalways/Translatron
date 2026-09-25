# Implementation Plan: Config v3 Ergonomics + v3 Sync Wiring

**Branch**: `015-config-v3-sync` | **Date**: 2026-09-23 | **Spec**: `spec.md`

**Input**: reviewed spec (verdict BUILD)

## Summary

Pure `normalizeConfig` (v3 shorthands → canonical, warnings for defaults/unknowns, throws for contradictions), additive `limits` on `EngineInput`, pure `assembleEngineInput` + `sync --v3` wiring (progress/JSON/exit codes), v2 path untouched.

## Technical Context

- Language/Version: TypeScript 5 ESM; deps: none new.
- Constitution Check: I/II PASS (no framework imports; relative deepagents import verified against the bare-specifier regex); III/IV/V unaffected.
- Structure: `src/config/normalize.ts` (new); `src/core/compiler.ts` (limits field, 3 lines); `src/cli/sync-v3.ts` (new: assembly + handler); `src/cli.ts` (flags only); tests `tests/unit/config-v3.test.ts` + assembly tests.

## Complexity Tracking

No violations. Review corrections applied pre-build: guaranteed non-empty providers (engine `providers[0]` safety); unknown keys warn (COMP-02); NormalizedV3Config carries `warnings`.
