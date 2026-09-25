# Feature Specification: Skills System

**Feature Branch**: `009-D-skills`

**Created**: 2026-09-21

**Status**: Draft

**Input**: R&D §10–§13 + Epics D1–D6. Traceability: `SKILL-01`, `SKILL-02`, `SKILL-03`.

## User Scenarios & Testing

### User Story 1 - Japanese checkout strings use Japanese + domain guidance (Priority: P1)

`ja-JP` work units resolve `global + ja + ja-JP + ecommerce` skills
deterministically; workers receive their content; provenance records fingerprints.

**Why this priority**: Locale/domain expertise is the skills value prop.

**Independent Test**: Resolution fixture returns the exact 4-skill chain in order.

**Acceptance Scenarios**:

1. **Given** target `pt-BR`, **When** resolved, **Then** chain is global + pt + pt-BR + matching domains (never LLM-decided).
2. **Given** zero skills configured, **When** run, **Then** core policy alone is valid.

### User Story 2 - Edited skill marks prior work stale, touches nothing (Priority: P2)

Changing `languages/ja-JP/SKILL.md` flips affected translations to SKILL_STALE
with files unchanged until explicit re-sync.

**Independent Test**: Fingerprint rotation → stale states, byte-identical files.

**Acceptance Scenarios**:

1. **Given** 437 translations on the old fingerprint, **When** `status` runs, **Then** it reports the count and suggests `sync --affected-by-skill ja-JP`.

### Edge Cases

- Arbitrary `.md` reference paths allowed alongside `SKILL.md` packages.
- Resource bundles (`glossary.csv`, `examples.json`, `references/`) hashed into fingerprint.
- Domain matching by key path/catalog/namespace/locale.

## Requirements

### Functional Requirements

- **FR-001**: Discovery MUST recognize `translatron/skills/**/SKILL.md` — `SKILL-01`.
- **FR-002**: Explicit arbitrary `.md` paths MUST be supported — §12.
- **FR-003**: Locale fallback MUST be deterministic (language → region → domains) — `SKILL-02`.
- **FR-004**: Fingerprint MUST hash normalized content + resources; every applied skill MUST affect provenance — `SKILL-03`.
- **FR-005**: Resource bundles MUST be loadable by workers via `get_skill_resource` — Epic D6.

## Success Criteria

- **SC-001**: Resolution matrix (locale × domain fixtures) passes exactly.
- **SC-002**: Fingerprint stability: same content → same hash; any byte change → new hash.
- **SC-003**: Stale flow leaves files untouched (hash-verified).

## Assumptions

- Skill content is advisory text; correctness still gated by deterministic validators.
