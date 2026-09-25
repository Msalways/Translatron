# Translatron Constitution

## Core Principles

### I. Deterministic Compiler Envelope (NON-NEGOTIABLE)

All discovery of WHAT is missing, manual-ownership decisions, and file/registry
mutations are deterministic TypeScript: catalog discovery/parsing, key
normalization, hashing, completeness/missing/orphan detection, manual-edit
detection, reconciliation, skill applicability, batching, validation, atomic
writes, registry serialization, migration, CI exit codes. Agentic reasoning
operates only inside this envelope, never rewrites the plan arbitrarily.

### II. Runtime Boundary (NON-NEGOTIABLE)

`deepagents`, `@langchain/langgraph`, provider SDK internals, and LangGraph
message/channel/middleware types live ONLY under `src/runtime/deepagents/`
behind the `TranslationRuntime.execute(plan, ctx): AsyncIterable<RuntimeEvent>`
interface. `src/core/`, `src/catalogs/`, `src/registry/`, `src/skills/`,
`src/memory/`, `src/validation/` MUST NOT import them (enforced by tests +
eslint). Public API (`src/index.ts`) exposes no agent-framework types.

### III. No SQLite Canonical State (NON-NEGOTIABLE)

v3 canonical state is the Git-synchronized immutable registry in the
committed machine-owned `.translatron/` folder (`segments/<sha256>.trn`,
`snapshots/<sha256>.trnsnapshot`, static `meta.json`; disposable `cache/`
ignored), one immutable segment per run, content-hash named, additive,
checksum- and name-verified, never silently discarding a durable revision.
SQLite (`better-sqlite3`, `TranslatronLedger`) is legacy read-only, used
solely by `src/migration/` for v2 import. No new SQLite imports outside
`src/migration/`.

### IV. Provenance & Human Ownership

Every revision records origin (`agent|human|imported`), parent IDs, model,
policy/skill/glossary/context fingerprints, run ID. Manual target edits are
sacred: derived state `MANUAL`, never auto-overwritten. Skill change yields
`SKILL_STALE`, never silent re-translation. Status is derived, not stored.

### V. Cost Discipline (TM-first)

Exact TM hit (`source fingerprint + locale + context`) → validate → reuse with
zero model calls. Happy path: 1 call per unit; repair: 2; escalation: 3+ only
when necessary. Concurrency enforced by code semaphores
(`maxLanguages 4 / maxBatchesPerLanguage 2 / maxGlobalModelCalls 8` + provider
caps), never by model behavior. Partial per-language success is persisted.

## Constraints

- Stack: TypeScript ESM, zod, vitest (+fast-check), tsup, commander, chalk/ora.
- New agents deps (phase 4+ only): `deepagents`, `@langchain/langgraph`.
- CLI: `sync/check/status/retry/import/context` kept; add `doctor/explain/migrate`;
  `check` deterministic (no LLM, no writes); `--json` machine output; exit codes CI-safe.
- v3.0 breaking: v2 config normalized via adapter with deprecation warnings;
  v2 SQLite retained as backup, never deleted automatically.

## Development Workflow

TDD for reconciler/registry/validators (every state transition tested);
spec-kit loop per epic (`specify→clarify→plan→tasks→analyze→implement→converge`);
`analyze` required before `implement`; foundation (domain→reconciler→registry→
migration) before agents; parallel graph before skills/UX.

## Governance

Constitution supersedes all practices. Amendments require version bump, reason,
and migration note. All reviews verify Sections I–III gates.

**Version**: 1.1.0 | **Ratified**: 2026-09-21 | **Last Amended**: 2026-09-23
<!-- v1.1.0: §III storage mechanism corrected (orphan branch → committed
     `.translatron/` folder, content-hash names). No data migration: the
     reader accepts legacy timestamp-named segments. -->
