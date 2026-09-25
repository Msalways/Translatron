# Feature Specification: v3 Sync Engine (Compiler)

**Feature Branch**: `014-compiler-engine`

**Created**: 2026-09-23

**Status**: Draft

**Input**: The v3 program built every subsystem (reconciler, TM, runtime, validators, skills, registry, CLI) but no engine runs `sync` end-to-end on the v3 path — the live `TranslationCompiler.sync()` is still the v2 SQLite loop. This spec defines `src/core/compiler.ts`: reconcile → TM-first → plan → runtime → validate → atomic write (translations + orphan removals in one staged update) → revisions → one segment → report. Sources: v2 breakdown §§10–11, 13–15 (REC-04, AGENT-01, PAR-01), Epics G (G1–G5), H, J (J1–J5), K (K1–K6), S10 lifecycle.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Clean sync translates only what is missing, then proves it (Priority: P1)

A project with NEW keys across two locales runs the engine with an injected stub runtime (zero keys, zero network). Target files gain exactly the new translations, one segment publishes agent revisions with full provenance (origin, model, policy/skill/glossary/context fingerprints, parents, run, timestamp, git commit), the run report is `complete`, and a second identical run publishes nothing.

**Why this priority**: This is the engine's existence proof — every other story is a variation of this loop.

**Independent Test**: Temp-dir project, stub runtime, assert files + segment + report; re-run asserts no second segment and zero worker invocations.

**Acceptance Scenarios**:

1. **Given** 3 NEW keys × 2 locales, **When** the engine runs, **Then** both catalogs contain exactly the 3 translations, the segment holds 6 agent revisions with complete provenance, and status is `complete`.
2. **Given** the same project run again with no changes, **When** the engine runs, **Then** no worker is invoked, no files change, no segment publishes, and the report shows zero work.

---

### User Story 2 - Translation memory reuses exact matches without model calls (Priority: P1)

A NEW key carries exactly the same source text as an already-translated sibling key (same locale, compatible context, identical skill chain and glossary). The engine reuses the sibling's current file text: file written, new revision appended referencing the sibling revision's lineage, zero worker invocations for that unit. (Design correction, 2026-09-23: the registry stores hashes, never text, so same-key restore of deleted text is impossible — reuse resolves text from current target files, which means cross-key exact matches. Histories without file text fall back to translation. See research note.)

**Why this priority**: TM-first is the cost story; cross-key dedup is its realizable form under the content-light registry principle.

**Independent Test**: Seeded history + sibling text in files + throw-on-call worker; reuse succeeds; revision parents the sibling revision ID.

**Acceptance Scenarios**:

1. **Given** NEW key B with sourceHash equal to translated key A (same locale/context/skills/glossary), **When** the engine runs, **Then** B's file entry equals A's current text, a new revision with `parentIds: [<A-rev>]` publishes, and the worker was never called for B.
2. **Given** a TARGET_DELETED key whose history has no same-hash sibling text in current files, **When** the engine runs, **Then** the unit goes to translation (documented hash-only limitation — text is never stored).
3. **Given** a SKILL_STALE unit with unchanged source text, **When** TM is consulted, **Then** the old-fingerprint revision is NOT reused (chain-equality rule) — the unit goes to translation.

---

### User Story 3 - Source deletion cleans targets and records history (Priority: P1)

A source key is removed. Under default policy the engine deletes it from every managed target catalog atomically (same staged write as translations), appends one `SOURCE_REMOVED` record per key, preserves all historical revisions queryable, and honors `catalogs.targetOnly` exceptions and the removal policy (`remove` default; `warn-only` reports without deleting; `preserve` skips silently).

**Why this priority**: REC-04 detection/reporting (013) without the removal half leaves the lifecycle open — S10 steps 6–8.

**Independent Test**: S10 steps 1–8 as one E2E (exist → translate → remove → check-orphaned → sync → targets clean → removal record present → old revisions queryable).

**Acceptance Scenarios**:

1. **Given** a removed source key under default policy, **When** the engine runs, **Then** managed targets no longer contain it, the segment carries its removal record, and prior revisions remain readable.
2. **Given** `warn-only`, **When** the engine runs, **Then** files are untouched and orphans report as warnings with run success.
3. **Given** a `targetOnly`-matching key, **When** the engine runs, **Then** it is preserved and absent from every report.

---

### User Story 4 - Manual edits become parented human revisions, once (Priority: P2)

A developer edits a target by hand. The engine publishes a human revision parented on the previous generated revision without touching the file — and a second run publishes nothing new (already-recorded guard).

**Why this priority**: F6/K4 close the provenance loop for the most common developer action; without the guard every sync would mint duplicate human revisions.

**Independent Test**: Edit → run asserts one human revision with correct parent; re-run asserts zero new revisions.

**Acceptance Scenarios**:

1. **Given** a manual edit over an agent revision, **When** the engine runs, **Then** a human revision publishes with `parentIds: [<agent-rev>]` and the file is byte-identical.
2. **Given** an UNTRACKED target (no lineage at all), **When** the engine runs, **Then** an `imported` revision adopts it (same once-only guard), no translation occurs.
3. **Given** forceRegenerate, **When** MANUAL units run, **Then** they translate as `forced` work (new agent revision supersedes; no human revision is published for them).

---

### User Story 5 - Partial success keeps green work (Priority: P2)

One locale's worker throws mid-run. Completed languages are written, segmented, and reported; the run reports `partial_success`; the failed locale's units are absent from files and registry.

**Why this priority**: Epic 008 proves fan-in partial success at the runtime layer; the engine must not lose it at the persistence layer.

**Independent Test**: Fault-injected locale + green siblings → assert files, segment contents, and report agree (green present, failed absent).

**Acceptance Scenarios**:

1. **Given** 2 green + 1 crashed locale, **When** the engine runs, **Then** green catalogs are updated, the segment contains only green revisions, and status is `partial_success`.

---

### User Story 6 - Dry run changes nothing (Priority: P3)

`dryRun` plans and reports (work counts, orphan removals, TM reuses) with zero file writes and zero segment publication.

**Independent Test**: Snapshot the temp project dir before/after — byte-identical; report shows planned counts.

**Acceptance Scenarios**:

1. **Given** NEW keys + orphans, **When** dry run executes, **Then** the report lists both, and the filesystem is untouched.

---

### Edge Cases

- Empty work + no removals + no adoptions → no segment published (existing no-empty-segments rule), report `complete` with zeros.
- CONFLICT / NEEDS_REVIEW units → skipped, reported, never translated, never written.
- FAILED-with-no-target units → translation work. Failures persist nowhere (no `failedKeys` input exists yet — the FAILED state is unreachable in-engine v1); next run re-derives them as NEW/TARGET_DELETED naturally, which IS the retry mechanism.
- Validation-failed batch after repair budget → units absent from files/registry, counted failed, reported with exact errors.
- Worker crash mid-batch → language FAILED, siblings unaffected (engine relies on runtime isolation, asserts it).
- `affectedBySkill` → work filtered to `skill-stale` units only.
- Non-git directory → revisions carry `gitCommit: null`; git dir → current HEAD sha.
- `cache/` corruption or absence → rebuilt from segments (existing reader semantics, unchanged).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: New `src/core/compiler.ts` MUST implement `runSyncEngine(deps)` executing reconcile → TM-first → plan → `runtime.execute` → validate (inside runtime graph) → staged atomic write → revisions → one segment → report, emitting `TranslatronEvent`s via `adaptRuntimeEvent` plus planning/catalog/registry/run events — REC-01, AGENT-01, PAR-01.
- **FR-002**: TM-first MUST consult `TranslationMemory.lookup` per work unit before planning translation; a hit reuses ONLY when ALL hold: (a) the candidate text resolves from current target files - same-locale sibling entry holding the candidate keyPath text (the registry stores hashes, never text, so text-less histories fall back to translation); (b) `validateBatchOutput` passes on the reused text; (c) the candidate applied skill set EQUALS the freshly-resolved per-unit chain (same ids, same fingerprints - chain-equality, not subset: a newly-added skill must force retranslation); (d) candidate `glossaryFingerprint` equals the current merged locale glossary hash; (e) context compatibility holds (via lookup query). Stale translations can never resurrect through TM - K6, G1.
- **FR-003**: Planner input MUST enrich reconciler work units with per-unit `skillFingerprint` (`fingerprintAppliedSet` of the resolved chain), locale `glossaryFingerprint`, and `contextFingerprint` (hash of `unit.context`, absent when none) — G1, SKILL-03.
- **FR-004**: `RuntimeContext.materials` MUST be assembled per locale (skill contents via `skillMaterialForLocale` + legacy project skill when legacy prompt fields exist + TM examples); `context.toolBackend` MUST serve TM/glossary/key-context/related/skill-resources from engine-owned data — AGENT-01, H2.
- **FR-005**: Staged write MUST apply translations AND orphan removals to each catalog in one read → apply → re-parse-validate → rename cycle via new `GenericJsonAdapter.removeKeys` (additive method, nested delete by key path) — J1–J5, G4.
- **FR-006**: Revision assembly (`src/registry/revisions.ts`, new) MUST build agent/human/imported-adoption/restore revisions with deterministic IDs (`tr_` + sha256(runId|locale|keyPath|sourceHash|targetHash) first 16 hex), full fingerprints, `parentIds` chaining to the latest identity revision, and best-effort `gitCommit` (new additive-optional `TranslationRevision.gitCommit`, schema updated) — K1, K4, K6, REG-01.
- **FR-007**: Already-recorded guard: no revision publishes when the latest identity revision already carries the current target hash (covers MANUAL re-runs and UNTRACKED adoptions) — idempotence, K4.
- **FR-008**: Removal records MUST ride in the segment as additive-optional `removals: {catalogId,keyPath,sourceLocale,previousSourceHash,runId,createdAt}[]` (schema + reader extended, old segments parse unchanged); snapshots exclude them (replayed from segments, rare/small) — K5, REC-04 AC 4/9.
- **FR-009**: Config gains additive-optional `policies: { removal: 'remove'|'warn-only'|'preserve' (default remove), stale: 'translate'|'preserve' (default translate) }`; `stale: 'review'` is explicitly deferred to the review-UX program — G3, G5.
- **FR-010**: `forceRegenerate` MUST include MANUAL units as `forced` work (new additive `WorkUnitReason`) and suppress human-revision publication for them; `affectedBySkill` MUST filter work to `skill-stale` units — COMP (v2 `--force` parity).
- **FR-011**: Partial success MUST persist per-language: green catalogs written, green revisions segmented, report via `buildRunReport` + `deriveRunStatus` — PAR/E7, US5.
- **FR-012**: Seams MUST stay clean via four pure relocations (re-exported for compat, existing Epic 005 tests stay green): `TranslationToolBackend` → `runtime/runtime.ts`; `CORE_POLICY` + `corePolicyFingerprint` → new `core/policy.ts`; `resolveLegacyProvider` → new `runtime/models.ts`; `RuntimeContext.toolBackend?` consumed by supervisor default worker path — Constitution II.
- **FR-013**: CLI wiring is OUT of this spec (no `sync --v3`): `src/cli.ts` importing `deepagents/` would trip the Epic 005 boundary test; runtime instantiation (env keys, model strings) belongs to the config-v3 program. The engine ships programmatic + harness-tested — AGENT-01, Constitution II.
- **FR-014**: S10 full lifecycle (12 steps), S7 feature-branch flow (new key on uncommitted tree → only it translates), and S8 determinism (two identical runs → identical artifacts) MUST exist as E2E tests — TEST, S10.

### Key Entities

- **Engine run**: `{ runId, createdAt, gitCommit }` threading every artifact of one execution.
- **Staged catalog update**: translations + removals applied to one in-memory catalog, validated, renamed once.
- **Removal record**: per-key lineage tombstone (not a revision — no target hash to record).
- **Policies**: `{ removal, stale }` — the only behavioral knobs; everything else is derived.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: S10 12-step E2E green (exist → translate → remove → check → sync-clean → removal recorded → history queryable → re-add → exact reuse → validate → lineage-linked revision).
- **SC-002**: Second identical run invokes zero workers, writes zero bytes, publishes zero segments (idempotence property, 10 seeded projects).
- **SC-003**: Reuse path never invokes the worker for reused units (throw-on-call worker across 20 seeded histories with same-hash sibling texts in files).
- **SC-004**: Full suite green with both boundary tests unchanged and passing (no new exceptions, no weakened patterns).
- **SC-005**: Engine E2E wall time for 2 locales × 20 keys on stubs < 10s (harness budget, no network).

## Assumptions

- Runtime injected (`TranslationRuntime`); tests use `StubRuntime`/local fakes only. Live `DeepAgentRuntime` path already covered by Epic 008 — no keys needed here.
- Model resolution via `resolveLegacyProvider` (relocated); `model: "openai:gpt-5"` strings arrive with config-v3.
- `requireReviewFor` policy input exists on `RunPolicy` but has no producer yet; stale-`review` and review-routing both land in the review-UX program.
- Segment `removals` exclusion from snapshots is a deliberate denormalization (small, rare, always replayed).
- ExecutionLimits derivation (config `advanced` → limits with R&D §8 defaults) and the dry-run report shape (planned counts beyond `RunReport`) are plan-phase decisions, flagged here so they are specified before implementation, not during.
- Validation/repair event kinds (`validation-failed`, `repair-*`) are not yet emitted by the runtime graph — the engine forwards what exists; per-unit repair visibility is a runtime-program follow-up, recorded not built.
- Plan/tasks/implement follow only on a positive spec review (user condition).
