# Quickstart: Git Registry

> **SUPERSEDED by `specs/012-R-registry-folder`**: `gitSync` no longer exists;
> see `specs/012-R-registry-folder/quickstart.md` (to be written on implement).
> Retained as the design record.

```ts
import { writeSegment, readRegistry, writeSnapshot, gitSync, REGISTRY_BRANCH } from './src/registry/index.js';

// After a run completes (one segment per run):
writeSegment({ registryDir: './.translatron/registry', runId, revisions });

// Rebuild the in-memory index (fresh clone safe):
const { revisions, index, quarantined } = readRegistry({
  registryDir: './.translatron/registry',
  quarantineDir: './.translatron/registry/quarantine',
});
if (quarantined.length > 0) console.warn('quarantined:', quarantined);

// Periodically compact:
writeSnapshot({ registryDir: './.translatron/registry', baseSegments: ['...trn'], index });

// Share with the team:
await gitSync({ cwd: './.translatron/registry' }); // pushes translatron/registry
```

Checks: `npx vitest run tests/unit/registry.test.ts tests/integration/registry-sync.test.ts` · `npx tsc --noEmit`.
