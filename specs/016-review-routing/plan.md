# Implementation Plan: Review Routing

**Branch**: `016-review-routing` | **Date**: 2026-09-23 | **Spec**: `spec.md`

**Input**: reviewed spec (verdict BUILD — single-mechanism design verified against reconciler precedence: NEEDS_REVIEW outranks MANUAL, so review-wins-over-force falls out for free)

## Summary

Additive `policies.reviewKeys`; engine `requireReviewFor` → resolved `needsReviewKeys`; stale-`review` via pure re-reconcile; skipped-line printing in `runV3Sync`; amend 014 deferral note.

## Technical Context

- Deps: none new. Touch: `config/schema.ts` (1 field), `core/compiler.ts` (input field + resolve + conditional re-reconcile), `cli/sync-v3.ts` (mapping + printing).
- Precedence NEEDS_REVIEW > MANUAL is existing reconciler behavior — no code needed for the force-vs-review edge.
- Constitution: I PASS (pure routing); II/III/IV/V unaffected.

## Complexity Tracking

No violations.
