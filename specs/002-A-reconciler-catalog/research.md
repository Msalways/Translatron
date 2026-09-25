# Research: Reconciler + Catalog Abstraction

**Date**: 2026-09-21 | **Epic**: 002-A-reconciler-catalog

## Reused

- `JsonExtractor` flatten logic (`src/extractors/json-extractor.ts`) → ported into
  `GenericJsonAdapter` (objects + arrays, placeholder/hash/unitId via
  `src/utils/hash.ts`). Legacy extractor left untouched for v2 compat.
- `IncrementalTranslationPlanner` batching default (20 units) → kept as
  `maxUnitsPerBatch: 20`; SQLite-backed change detection stays in the legacy
  planner until Epic 004 migration.
- `AtomicFileWriter` tmp→rename pattern → reimplemented minimally in the
  adapter writer (no coupling to file-writer module).

## Decisions

1. **Precedence order** ORPHANED → CONFLICT → NEEDS_REVIEW → FAILED →
   TARGET_DELETED → NEW → UNTRACKED → MANUAL → SOURCE_STALE → SKILL_STALE →
   CONTEXT_STALE → CLEAN. MANUAL beats staleness (human ownership sacred).
2. **Registry passed as data** (`TranslationRevision[]`), not via an interface —
   Epic 003 owns storage; reconciler only needs the revision set.
3. **Failed/conflict/review as `Set<string>` inputs** keyed `locale + keyPath`
   (`scopedKey`) — producers (runtime/registry/policy) own detection.
4. **Token heuristic chars/4** with dual caps (units + tokens); group keys sorted
   for byte-stable plans.
5. **Windows fix**: adapter normalizes `\` → `/` for fast-glob (test-caught).
