# Implementation Plan: Validation + Recovery

**Branch**: `006-F-validation-recovery` | **Date**: 2026-09-21 | **Spec**: `spec.md`

**Input**: `specs/006-F-validation-recovery/spec.md`

## Summary

Split validators (`result/placeholders/icu/markup`), golden fixtures per
category, repair flow carrying exact deterministic failures, retry budgets,
escalation-only reviewer hook. Extends existing pipeline where overlapping.

## Technical Context

**Language/Version**: TypeScript 5 ESM

**Primary Dependencies**: none new (ICU check via lightweight parser; document choice in research.md)

**Storage**: N/A

**Testing**: vitest golden fixtures `tests/fixtures/validation/<category>/`

**Target Platform**: Node >= 18

**Project Type**: compiler

**Performance Goals**: 1k validations < 500ms

**Constraints**: Validators decide; agent never sole validator; no writes on failure

**Scale/Scope**: ~500 lines + fixtures

## Constitution Check

- I: PASS (deterministic acceptance).
- IV: PASS (failures recorded, never silent).

## Project Structure

```text
src/
└── validation/
    ├── result.ts        # schema/ID/coverage
    ├── placeholders.ts  # exact placeholder preservation
    ├── icu.ts           # ICU/message syntax
    ├── markup.ts        # HTML/XML/React tags
    └── repair.ts        # repair orchestration + budgets
```

## Complexity Tracking

No violations.
