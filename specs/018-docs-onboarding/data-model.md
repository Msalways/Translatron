# Data Model: v3 Docs + Onboarding Sweep

**Epic**: 018-docs-onboarding

| Item | Location | Shape |
|---|---|---|
| v3 README section | `README.md` → `## v3 Engine` + TOC line | configs, sync/inspect/registry/migration, ownership |
| v3 API section | `API.md` → `## v3 Modules` | 10 module subsections + ledger supersession note |
| `buildV2Scaffold` / `buildV3Scaffold` | `src/cli/init.ts` | `{ file, content }`; v2 bytes frozen by golden |
| Doctor glob inputs | `doctor.ts` | additive-optional `sourceKeys`, `reviewGlobs`, `targetOnlyGlobs`; zero-match warns by name |
