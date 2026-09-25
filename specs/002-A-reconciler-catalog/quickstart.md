# Quickstart: Reconciler + Catalog Abstraction

```ts
import { GenericJsonAdapter } from './src/catalogs/index.js';
import { reconcile } from './src/core/reconciler.js';
import { buildRunPlan } from './src/core/planner.js';
import { DEFAULT_EXECUTION_LIMITS } from './src/core/domain.js';

const adapter = new GenericJsonAdapter();
const files = await adapter.discover(['./locales/en-GB.json']);
const [source] = await adapter.read(files, { locale: 'en-GB' });
const [fr] = await adapter.read(await adapter.discover(['./locales/fr-FR.json']), { locale: 'fr-FR' });

const { reconciled, workUnits } = reconcile({
  sourceLocale: 'en-GB', catalogId: 'main',
  sourceUnits: source.units,
  targets: [{ locale: 'fr-FR', entries: Object.fromEntries(fr.units.map(u => [u.keyPath, { text: u.sourceText, targetHash: u.sourceHash }])) }],
  revisions: [], // Epic 003 registry supplies these
});

const plan = buildRunPlan({
  runId: 'run_1', limits: DEFAULT_EXECUTION_LIMITS, policy: {},
  languages: [{ locale: 'fr-FR', skills: [], units: workUnits }],
});
```

Checks: `npx vitest run tests/unit/catalogs.test.ts tests/unit/reconciler.test.ts tests/unit/planner.test.ts` · `npx tsc --noEmit`.
