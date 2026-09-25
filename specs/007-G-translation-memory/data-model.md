# Data Model: Translation Memory

**Epic**: 007-G-translation-memory | **Source**: `src/memory/`

| Item | Shape | Notes |
|---|---|---|
| `TmLookup` | { sourceHash, locale, contextFingerprint? } | exact-match query |
| `TmCandidate` | { revision, reason: human/agent/imported-accepted } | reason feeds `explain` (Epic 010) |
| `TranslationMemory` | index: (sourceHash+locale) → ranked revisions; locale list newest-first | human > agent > imported, then newest |

Perf: 10k build 42ms · 5k lookups 8ms.
