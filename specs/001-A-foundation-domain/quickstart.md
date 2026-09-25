# Quickstart: Foundation Domain Model

```ts
import {
  TranslationRevisionSchema,
  DEFAULT_EXECUTION_LIMITS,
  TRANSLATION_STATUSES,
  type RunPlan,
} from './src/core/domain.js';

// Validate a persisted revision (unknown origin rejected)
const rev = TranslationRevisionSchema.parse(JSON.parse(segmentRecordJson));

// Build a frozen run plan input (planner freezes in Epic 002)
const plan: RunPlan = {
  runId: 'run_01',
  languages: [],
  totalUnits: 0,
  limits: DEFAULT_EXECUTION_LIMITS,
  policy: {},
};
```

Run checks: `npx vitest run tests/unit/domain.test.ts` · `npx tsc --noEmit`.
