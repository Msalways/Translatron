# Data Model: Review Routing

**Epic**: 016-review-routing

| Item | Location | Shape |
|---|---|---|
| `policies.reviewKeys` | `config/schema.ts` | `string[]`, default `[]` |
| `EngineInput.requireReviewFor` | `core/compiler.ts` | `string[]` globs → resolved per locale to `needsReviewKeys` scopes |
| `ExplainInput.needsReviewKeys` | `cli/commands/explain.ts` | additive-optional `Set<string>` |
| Skipped-line printing | `cli/sync-v3.ts` | conflicts/review/preserved counts when nonzero |

No new states, buckets, or commands. Reconciler precedence unchanged.
