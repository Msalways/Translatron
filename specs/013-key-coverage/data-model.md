# Data Model: Key Coverage Across Locales

**Epic**: 013-key-coverage

| Item | Location | Shape |
|---|---|---|
| `OrphanListing` | `core/coverage.ts` | `{ locale, keyPath }` — no payload by construction |
| `findTargetOnlyKeys` | `core/coverage.ts` | `(sourceUnits, targets, { except? }) → OrphanListing[]`, locale-then-key stable order |
| `CheckIssueKind` | `cli/commands/check.ts` | gains `'orphan'` (message `'ORPHANED'`) |
| `CheckInput` | `check.ts` | gains required `sourceLocale`, optional `targetOnly`, `orphanSeverity` (default error), `catalogsOnly` |
| `CheckResult` | `check.ts` | gains `sourceLocale`, `warnings[]` (warn-level, never fail) |
| `CatalogsConfig` | `config/schema.ts` | `{ targetOnly: string[] }`, additive-optional, default `[]` |

Perf: 10k keys × 10 locales with 1k orphans → 9ms (< 5s budget).
