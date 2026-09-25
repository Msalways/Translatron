# Quickstart: Registry Verify + Repair

```bash
translatronx registry status   # counts; read-only, always exit 0
translatronx registry verify   # integrity; exit 0 clean, 1 problems
translatronx registry repair   # quarantine corrupt segments; never rewrites history
```

Team sync remains normal git flow (`pull`/`push` on your branch) — there is
deliberately no `registry sync`. Never hand-edit `.translatron/`.

Checks: `npx vitest run tests/unit/registry-maintenance.test.ts` · `npx tsc --noEmit`.
