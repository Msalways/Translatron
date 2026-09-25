# Feature Specification: Key Coverage Across Locales

**Feature Branch**: `013-key-coverage`

**Created**: 2026-09-23

**Status**: Draft

**Input**: `translatron-vnext-machine-owned-registry-task-breakdown-v2.md` §§13 (deletion lifecycle), 19 (`check` list), 26.1 (REC-04 AC 1, 2, 7, 8, 10), Epic P (P6) and Epic S (S11, S12). Scoped to **detection + reporting**: the reconciler bulk loop and `check` only iterate source keys, so target-only (orphaned) keys are invisible everywhere except single-key `explain`. Source: verified by code read 2026-09-23.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - `check` reports orphaned target keys and fails CI (Priority: P1)

A source key is deleted but remains in managed target catalogs. `translatronx check` reports every affected key × locale as `ORPHANED` in the prescribed golden format and exits non-zero, with no LLM call and no writes.

**Why this priority**: This is the user-visible core of "keys mismatch or missing things on locales" — CI must see what developers removed.

**Independent Test**: Fixture (source without `auth.logout`, three targets still carrying it) → golden output match + `failed: true`.

**Acceptance Scenarios**:

1. **Given** `auth.logout` absent from `en-GB` but present in `fr-FR`/`de-DE`/`ja-JP`, **When** `check` runs, **Then** output is exactly:
   ```text
   Orphaned translation keys detected

   auth.logout
     fr-FR   ORPHANED
     de-DE   ORPHANED
     ja-JP   ORPHANED

   Source key no longer exists in en-GB.
   Run:
     translatronx sync
   ```
   and the result is failed.
2. **Given** the same fixture with zero orphans, **When** `check` runs, **Then** no orphan section appears and prior behavior is unchanged.

---

### User Story 2 - Target-only exceptions are honored (Priority: P1)

A project configures `catalogs.targetOnly: ["legal.countrySpecific.*"]`. Keys matching the patterns are exempt from orphan reporting; every other target-only key is still reported.

**Why this priority**: Real projects have legitimate locale-specific keys; without exceptions the gate is unusable for them.

**Independent Test**: S11 matrix — allowed key preserved (absent from report), unapproved key reported, pattern edge cases (exact, prefix glob, non-matching).

**Acceptance Scenarios**:

1. **Given** `legal.countrySpecific.disclaimer` in `de-DE` only plus pattern `legal.countrySpecific.*`, **When** `check` runs, **Then** the key is absent from the orphan report.
2. **Given** `marketing.stunt` in `fr-FR` only with no matching pattern, **When** `check` runs, **Then** it is reported `ORPHANED`.
3. **Given** a config without `catalogs`, **When** loaded, **Then** it parses exactly as before (additive-optional, no migration).

---

### User Story 3 - ORPHANED and TARGET_DELETED stay distinct with different meanings (Priority: P2)

Source-missing + target-present is reported as `ORPHANED` (candidate for removal); source-present + target-missing stays `TARGET_DELETED` (candidate for restore/retranslate, Epic 002 behavior). A combined test proves the two paths and their different downstream actions.

**Why this priority**: Conflating them causes data loss (deleting what should be restored) or resurrection loops (restoring what should be deleted) — §26.1 AC 8.

**Independent Test**: One fixture exercising both directions; assert states differ and the planned actions differ (removal-candidate vs translation-candidate).

**Acceptance Scenarios**:

1. **Given** source has `a` (target missing it) and target has `b` (source missing it), **When** evaluated, **Then** `a → TARGET_DELETED` (translation work) and `b → ORPHANED` (removal candidate, never translation work).
2. **Given** an ORPHANED entry, **When** planning translation work, **Then** no translation unit is produced for it (planner must never send orphaned values to an LLM — v2 doc G4 rule, enforced at the coverage/work-unit boundary).

---

### User Story 4 - `--catalogs-only` skips registry-dependent sections (Priority: P3)

On runners without registry access, `translatronx check --catalogs-only` validates files only (missing/orphan/placeholder/structure/empty) and skips registry integrity/consistency, exiting on file findings alone.

**Why this priority**: CI environments vary; the file gate must work with zero registry (§19).

**Independent Test**: Broken fixture + nonexistent registry dir + flag → file issues reported, no registry error, exit code from files only.

**Acceptance Scenarios**:

1. **Given** `--catalogs-only` with an unreadable registry, **When** `check` runs, **Then** no registry error appears and the exit code reflects file findings only.

---

### Edge Cases

- Empty target catalog → no orphans possible; section absent.
- Whole locale file deleted → its keys are TARGET_DELETED candidates per-key, not orphans (source still exists).
- Duplicate key across nested/flat catalog forms → normalized by the adapter before comparison (same key space as source units).
- Pattern `*` alone matches everything (documented footgun; allowed, tested).
- Dots in keys vs dots in patterns: patterns use the shared `matchesKeyPattern` glob (`*` spans any chars, everything else literal) — no second dialect.
- Orphaned key that also has registry history → still reported (history does not exempt; AC 1 keys off catalog absence, not history).
- UNTRACKED overlap: a target-only key with no registry lineage is still ORPHANED-by-absence, not UNTRACKED (source absence dominates; matches reconciler precedence where source-gone outranks everything).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A new pure module `src/core/coverage.ts` MUST expose `findTargetOnlyKeys(sourceUnits, targets, { except?: string[] })` returning per-locale orphan lists in stable (locale, keyPath) order — REC-04 AC 1, 7.
- **FR-002**: Exception matching MUST reuse `matchesKeyPattern` from `skills/resolver.ts` (no second glob dialect) — REC-04 AC 7.
- **FR-003**: `runCheck` MUST include an orphan section in the exact P6 golden format with the source-locale line rendered from the configured source locale (never hardcoded), and MUST set `failed: true` when un-excepted orphans exist; severity input defaults to error (`{ orphanSeverity?: 'error' | 'warn' }`, config knob deferred) — CI-01, REC-04 AC 2, 10.
- **FR-004**: Config schema MUST gain additive-optional `catalogs: { targetOnly: string[] }` (default `[]`); existing configs MUST parse byte-identically in behavior — REC-04 AC 7.
- **FR-005**: `check` CLI MUST accept `--catalogs-only`, skipping registry-dependent sections; exit code derives from file findings alone — §19, REC-04 AC 10.
- **FR-006**: The coverage function MUST return orphan listings only (`{ locale, keyPath }[]`, no source text, no translatable payload), making LLM submission structurally impossible; a test asserts the return shape carries no source text (planner rule G4 recorded for the v3-compiler program) — REC-04 AC 3 (detection half), G4 rule.
- **FR-007**: The reconciler bulk loop MUST NOT change shape in this spec (no `reconciled[]` semantics change); orphan visibility lives in the coverage module until the v3-compiler program — REC-01 (no regression).
- **FR-008**: S11, S12, P6-golden, and `--catalogs-only` tests MUST exist and pass — TEST.

### Key Entities

- **Orphan listing**: `{ locale, keyPath }[]` in stable order — the unit of reporting.
- **Target-only pattern**: glob string over key paths, shared dialect with skills.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: P6 fixture produces the golden block byte-identical (modulo key/locale names) and `failed: true`.
- **SC-002**: S11 matrix green (exempt/preserved vs reported), S12 green (states + actions differ).
- **SC-003**: Full suite green with zero changes to reconciler snapshots/behavior tests (loop untouched — verified by unchanged 002/008 suites).
- **SC-004**: `check` on a 10k-key × 10-locale synthetic project completes in < 5s (existing plan perf budget; coverage pass is O(keys × locales)).

## Assumptions

- Fail-by-default for orphans (P6 prescription). The `warn` severity exists in the function signature for the future config-v3 policy knob; CLI defaults to error.
- Registry-integrity/consistency wiring in `check` is OUT (needs the `registry verify` command group — post-v1). `--catalogs-only` is specified now so the flag exists when integrity lands.
- Sync-side removal, `SOURCE_REMOVED` revisions, TM restore, and removal policies (G4/G5/J5/K5/K6) are OUT — v3-compiler program. This spec is detection + reporting only.
- `explain` on orphaned keys already reports `ORPHANED` (verified); no change needed.
- Plan/tasks/implement follow only on a positive spec review (user condition).
