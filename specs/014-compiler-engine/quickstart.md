# Quickstart: v3 Sync Engine (Compiler)

```ts
import { runSyncEngine } from './src/core/compiler.js';
import { StubRuntime } from './src/runtime/stub.js'; // tests/dry-runs; production passes DeepAgentRuntime

const result = await runSyncEngine({
  catalogId: 'main',
  sourceLocale: 'en-GB',
  sourceUnits,       // from catalog adapter
  targets,           // TargetSnapshot[] (current file state)
  targetFiles,       // { [locale]: filePath }
  revisions,         // from readRegistry
  skills,            // LoadedSkill[] (already loaded)
  providers,         // config.providers (legacy resolution)
  targetOnly,        // config.catalogs?.targetOnly
  policies,          // config.policies (all-defaulted)
  registryDir,       // .translatron home
  projectDir,        // for best-effort git HEAD
  runtime,           // injected TranslationRuntime
  dryRun,            // plan + report, zero writes
});

if ('plannedTranslations' in result) { /* dry run */ }
else {
  result.status;     // complete | partial_success | failed
  result.summaries;  // per-locale translated/failed
  result.segmentFile;
}
```

Checks: `npx vitest run tests/integration/compiler-engine.test.ts tests/unit/revisions.test.ts` · `npx tsc --noEmit`.
