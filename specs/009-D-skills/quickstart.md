# Quickstart: Skills System

```ts
import { loadSkills } from './src/skills/loader.js';
import { resolveSkillsForUnit, currentSkillMap, skillMaterialForLocale, toAppliedSkills } from './src/skills/index.js';

// 1. Load once per run (packages + explicit .md refs):
const { skills, warnings } = await loadSkills('./translatron/skills', ['./docs/localization-guidelines.md']);

// 2. Per-unit chain for workers/planner grouping:
const chain = resolveSkillsForUnit(skills, { locale: 'ja-JP', keyPath: 'checkout.payNow' });
// → [global, ja, ja-JP, ecommerce]

// 3. Reconciler staleness input + revision provenance:
const current = currentSkillMap(skills, 'ja-JP');
const applied = toAppliedSkills(chain); // → revision.skillFingerprints

// 4. Worker material fragment (compiler adds TM examples):
const material = skillMaterialForLocale(skills, 'ja-JP');
```

Checks: `npx vitest run tests/unit/skills.test.ts` · `npx tsc --noEmit`.
