# Quickstart: Translation Memory

```ts
import { readRegistry } from './src/registry/reader.js';
import { TranslationMemory } from './src/memory/index.js';

const { revisions } = readRegistry({ registryDir: './translatron/registry' });
const tm = new TranslationMemory(revisions);

// Before any model call (compiler does this per unit in Epic 008):
const hit = tm.lookup({ sourceHash: unit.sourceHash, locale: 'fr-FR', contextFingerprint });
if (hit !== null) {
  // re-validate hit.revision via validateBatchOutput, then reuse — zero model calls
}

// Worker context examples:
const examples = tm.getExamples('fr-FR', 5, unit.keyPath);
```

Checks: `npx vitest run tests/unit/translation-memory.test.ts` · `npx tsc --noEmit`.
