# Quickstart: Migration + Backward Compatibility

```bash
# Dry run first — changes nothing:
translatronx migrate
# Translatron 2 → 3 migration (dry run)
#   Source keys / Translations / Agent / Manual / Imported / Failed / Missing / Mismatches

# Apply — writes one registry segment, validates, keeps SQLite backup:
translatronx migrate --apply
```

```ts
import { V2LedgerReader, classifyLegacy, dryRunMigration, applyMigration, adaptLegacyConfig } from './src/migration/index.js';

const reader = new V2LedgerReader('./.translatronx/ledger.sqlite');
const input = { catalogId: 'main', sourceLocale: 'en', sourceUnits, sourceHashes, syncRows, targets, registryDir, migrationRunId, migratedAt };
reader.close();

dryRunMigration(input);   // report only
applyMigration(input);    // one segment + re-read validation
adaptLegacyConfig(oldConfig); // { sourceLocale, locales, model, legacySkill, warnings }
```

Checks: `npx vitest run tests/unit/migration.test.ts` · `npx tsc --noEmit`.
