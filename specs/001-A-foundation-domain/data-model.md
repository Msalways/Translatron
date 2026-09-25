# Data Model: Foundation Domain Model

**Epic**: 001-A-foundation-domain | **Source**: `src/core/domain.ts`

| Entity | Key fields | Relations | Persisted as |
|---|---|---|---|
| `TranslationIdentity` | catalogId, keyPath, sourceLocale, targetLocale | embedded in Revision + ReconciledTranslation | part of `.trn` record |
| `TranslationRevision` | id, identity, sourceHash, targetHash, origin, parentIds, model?, provider?, corePolicyFingerprint?, skillFingerprints[], glossaryFingerprint?, contextFingerprint?, runId, createdAt | `parentIds` → prior Revision ids; `skillFingerprints` → AppliedSkill[] | `.trn` segment (zod-strict, schema `REVISION_SCHEMA_VERSION = 1`) |
| `AppliedSkill` | id, scope, fingerprint | embedded in Revision | inline in `.trn` |
| `SourceUnit` | unitId, keyPath, sourceText, sourceHash, context?, placeholders, sourceFile, schemaVersion | → grouped into WorkUnits | transient (extractors) |
| `TargetSnapshot` | locale, entries: Record<keyPath, {text, targetHash}> | compared vs Revision set | transient (catalog reads) |
| `ReconciledTranslation` | identity, status (12-state), sourceHash, currentTargetHash?, latestRevisionId?, latestAgentRevisionId? | derived join of SourceUnit + TargetSnapshot + Revisions | transient |
| `TranslationWorkUnit` | unitId, keyPath, sourceText, placeholders, contextFingerprint?, skillFingerprint?, reason | → batched into LanguagePlan | frozen in RunPlan |
| `LanguagePlan` | locale, skills: AppliedSkill[], batches: TranslationWorkUnit[][] | part of RunPlan | frozen in RunPlan |
| `RunPlan` | runId, languages, totalUnits, limits, policy | input to `TranslationRuntime.execute` | frozen, in-memory |
| `ExecutionLimits` | maxLanguages=4, maxBatchesPerLanguage=2, maxGlobalModelCalls=8, providerCaps? | part of RunPlan | config + run |

Invariants: `parentIds` acyclic (checked by registry writer, Epic 003); `status` always one of 12; `RunPlan` deeply frozen before runtime handoff (Epic 002).
