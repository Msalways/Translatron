# Implementation Plan: v3 Docs + Onboarding Sweep

**Branch**: `018-docs-onboarding` | **Date**: 2026-09-24 | **Spec**: `spec.md`

**Input**: reviewed spec (verdict BUILD; init-overwrite parity verified pre-build)

## Summary

README v3 section + config blocks; API.md new-module sections; grep anti-rot tests; `init --v3` scaffold + goldens; doctor zero-match glob warnings + CLI wiring.

## Technical Context

- Deps: none new. Touch: README.md, API.md (docs only); `src/cli.ts` (init flag); `src/cli/commands/doctor.ts` (optional inputs); tests.
- Constitution: docs + additive surfaces only; all gates unaffected.

## Complexity Tracking

No violations.
