# Implementation Plan: Key Coverage Across Locales

**Branch**: `013-key-coverage` | **Date**: 2026-09-23 | **Spec**: `spec.md`

**Input**: `specs/013-key-coverage/spec.md` (reviewed, verdict BUILD)

## Summary

New pure `src/core/coverage.ts` (target-only key detection with shared glob
dialect), `runCheck` orphan section in the P6 golden format with
error-by-default severity, additive `catalogs.targetOnly` config, dynamic
source-locale line, `--catalogs-only` forward-compat flag. Reconciler loop
untouched; `matchesKeyPattern` reused from `skills/resolver.ts` (pure,
stateless — documented layering note).

## Technical Context

**Language/Version**: TypeScript 5 ESM (strict)

**Primary Dependencies**: none new

**Storage**: N/A (pure functions over catalog snapshots)

**Testing**: vitest; golden-output assertions; synthetic 10k×10 perf probe

**Target Platform**: Node >= 18

**Project Type**: compiler (check path)

**Performance Goals**: 10k keys × 10 locales < 5s (map lookups, O(keys × locales))

**Constraints**: No reconciler shape changes; existing check goldens byte-identical when no orphans; no LLM/network/writes

**Scale/Scope**: 1 new module, 3 edited files (check, cli, config schema), 1 test file extended + new coverage tests

## Constitution Check

- I: PASS (pure deterministic detection).
- II: PASS (no framework imports; core→skills import is a pure function, no state).
- III/IV/V: unaffected.

## Project Structure

```text
src/
  core/coverage.ts            # NEW: findTargetOnlyKeys
  cli/commands/check.ts       # EDIT: orphan section, severity, sourceLocale, catalogsOnly input
  cli.ts                      # EDIT: --catalogs-only flag, targetOnly + sourceLocale wiring
  config/schema.ts            # EDIT: additive optional catalogs.targetOnly
tests/
  unit/coverage.test.ts       # NEW: S11/S12 unit matrix + shape-no-payload test
  unit/cli-ux.test.ts         # EDIT: existing check tests gain sourceLocale; new golden/flag tests
```

## Complexity Tracking

No violations.
