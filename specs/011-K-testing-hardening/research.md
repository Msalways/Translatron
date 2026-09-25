# Research: Testing Hardening

**Date**: 2026-09-23 | **Epic**: 011-K-testing-hardening

## Matrix audit (what was already covered vs. added here)

| Scenario | Prior coverage | This epic |
|---|---|---|
| Simultaneous developers | Epic 003 push-convergence test | referenced |
| Divergent human edits | detect unit tests only | **risk-matrix E2E** (detect → CONFLICT → resolve → write → clear) |
| Push races | Epic 003 non-FF retry test | referenced |
| Worker crash | Epic 008 partial-success test | referenced |
| Provider 429 | Epic 005 `withRetry` test | referenced |
| Mid-branch skill change | Epic 009 rotation test | referenced |
| Source-after-manual | reconciler precedence test | **risk-matrix E2E** through reconcile |
| Stale-SQLite migration | Epic 004 mismatch tests | referenced |
| CI fresh clone | Epic 003 rebuild test | referenced |
| 10-language sync | Epic 008 caps test | referenced |
| Concurrent writers | — | **risk-matrix** (interleaved segments + dup-run guard) |

## Real findings while hardening

1. **Property test caught a contract question**: duplicate skill ids in a
   resolver input produce duplicate chain entries. Production is safe (the
   loader rejects dup ids fail-fast); the property now generates unique ids
   per the documented contract.
2. **`detectConflicts` needed resolution semantics**: keeping one contender
   did not clear the conflict on re-read. Added lineage supersession (a
   human revision parenting every camp resolves the group) — proven by the
   divergent-edits E2E. This also closed a genuine gap: `status`/`explain`
   never fed `conflictKeys` to the reconciler, so CONFLICT was unreachable
   in the CLI. Both now wire `detectConflicts` through.
3. **Golden review caught a formatting bug**: `placeholderspass` (padEnd(12)
   on a 12-char name). Fixed + snapshotted.
4. **`@vitest/coverage-v8` was never installed** (the `test:coverage`
   script could never run); pinned to the vitest-2 line.
5. **Pre-existing breakage left alone**: `npm run lint` (`--ext` flag)
   is invalid under eslint 9 — CI gates typecheck/tests/coverage, not lint,
   until the script is fixed separately.

## Decisions

- Contract suite pins the `TranslationRuntime` seam against both the stub
  and the real `DeepAgentRuntime` with fakes — any future runtime impl must
  satisfy ordering/coverage/shape invariants without keys or network.
- Live provider tests are triple-gated (`RUN_LIVE_TESTS=1` + per-key
  presence); cheapest model per provider, one unit per call.
- Coverage ratchet set at measured-minus-slack (60/60/78/72); v3 modules
  sit at 70–100%, legacy drag is documented, ratchet rises with migration.
- `check` dogfoods as a CI step on `temp-test-project` (deterministic, no keys).
