# Quickstart: Committed Machine-Owned Registry Folder

```ts
import { ensureRegistryHome } from './src/registry/bootstrap.js';
import { writeSegment, readRegistry } from './src/registry/index.js';

// Publishing path (migrate/resolve/sync): bootstrap once, then write.
ensureRegistryHome('./.translatron');
const { fileName } = writeSegment({ registryDir: './.translatron', runId, revisions });
// fileName is the payload sha256 — republishing identical content is a no-op.

// Any path: read (never creates anything, never touches git branches).
const { revisions, index, quarantined } = readRegistry({ registryDir: './.translatron' });
```

Team flow: commit `.translatron/` with the branch. Merges combine distinct
segments automatically; identical content collapses to one file; conflicting
revision IDs quarantine loudly. No checkout switching, no ref plumbing in v1.

Checks: `npx vitest run tests/unit/registry.test.ts tests/integration/registry-merge.test.ts` · `npx tsc --noEmit`.
