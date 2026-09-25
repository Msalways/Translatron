# Feature Specification: Foundation Domain Model

**Feature Branch**: `001-A-foundation-domain`

**Created**: 2026-09-21

**Status**: Draft

**Input**: R&D `translatron-vnext-deep-agents-rnd.md` §15–§18 + Epic A1. Traceability: `CORE-01`, `CORE-02`, `REG-01`.

## User Scenarios & Testing

### User Story 1 - Compiler works against typed domain, not ledger rows (Priority: P1)

A developer implementing the reconciler imports `src/core/domain.ts` and gets
every v3 concept (identity, revision, snapshots, plans) with no agent-framework
or SQLite types.

**Why this priority**: Everything downstream (reconciler, registry, runtime,
skills) depends on these types. Wrong boundary here poisons all later epics.

**Independent Test**: `vitest tests/unit/domain.test.ts` passes; grep proves no
`deepagents|langgraph|better-sqlite3` imports under `src/core/`.

**Acceptance Scenarios**:

1. **Given** the domain module, **When** imported by reconciler/registry code, **Then** all v3 concepts typecheck with strict `tsc --noEmit`.
2. **Given** a lint/boundary test, **When** scanning `src/core/`, **Then** zero imports of agent-framework or SQLite packages are found.

### User Story 2 - Provenance round-trips through the revision type (Priority: P2)

A registry writer serializes a `TranslationRevision` to a `.trn` segment and a
reader deserializes it back with fingerprints, origin, and parentage intact.

**Why this priority**: Provenance is the v3 product promise; the type must carry it.

**Independent Test**: JSON round-trip of a revision with skill fingerprints preserves all fields.

**Acceptance Scenarios**:

1. **Given** a revision with 4 skill fingerprints, **When** serialized/deserialized, **Then** all fingerprints, origin, parents, runId survive.

### Edge Cases

- Revision with no model (human/imported origin) — model/provider optional.
- Empty parent list for first-ever translation of a key.
- Unknown future `origin` value — zod-strict parsing must reject, TS type must not widen silently.

## Requirements

### Functional Requirements

- **FR-001**: System MUST define `TranslationIdentity` (catalogId, keyPath, sourceLocale, targetLocale) — `CORE-01`.
- **FR-002**: System MUST define `TranslationRevision` per R&D §16 (id, identity, sourceHash, targetHash, origin agent|human|imported, parentIds, model?, provider?, corePolicyFingerprint?, skillFingerprints?, glossaryFingerprint?, contextFingerprint?, runId, createdAt) — `REG-01`.
- **FR-003**: System MUST define `AppliedSkill` (id, scope, fingerprint) — `SKILL-03`.
- **FR-004**: System MUST define `SourceUnit` (unitId, keyPath, sourceText, sourceHash, context?, placeholders, sourceFile, schemaVersion) reusing existing extractor shape — `CORE-01`.
- **FR-005**: System MUST define `TargetSnapshot` (keyPath → {text, targetHash} per locale) — `CORE-02`.
- **FR-006**: System MUST define `ReconciledTranslation` (identity + derived `status` + latest revision refs + current hashes) — `CORE-01`, `CORE-02`.
- **FR-007**: System MUST define `TranslationStatus` union of the 12 derived states (NEW, UNTRACKED, CLEAN, MANUAL, SOURCE_STALE, SKILL_STALE, CONTEXT_STALE, TARGET_DELETED, ORPHANED, CONFLICT, FAILED, NEEDS_REVIEW) — `CORE-02`.
- **FR-008**: System MUST define `RunPlan` (runId, languages: LanguagePlan[], totalUnits, limits, policy) and `LanguagePlan` (locale, skills, batches: TranslationWorkUnit[]) and `TranslationWorkUnit` (unitId, keyPath, sourceText, placeholders, contextFingerprint, skillFingerprint, reason) — `PAR-01`.
- **FR-009**: System MUST define `ExecutionLimits` (maxLanguages, maxBatchesPerLanguage, maxGlobalModelCalls, provider caps) — `PAR-03`.
- **FR-010**: Domain module MUST NOT import `deepagents`, `@langchain/*`, `better-sqlite3`, or provider SDKs (boundary test enforced) — `AGENT-01`.

### Key Entities

- **TranslationRevision**: durable lineage record; identity + hashes + origin + fingerprints.
- **ReconciledTranslation**: derived view per key×locale joining source, target, registry.
- **RunPlan/LanguagePlan/TranslationWorkUnit**: immutable execution input for the runtime.

## Success Criteria

- **SC-001**: Reconciler, registry, and runtime authors can implement against domain types with zero `any` casts for core fields.
- **SC-002**: Boundary test fails the build if a forbidden import enters `src/core/`.
- **SC-003**: Revision JSON round-trip preserves 100% of fields in property test (100 runs).

## Assumptions

- Existing `SourceUnit` shape in `src/types/index.ts` is kept compatible; domain re-exports/extends it.
- zod used for runtime parsing of persisted revisions (zod already a dependency).
