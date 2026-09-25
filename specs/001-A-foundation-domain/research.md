# Research: Foundation Domain Model

**Date**: 2026-09-21 | **Epic**: 001-A-foundation-domain

## Existing shapes reused

- `src/types/index.ts:SourceUnit` — `{unitId, keyPath, sourceText, sourceHash, context?, placeholders, sourceFile, schemaVersion}`. Canonical domain keeps this shape 1:1 (structural compat asserted in tests); `src/types/` left untouched so current compiler/extractors keep compiling.
- `src/utils/hash.ts` `computeHash` (sha256) — fingerprint inputs already available; domain only types the fingerprint strings, hashing implemented in Epic 009.
- zod v3 patterns in `src/config/schema.ts` (`z.enum`, `z.object`, `.default`, `safeParse`) — same idioms used for revision/limits schemas.

## Decisions

1. **zod schemas only for persisted/cross-boundary data** (`TranslationRevision`, `ExecutionLimits`): in-memory views (`ReconciledTranslation`, `TargetSnapshot`, plans) are TS types; plans frozen via `Object.freeze` at construction in Epic 002.
2. **No `Artifact`/`RunStatistics` duplication**: existing `RunStatistics` stays the compiler's report type; `RunPlan` is the pre-run input. Different lifecycle, no merge.
3. **`RunPolicy` minimal**: `{ forceRegenerate?, affectedBySkill?, requireReviewFor?, dryRun? }` — budgets live in Epic 006 repair flow, caps in `ExecutionLimits`.
4. **Boundary enforcement = test, not eslint plugin**: `tests/unit/domain.test.ts` scans `src/core/*.ts` source for forbidden import patterns (`deepagents`, `@langchain`, `better-sqlite3`, `openai`, `@anthropic-ai/sdk`, `groq-sdk`). Zero new devDeps; runs in default suite. (Epic 004 adds an allowlist exception for `src/migration/`.)
5. **Status union closed**: 12 states exactly per R&D §17; zod enum rejects unknown — forward-compat via schema `version` field on persisted records, not open unions.
