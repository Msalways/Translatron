# Quickstart: Testing Hardening

```bash
npx vitest run                          # full key-free suite (live tests skip)
npx vitest run --coverage               # with ratchet: lines 60 / branches 78 / functions 72
npx vitest run tests/unit/invariants.prop.test.ts   # invariant properties
npx vitest run tests/snapshot -u        # re-record goldens ONLY after reviewing diffs

RUN_LIVE_TESTS=1 OPENAI_API_KEY=... npx vitest run tests/live   # opt-in provider probes
```

Flake check (SC-002): race/property suites 3× green 2026-09-23
(risk-matrix, invariants, orchestration, runtime-contract: 33/33 × 3).

Checks: `npm run typecheck` · `npm run build` · CI (`.github/workflows/ci.yml`).
