# Implementation Plan: Migration + Backward Compatibility

**Branch**: `004-I-migration-compat` | **Date**: 2026-09-21 | **Spec**: `spec.md`

**Input**: `specs/004-I-migration-compat/spec.md`

## Summary

Read-only v2 SQLite reader, DB-vs-files verifier, classifier, dry-run reporter,
atomic `--apply` migrator writing the Epic-003 registry, plus config adapter
(legacy providers/prompts/ledgerPath) and preserved CLI commands. Only epic
allowed to import `better-sqlite3`.

## Technical Context

**Language/Version**: TypeScript 5 ESM

**Primary Dependencies**: better-sqlite3 (migration-only), existing config zod

**Storage**: Reads v2 `.sqlite`; writes Epic-003 registry

**Testing**: vitest + v2 fixture (seeded SQLite + locale files)

**Target Platform**: Node >= 18

**Project Type**: compiler infra

**Performance Goals**: 12k-translation fixture migrates < 30s

**Constraints**: Reader read-only; never delete SQLite; dry-run default changes nothing

**Scale/Scope**: ~700 lines

## Constitution Check

- III: PASS with noted exception — `src/migration/` is the SOLE SQLite importer (eslint allowlist + boundary test).
- I: PASS (classification deterministic).

## Project Structure

```text
src/
├── migration/
│   ├── v2-ledger.ts      # read-only v2 reader
│   ├── classifier.ts     # agent/human/imported/failed mapping + file verify
│   ├── migrate.ts        # dry-run report + atomic apply
│   └── config-adapter.ts # legacy config → v3 (+warnings)
├── cli/commands/
│   └── migrate.ts        # migrate [--apply]
tests/
├── unit/migration.test.ts
└── fixtures/v2-ledger/   # seeded .sqlite + locales + legacy config
```

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| better-sqlite3 import in migration | must read v2 DBs | reimplementing SQLite reader infeasible |
