# Research: Validation + Recovery

**Date**: 2026-09-21 | **Epic**: 006-F-validation-recovery

## Split from the legacy pipeline

`src/validation/index.ts` (`TranslationValidationPipeline`) stays untouched
for the v2 compiler path (length ratio, source leakage, brand names).
Epic 006 adds pure-function validators beside it:

- `result.ts` — ID coverage (exact/dup/unknown/empty)
- `placeholders.ts` — exact multiset via existing `extractPlaceholders`
- `icu.ts` — balanced-brace parse, known-type check, `other`-branch rule,
  source/target skeleton match (strict subset, not a full ICU parser)
- `markup.ts` — tag-name multiset when the source contains tags
- `batch.ts` — composer: structural → placeholders → ICU/markup (conditional)
- `repair.ts` — budget loop with exact-failure retranslate + once-only reviewer

The unified pipeline (new + legacy rules) lands with the v3 compiler
(Epic 008/010); until then each layer is independently tested.

## Decisions

1. Failures carry exact names (`Missing {count} in key`) — repair prompts
   quote them verbatim, never paraphrased.
2. `REPAIR_BUDGETS` duplicated (not imported) from the runtime middleware to
   avoid validation → deepagents layering.
3. Reviewer output is accepted per contract but MUST be re-validated by the
   caller pipeline before any write (documented at the call site).
4. Golden fixtures as checked-in JSON (`tests/fixtures/validation/`) double
   as documentation of each validator's contract.
