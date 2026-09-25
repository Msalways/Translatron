# Data Model: CLI/UX

**Epic**: 010-H-cli-ux

| Item | Location | Shape |
|---|---|---|
| `ProgressRenderer` | `cli/renderer/progress.ts` | `handle(TranslatronEvent)` + `summary(summaries, {tmReused, filesUpdated})` |
| `RunReport` | `cli/renderer/json.ts` | `{ runId, status, languages: { [locale]: { status, translated, failed? } } }` (zod) |
| `CheckResult` | `cli/commands/check.ts` | `{ issues: [{keyPath, locale, kind, message}], checkedKeys, failed }` |
| `ProvenanceStatus` | `cli/commands/status.ts` | `{ totalKeys, totalTranslations, byOrigin, byState, manual, stale, failed, conflicts, needsReview }` + merge |
| `DoctorResult` | `cli/commands/doctor.ts` | `{ checks: [{name, severity, detail[]}], ready }` |
| `ExplainResult` | `cli/commands/explain.ts` | `{ keyPath, locale, state, source/target, origin, model, provider, skills, tmReused, validation[], revisionId, runId, createdAt }` |
| `ConflictView` | `cli/conflicts.ts` | `{ keyPath, locale, sourceHash, options[] }` + detect/render/resolve-builder |
| `ProjectState` | `cli/project.ts` | config + source/targets + revisions + skills + registry flags |
| Config additions | `config/schema.ts` | optional `skills: {dir, paths}`, `registry: {dir, remote}` |
| `RunStatistics.perLanguage` | `types/index.ts` + compiler | additive per-locale `{translated, failed}` accounting |
