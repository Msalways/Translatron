# Data Model: Validation + Recovery

**Epic**: 006-F-validation-recovery | **Source**: `src/validation/`

| Item | Shape | Notes |
|---|---|---|
| `UnitFailure` | { unitId, keyPath, errors: ValidationError[] } | per-unit deterministic failures |
| `ValidationError` | { type, message, field? } | reused legacy shape; types: MISSING/DUPLICATE/UNKNOWN_ID, EMPTY_TRANSLATION, PLACEHOLDER_MISMATCH, ICU_MISMATCH, MARKUP_MISMATCH |
| `RepairRequest` | { unit, errors, attempt } | exact errors attached, never paraphrased |
| `RepairOutcome` | { accepted, failed, repairs, reviews } | repairs = rounds, reviews ∈ {0,1} |
| `RepairDeps` | { retranslate, validate, requestReview?, maxRepairs? } | orchestrator injects worker-backed callbacks |
| `REPAIR_BUDGETS` | { repair: 2, review: 1 } | mirrors runtime budgets |

1k validations measured < 50ms (well under the 500ms budget).
