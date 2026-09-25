# Research: Migration + Backward Compatibility

**Date**: 2026-09-21 | **Epic**: 004-I-migration-compat

## v2 ledger shape (from `src/ledger/index.ts`)

- `source_hashes(key_path, value_hash, context_sig, last_seen_run)` — no
  per-locale source tracking; hashes keyed by key path only.
- `sync_status(key_path, lang_code, target_hash, status ∈ CLEAN/DIRTY/FAILED/
  MANUAL/SKIPPED, model_fingerprint, prompt_version)` — nullable hashes/model.
- `run_history` — unused by migration except as existence proof; not imported.

## Decisions

1. **Readonly open** (`better-sqlite3` `{readonly: true}`) + SELECT-only
   statements: migration cannot mutate v2 state even on bug.
2. **File truth wins**: any ledger/file hash disagreement → human/imported by
   file content + mismatch entry. The ledger is a hint, never the authority.
3. **Locale universe = targets ∪ ledger locales**: ledger-only locales still
   migrate (their targets may live outside the v2 output dir).
4. **Revision ids** `mig-<runId>-<locale>-<unitId|hash8>`: stable within a run,
   unique across keys; `parentIds: []` (v2 has no lineage).
5. **Missing source hash fallback** `sha256('missing-source:<key>')`: keeps the
   non-empty invariant while remaining greppable as synthetic.
6. **Config adapter never throws** on legacy shapes: degrades to
   `openai:gpt-4o` + warnings. `ledgerPath` warning points at the registry.
7. CLI `migrate` reuses `loadConfig`, `GenericJsonAdapter`,
   `AtomicFileWriter.getOutputPath` — no new discovery logic.
