# Implementation Plan: Translation Memory

**Branch**: `007-G-translation-memory` | **Date**: 2026-09-21 | **Spec**: `spec.md`

**Input**: `specs/007-G-translation-memory/spec.md`

## Summary

Exact-match TM index over registry revisions keyed by
(sourceFingerprint, locale, context), accepted-only candidates, origin
priority human > agent > imported, bounded example retrieval. Reads domain +
registry types; no new deps.

## Technical Context

**Language/Version**: TypeScript 5 ESM

**Primary Dependencies**: none new

**Storage**: In-memory index built from registry reader (Epic 003)

**Testing**: vitest, 10k-revision benchmark fixture

**Target Platform**: Node >= 18

**Project Type**: compiler

**Performance Goals**: Lookup ~O(1); 10k index build < 1s

**Constraints**: Exact match only (no fuzzy/vector); FAILED never a candidate

**Scale/Scope**: ~250 lines + tests

## Constitution Check

- V: PASS — this epic IS the cost-discipline mechanism.
- I: PASS (deterministic lookup).

## Project Structure

```text
src/
└── memory/
    ├── translation-memory.ts  # index + lookup + examples
    └── index.ts
tests/
└── unit/translation-memory.test.ts
```

## Complexity Tracking

No violations.
