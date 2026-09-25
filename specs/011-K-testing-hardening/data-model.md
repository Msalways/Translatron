# Data Model: Testing Hardening

**Epic**: 011-K-testing-hardening

| Layer | Location | What it pins |
|---|---|---|
| Risk matrix | `tests/integration/risk-matrix.test.ts` | divergent-human E2E, concurrent writers, source-after-manual |
| Invariant properties | `tests/unit/invariants.prop.test.ts` | plan deep-freeze, fingerprint determinism/sensitivity, resolution determinism/ordering (100 runs each) |
| Runtime contract | `tests/contract/runtime-contract.test.ts` | seam ordering/coverage/shape invariants × (stub, DeepAgent+fakes) |
| CLI snapshots | `tests/snapshot/cli-snapshots.test.ts` + `__snapshots__/` | 7 golden outputs (progress, check, status, explain, doctor, conflict, report JSON) |
| Live providers | `tests/live/providers.live.test.ts` | opt-in openai/anthropic/groq probes (skip without `RUN_LIVE_TESTS=1` + keys) |
| CI | `.github/workflows/ci.yml` | typecheck → build → coverage tests (thresholds) → dogfood check → artifact upload |
| Coverage gate | `vitest.config.ts` | lines/statements 60, branches 78, functions 72 |

Full key-free suite: 201 passed, 3 skipped, ~35s (< 5 min budget).
