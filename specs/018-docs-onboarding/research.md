# Research: v3 Docs + Onboarding Sweep

**Date**: 2026-09-24 | **Epic**: 018-docs-onboarding

## Decisions

1. **Grep tests assert presence + fences, not prose**: content quality stays
   human-reviewed in the diff; the tests prevent silent rot (deletion or
   rename of a documented surface fails the suite).
2. **`init` defaults to v3 TypeScript**: v3 is the product default and the
   generated config uses `process.env` for provider credentials. The legacy
   template is available only through `init --v2`.
3. **Overwrite parity**: `init` never checked existence; the v3 and `--v2`
   compatibility paths preserve that behavior (verified pre-build, locked in
   spec).
4. **README edited as bytes**: the file contains non-UTF8 mojibake from its
   history; text-mode edits would corrupt it. Appends + TOC line only, no
   v2 sections touched.
5. **Doctor glob check skips empty projects** and lives in the pure
   `runDoctor` (CLI only wires state fields) — consistent with the module's
   pure-evaluation contract.
