# Research: Translation Memory

**Date**: 2026-09-21 | **Epic**: 007-G-translation-memory

## Decisions

1. **Index inputs are stored revisions only.** The registry never stores
   FAILED attempts, so candidates are accepted by construction — no status
   flag needed.
2. **Query-absent context matches anything** (back-compat for pre-context
   revisions); revision-absent vs query-present does NOT match (the old
   translation may depend on context the caller can't see).
3. **No separate candidate store**: the index is rebuilt from the Epic 003
   reader output per run — disposable, like the rest of the local cache.
4. **Compiler wiring deferred honestly**: the v3 compiler (Epic 008/010)
   will call `lookup()` before `runtime.execute()` per unit and re-validate
   hits via `validateBatchOutput`. The worker-tool `lookupMemory` hook
   (Epic 005) will be backed by this class in Epic 009.
