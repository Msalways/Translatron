# Quickstart: Validation + Recovery

```ts
import { validateBatchOutput } from './src/validation/batch.js';
import { repairBatch } from './src/validation/repair.js';

// 1. Validate one worker batch (pure, no I/O):
const failures = validateBatchOutput(units, translations);
if (failures.length === 0) {
  // stage for write — happy path: 1 model call, no reviewer
}

// 2. Repair failures with exact deterministic errors:
const outcome = await repairBatch(units, failures, {
  retranslate: (requests) => worker.translateBatchWithContext(requests),
  validate: (translations) => validateBatchOutput(units, translations),
  requestReview: async (remaining) => reviewerFixes(remaining), // escalation-only, ≤1 call
});
outcome.failed; // → record FAILED revisions, never write
```

Checks: `npx vitest run tests/unit/validation-v3.test.ts` · `npx tsc --noEmit`.
