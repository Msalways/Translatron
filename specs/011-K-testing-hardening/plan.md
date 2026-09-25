# Implementation Plan: Testing Hardening

**Branch**: `011-K-testing-hardening` | **Date**: 2026-09-21 | **Spec**: `spec.md`

**Input**: `specs/011-K-testing-hardening/spec.md`

## Summary

Close the 10-scenario risk matrix with dedicated regression tests, expand
property suites, add agent-contract (stub runtime) + opt-in live provider
tests, CLI snapshots, coverage thresholds in CI. Runs across all prior epics;
scheduled last but started incrementally.

## Technical Context

**Language/Version**: TypeScript 5 ESM

**Primary Dependencies**: vitest, fast-check (existing); `RUN_LIVE_TESTS=1` gate for keyed tests

**Storage**: Temp git repos + v2 fixtures (reuse helpers)

**Testing**: vitest (unit/integration/property/contract/snapshot)

**Target Platform**: Node >= 18, CI (GitHub Actions)

**Project Type**: test-infra

**Performance Goals**: Full key-free suite < 5 min

**Constraints**: No test requires network/keys by default; flake check = 3 consecutive greens

**Scale/Scope**: ~15 new test files + CI config

## Constitution Check

- All sections: PASS (verification-only epic).

## Project Structure

```text
tests/
├── unit/            # + property suites
├── integration/     # registry-sync, migration, 10-lang
├── contract/        # agent-runtime contract (stub)
├── live/            # opt-in provider tests (gated)
└── snapshot/        # CLI golden outputs
.github/workflows/   # coverage thresholds
```

## Complexity Tracking

No violations.
