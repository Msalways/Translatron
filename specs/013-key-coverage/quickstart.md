# Quickstart: Key Coverage Across Locales

```ts
import { findTargetOnlyKeys } from './src/core/coverage.js';
import { runCheck, formatCheckReport } from './src/cli/commands/check.js';

// Detection (pure):
const orphans = findTargetOnlyKeys({ sourceUnits, targets, except: config.catalogs?.targetOnly ?? [] });

// CI gate (fail-by-default on orphans):
const result = runCheck({ sourceLocale: config.sourceLanguage, sourceUnits, targets, targetOnly: config.catalogs?.targetOnly ?? [] });
console.log(formatCheckReport(result, locales));
process.exit(result.failed ? 1 : 0);
```

```bash
translatronx check                  # includes orphan section, fails on unexcepted orphans
translatronx check --catalogs-only  # file gate only (identical output until registry sections land)
```

Config: `catalogs: { targetOnly: ["legal.countrySpecific.*"] }` (optional; absent parses as before).

Checks: `npx vitest run tests/unit/coverage.test.ts` · `npx tsc --noEmit`.
