# Quickstart: Deep Agents Runtime + Language Worker

```ts
import { buildRunPlan } from './src/core/planner.js';
import { DEFAULT_EXECUTION_LIMITS } from './src/core/domain.js';
import { StubRuntime, DeepAgentRuntime } from './src/runtime/index.js';
import { DeepAgentRuntime as Live } from './src/runtime/deepagents/index.js';

// Offline (tests, dry runs) — zero model calls:
for await (const event of new StubRuntime().execute(plan, context)) {
  console.log(event.type, event);
}

// Live — needs provider env keys (e.g. OPENAI_API_KEY for "openai:..."):
for await (const event of new Live().execute(plan, context)) {
  console.log(event.type, event);
}
```

Checks: `npx vitest run tests/unit/runtime.test.ts` · `npx tsc --noEmit`.
