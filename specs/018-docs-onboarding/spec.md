# Feature Specification: v3 Docs + Onboarding Sweep

**Feature Branch**: `018-docs-onboarding`

**Created**: 2026-09-24

**Status**: Draft

**Input**: Verified gap 2026-09-24: README (1000 lines) documents the v2 surface only; API.md (793 lines) references zero new modules; `init` and `sync` now default to v3; `doctor` silently accepts zero-match globs. The onboarding surface must make the v3 TypeScript/provider workflow the default, with v2 as an explicit compatibility mode.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - v3 is documented where users look (Priority: P1)

README gains a v3 section (minimal/normal configs, `sync` as the default, `registry` group, `doctor`/`explain`/`resolve`/`check`, policies/reviewKeys, `.translatron/` ownership + never-touch rule, migration pointer) and the config reference gains the new blocks. A grep test pins every command/flag/config key present so docs can't rot silently.

**Why this priority**: Undocumented v3 is unadoptable v3.

**Independent Test**: `tests/unit/docs.test.ts` asserts each documented surface string exists in README.

**Acceptance Scenarios**:

1. **Given** the README, **When** searched for each of `sync`, `sync --v2`, `registry verify`, `registry repair`, `doctor`, `explain`, `resolve`, `reviewKeys`, `.translatron/`, **When** found, **Then** each appears with a usage example, not just a mention.
2. **Given** the config reference, **When** read, **Then** `locales`, `model`, `skills.paths`, `execution`, `catalogs.targetOnly`, and `policies` blocks are documented with defaults.

---

### User Story 2 - API.md maps the new modules (Priority: P1)

API.md gains sections for `core/compiler` + `core/policy`, `runtime/models` + seam `toolBackend`, `config/normalize`, `registry/revisions` + `bootstrap` + segment `removals`, `cli/sync-v3` + `registry` group, `core/coverage`, and the validation split (result/placeholders/icu/markup/batch/repair/issues); the ledger section notes supersession toward migration. A grep test pins module paths.

**Acceptance Scenarios**:

1. **Given** API.md, **When** searched for each new module path, **Then** each resolves to a section with exported symbols listed.
2. **Given** the ledger section, **When** read, **Then** it points at v2-import-only status and the migration command.

---

### User Story 3 - New projects start on v3 (Priority: P2)

`translatronx init` scaffolds a v3 TypeScript config with an explicit provider
object and environment-backed credentials. `translatronx init --v2` is the
compatibility path for the historical v2 template.

**Independent Test**: Golden test on scaffolded output for both flag states.

**Acceptance Scenarios**:

1. **Given** plain `init`, **When** run in an empty dir, **Then** the written TypeScript config parses via `normalizeConfig` with zero warnings and uses `process.env` for credentials.
2. **Given** `init --v2`, **When** run, **Then** output is byte-identical to the historical v2 template.

---

### User Story 4 - Doctor warns on dead globs (Priority: P3)

`reviewKeys` and `targetOnly` patterns matching zero source keys surface as doctor warnings (fail-closed today becomes fail-closed *and visible*).

**Independent Test**: Config with `reviewKeys: ["nope.*"]` → doctor warns naming the pattern.

**Acceptance Scenarios**:

1. **Given** a zero-match `reviewKeys` pattern, **When** doctor runs, **Then** a warning names the pattern and the count (0 keys).
2. **Given** all patterns matching ≥1 key, **When** doctor runs, **Then** no new warnings appear.

---

### Edge Cases

- Docs tests assert presence + example markers (code fences), not prose quality — prose stays human-reviewed.
- `init` overwrites unconditionally, matching current `init` behavior exactly (verified: `writeFileSync` with no existence check) — parity, not new policy.
- Doctor glob check runs on loaded source keys (already in state); zero source keys → skip silently (no noise on empty projects).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: README MUST gain a `v3 Engine` section + config-reference blocks covering US1 items with runnable examples — UX.
- **FR-002**: `tests/unit/docs.test.ts` MUST assert presence (+ example markers) for every command/flag/config key in US1 and every module path in US2 — TEST (anti-rot).
- **FR-003**: API.md MUST gain the US2 module sections with exported symbols; ledger section MUST note v2-import-only status — UX.
- **FR-004**: `init` MUST default to a v3 TypeScript provider config; `init --v2` MUST retain the historical v2 template; `sync` MUST default to v3 with `sync --v2` as compatibility mode — COMP-01.
- **FR-005**: `runDoctor` input MUST accept additive-optional `sourceKeys: string[]` + `reviewGlobs/targetOnlyGlobs`; zero-match globs MUST warn naming pattern — UX (doctor pure function; CLI wires from state/config).

### Key Entities

- **Docs grep test**: string-presence + fence markers — cheap, deterministic, runs in unit suite.
- **v3 minimal config**: `{ sourceLocale, locales, model }` with model default warning documented.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Docs tests green (every listed surface asserted).
- **SC-002**: `init` output is a TypeScript v3 config that normalizes warning-free; `init --v2` remains byte-identical.
- **SC-003**: Doctor zero-match test green; no new warnings on healthy fixtures.
- **SC-004**: Full suite green; `tsc` clean; lint 0 errors.

## Assumptions

- No v2 doc sections are rewritten (additive only) — v2 remains supported.
- Prose quality is human-reviewed in the diff, not test-asserted.
- Plan/tasks/implement follow only on a positive spec review (user condition).
