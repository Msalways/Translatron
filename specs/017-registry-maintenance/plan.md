# Implementation Plan: Registry Verify + Repair

**Branch**: `017-registry-maintenance` | **Date**: 2026-09-23 | **Spec**: `spec.md`

**Input**: reviewed spec (verdict BUILD)

## Summary

Pure `verifyRegistry`/`repairRegistry`/`registryStatus` in `src/cli/registry/` reusing reader verifiers; commander `registry` group (status/verify/repair, no edit/sync); absence-aware (missing home is a verdict, not a crash).

## Technical Context

- Deps: none new. Touch: `src/cli/registry/{verify,repair,status}.ts` (new), `src/cli.ts` (group wiring).
- Constitution: I PASS (pure reads + quarantine-moves); II–V unaffected.

## Complexity Tracking

No violations.
