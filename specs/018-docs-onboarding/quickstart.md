# Quickstart: v3 Docs + Onboarding Sweep

```bash
translatronx init             # scaffolds translatronx.config.ts (v3 default)
translatronx init          # unchanged v2 template
```

Doctor names dead globs automatically (`Glob matches no source keys`).
Docs anti-rot: `tests/unit/docs.test.ts` fails the suite if a documented
command, flag, config key, or module path disappears from README/API.md.

Checks: `npx vitest run tests/unit/docs.test.ts tests/unit/init.test.ts` · `npx tsc --noEmit`.
