# Feature Specification: Config v3 Ergonomics + v3 Sync Wiring

**Feature Branch**: `015-config-v3-sync`

**Created**: 2026-09-23

**Status**: Draft

**Input**: v2 breakdown §24 (minimal/normal config), COMP-02, and the 014 deferral FR-013 (CLI wiring). The engine is programmatic-only; users cannot reach it. This spec adds the v3 authoring surface and wires `sync` to the engine. `sync --v2` remains the compatibility path.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Minimal and normal configs parse to canonical form (Priority: P1)

`{ sourceLocale: "en-GB", locales: ["fr-FR"] }` and the normal form (`model`, `skills.paths`, `execution`) normalize deterministically: locale codes map to display names (built-in table, fallback = code), `model: "openai:gpt-5"` synthesizes one provider, `skills.paths` merges into skills config, `execution` overrides engine limits. Conflicting `providers` + `model` throws (ambiguous, fail fast).

**Why this priority**: Authoring ergonomics gate v3 adoption; normalization must be total and tested before CLI depends on it.

**Independent Test**: Matrix over minimal/normal/legacy/conflicting configs asserting normalized output or throw.

**Acceptance Scenarios**:

1. **Given** `{ sourceLocale: "en-GB", locales: ["fr-FR", "ja-JP"] }`, **When** normalized, **Then** targetLanguages has 2 entries, providers contain exactly one synthesized `openai:gpt-5` default, `warnings` names the defaulted model, and limits equal DEFAULT_EXECUTION_LIMITS.
2. **Given** both `providers` and `model`, **When** normalized, **Then** it throws naming the conflict.
3. **Given** a legacy config (extractors/providers/targetLanguages, no v3 keys), **When** normalized, **Then** output equals the input modulo defaults (no-op normalization).

---

### User Story 2 - `sync` runs the v3 engine with live progress (Priority: P1)

`translatronx sync` loads project state, assembles engine input, executes with `DeepAgentRuntime`, streams events through `ProgressRenderer`, prints the completion summary (or `--json` report), and exits 0 on complete/partial_success, 3 on failed. `--v2` selects the legacy engine; `--dry-run`, `--force`, `--affected-by-skill` map to v3 engine flags.

**Why this priority**: The engine's only user door.

**Independent Test**: Harness invoking the command's assembly function with StubRuntime (no keys) asserting engine-input mapping; live-model path covered by construction (same code path, runtime injected).

**Acceptance Scenarios**:

1. **Given** `--dry-run`, **When** run, **Then** the planned report prints and the filesystem is untouched.
2. **Given** `--json`, **When** the run completes partially, **Then** stdout parses against the §31 schema with per-language counts.
3. **Given** v2 `sync` (no flag), **When** run, **Then** behavior is byte-identical to before (v2 loop untouched).

---

### Edge Cases

- Unknown locale code → display name falls back to the code itself (never throws).
- `model` with unknown provider prefix → throws naming known prefixes (reuse resolver validation).
- `execution` partial (e.g. only `maxLanguages`) → merges over ENGINE_LIMITS per key.
- Missing registry/skills → same graceful degradation as `loadProjectState` (zero revisions / empty set).
- No provider keys in env → engine runs; provider SDKs fail at call time with their own errors (unchanged semantics; `doctor` already reports credentials).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: New `src/config/normalize.ts` MUST export `normalizeConfig(raw: unknown): NormalizedV3Config` with `{ sourceLocale, targetLanguages, providers (never empty — minimal form defaults to `openai:gpt-5` with a warning), skillsDir, skillPaths, limits, warnings }`; top-level unknown keys MUST warn (compat-safe), contradictory combinations MUST throw — COMP-02.
- **FR-002**: Locale display names MUST resolve via a built-in table (≈20 common locales) with code-fallback; `model` MUST synthesize exactly one provider `{ name: 'default', type, model }`; `providers` + `model` together MUST throw — §24.
- **FR-003**: Engine MUST accept additive-optional `limits?: Partial<ExecutionLimits>` merged over DEFAULT_EXECUTION_LIMITS (R&D 8) (per-key merge; `maxUnitsPerBatch` likewise) — execution UX.
- **FR-004**: `sync` MUST default to the v3 engine; `--v2` MUST select the compatibility engine; v3 flags `--dry-run`, `--affected-by-skill <id>` (with `--force`/`--json` reused) MUST assemble `EngineInput` from `loadProjectState` + normalized config and execute via `DeepAgentRuntime` imported by relative path — UX.
- **FR-005**: The default v3 path MUST render via `ProgressRenderer` (human) or `buildRunReport` JSON (machine), and MUST exit 0 on complete/partial_success, 3 on failed — CLI-02.
- **FR-006**: v2 `sync` code path MUST NOT change (no shared-code edits except additive flag parsing) — COMP-01.
- **FR-007**: `loadConfig` MUST fall back through `toLegacyConfig` when legacy validation fails AND the raw config carries v3 keys (`locales`/`model`); broken legacy configs MUST still throw their original error; `defineConfig` MUST accept the v3 shorthand at type level — COMP-02 (review finding: read commands otherwise reject v3-minimal configs).

### Key Entities

- **NormalizedV3Config**: `{ sourceLocale, targetLanguages, providers, skillsDir, skillPaths, limits, warnings }` — the single handoff between authoring and execution.
- **Engine assembly**: pure function `assembleEngineInput(state, normalized, flags, runtime)` — independently testable without keys or network.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Config matrix green (minimal/normal/legacy/conflict/partial-execution/unknown-locale).
- **SC-002**: Assembly tests green with StubRuntime (flag mapping, limits merge, materials flow).
- **SC-003**: Boundary test passes unchanged (no allowlist, no weakening).
- **SC-004**: Full suite green; `sync --help` lists the new flags; build succeeds.

## Assumptions

- Provider credentials remain env/SDK-owned; no credential code here.
- `retry --lang` on the v3 path is a later program (retry command untouched).
- Live-model E2E is out (keys/network); the live path is the tested assembly + tested engine + tested runtime composed.
- Plan/tasks/implement follow only on a positive spec review (user condition).
