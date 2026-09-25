# Quickstart: Parallel Orchestration

```ts
import { DeepAgentRuntime } from './src/runtime/deepagents/index.js';
import { filterPlanForRetry, aggregateResults } from './src/runtime/deepagents/index.js';
import { adaptRuntimeEvent, deriveRunStatus } from './src/core/events.js';

// Parallel supervised run (caps from plan.limits, built by the planner):
const runtime = new DeepAgentRuntime();
for await (const event of runtime.execute(plan, context)) {
  const normalized = adaptRuntimeEvent(event); // feed CLI progress (Epic 010)
}

// Partial success → surgical retry of one locale:
const retryPlan = filterPlanForRetry(plan, 'ja-JP'); // null if locale not planned
if (retryPlan !== null) {
  for await (const event of runtime.execute(retryPlan, context)) { /* ... */ }
}
```

Checks: `npx vitest run tests/unit/orchestration.test.ts` · `npx tsc --noEmit`.
