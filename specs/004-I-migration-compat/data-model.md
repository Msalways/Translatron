# Data Model: Migration + Backward Compatibility

**Epic**: 004-I-migration-compat | **Source**: `src/migration/`

| Item | Shape | Notes |
|---|---|---|
| `V2SourceHash` / `V2SyncStatus` | flat readonly row views | SELECT-only, nullable-tolerant |
| `TargetFile` | { locale, entries: Record<keyPath, text> } | file truth |
| `ClassifiedKey` | { keyPath, locale, classification, dbFileMismatch, revision? } | revision only for agent/human/imported with target |
| `ClassificationResult` | { items, counts, mismatches[] } | deterministic order: locale, keyPath |
| `MigrationReport` | { migrationRunId, sourceKeys, translations, agent/human/imported/failed/missing, mismatches, applied, segmentFile?, registryRevisions? } | dry-run identical minus apply fields |
| `AdaptedModelConfig` | { model: "type:model", temperature, fallback? } | Epic 005 consumes |
| `LegacyProjectSkill` | { content, glossary } | Epic 009 consumes |
