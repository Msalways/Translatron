# Research: CLI/UX

**Date**: 2026-09-22 | **Epic**: 010-H-cli-ux

## What this epic wires (and what it deliberately does not)

The v3 compiler does not exist yet, so there is no live event stream to
render and no v3 `sync` engine. This epic ships every UX *module* as pure,
tested units plus thin command wiring against the v2 engine where honest:

- Renderer (`ProgressRenderer`, `buildRunReport`) is event-driven and
  script-tested — the v3 compiler will feed it directly.
- `sync --json` reports real per-language data via additive
  `RunStatistics.perLanguage` accounting in the v2 loop (no fabrication).
- `check` / `status` provenance / `explain` / `doctor` / `resolve` all run
  today against catalogs + registry + skills.

## Decisions

1. **Non-TTY renderer emits stable lines, not fake bars.** CI output must
   diff cleanly; TTY keeps cli-progress MultiBars. Totals accumulate from
   `batch-started` unitIds (planning totals are run-wide, not per-language).
2. **`failed` omitted from language JSON when zero** — matches the §31
   example exactly; schema-validated both ways.
3. **`check` exit 1 on issues** (prd code 1: validation error). `sync --json`
   exits 3 on failed units (prd code 3: validation failure after retries).
4. **Revisions carry hashes, not text** — conflict options show revision
   id/origin/date plus current file text. Full candidate texts would require
   a registry format change (Epic 003 schema is frozen for v3.0).
5. **Status appends (never replaces) v2 output** through the migration
   period; the v3 section appears only when a readable registry exists.
6. **v3 `skills:`/`registry:` config blocks are optional** — legacy configs
   parse unchanged (tested).
