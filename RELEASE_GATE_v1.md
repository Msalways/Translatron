# v1 Release Gate — §30 Acceptance Pass

**Date**: 2026-09-24 | **Tree**: 001–018, uncommitted | **Method**: targeted suites + live proofs below. Verdict per criterion: PASS/FAIL with evidence.

| # | Criterion (§30) | Result | Evidence |
|---|---|---|---|
| 1 | Developers never checkout the registry ref | PASS | No ref code exists (construction); `git-sync.ts` deleted in 012 |
| 2 | Never create/edit `.trn` by hand | PASS | Single-writer boundary test green |
| 3 | Concurrent syncs lose no data | PASS | `registry-merge.test.ts` (50 seeded pairs, full recall) |
| 4 | No human-resolved `.trn` conflicts | PASS | Real-git merge exits 0, zero markers (same test) |
| 5 | Fresh clone reconstructs automatically | PASS | **Live 2026-09-24**: seed 3 → commit → clone → `readRegistry` 3/3, 0 quarantined, zero setup |
| 6 | Corrupt cache rebuilds | PASS | Quarantine + re-verify tests; `repairRegistry` E2E green |
| 7 | Locale files stay dev-managed | PASS | Engine writes only configured target files; source files never touched (construction + E2E file assertions) |
| 8 | Manual edits detected + preserved | PASS | Human-revision E2E (parented, file byte-identical, once-only guard) |
| 9 | New keys translate only missing/stale | PASS | S7 E2E (only-new-key planned) |
| 10 | CI detects missing translations without LLM | PASS | **Live 2026-09-24**: `check` on fixture found orphaned `description/de`, exit 1, zero model calls |
| 11 | Provenance records model/skills/hashes/origin | PASS | Happy-path E2E asserts all fields on all 6 revisions |
| 12 | v2 migration safe | PASS | Dry-run/apply/file-truth-wins/backup-retained tests green |
| 13 | v2 config readable in window | PASS | Compat matrix (legacy parses, deprecations warn, unknown keys warn) |
| 14 | Parallel bounded concurrency | PASS | 10-language caps test; semaphores code-enforced |
| 15 | Agents can't modify files/registry | PASS | Boundary tests + 6-tool allowlist + worker `BatchFeedback`-only surface |
| 16 | Integrity failures explicit + recoverable | PASS | `verify`/`repair` matrix green + live `registry status` smoke |

**Overall: 16/16 PASS.** Full suite at gate time: 34 files / 319 tests green, coverage 67.6/81.9/73.2 over ratchet 65/65/80/72 (see closeout).
Reverified 2026-09-24 post-review: v3-minimal configs load in every command (`registry status`, `check`, `doctor` live-smoked); `sync --v3 --dry-run [--json]` live-smoked; coverage toolchain repaired (npm `brace-expansion → balanced-match@1.0.2` override) after a real breakage found by this review.
Remaining non-gating notes: live-model E2E unexecuted (opt-in, needs keys); `retry --lang` v3 and LLM reviewer are later programs; tree uncommitted per standing rule.
