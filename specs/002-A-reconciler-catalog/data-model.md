# Data Model: Reconciler + Catalog Abstraction

**Epic**: 002-A-reconciler-catalog

| Item | Shape | Notes |
|---|---|---|
| `NormalizedCatalog` | { locale, sourceFile, units: SourceUnit[] } | adapter read result |
| `ReconcileInput` | sourceLocale, catalogId, sourceUnits, targets, revisions, currentSkills?, contextFingerprints?, failedKeys?, conflictKeys?, needsReviewKeys? | all inputs explicit/pure |
| `ReconcileResult` | { reconciled: ReconciledTranslation[], workUnits: TranslationWorkUnit[] } | stable order: targets in, keys in |
| `PlanLanguageInput` | { locale, skills, glossaryFingerprint?, units } | planner input per locale |
| `BuildPlanInput` | { runId, languages, limits, policy, batching? } | → frozen `RunPlan` |
| `BatchingOptions` | { maxUnitsPerBatch: 20, maxTokensPerBatch: 8000 } | dual caps |

Perf: 10k-key reconcile measured 48ms (< 1s budget).
