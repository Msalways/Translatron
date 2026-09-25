# Quickstart: Review Routing

```ts
// Config: route sensitive keys to human review (all policies optional).
export default {
  sourceLocale: "en-GB",
  locales: ["fr-FR"],
  model: "openai:gpt-5",
  policies: {
    reviewKeys: ["legal.*", "billing.*"],
    stale: "review",   // translate | preserve | review
  },
};
```

Routed units skip TM/planning/workers/files/revisions, count into
`skipped.needsReview`, and explain as `NEEDS_REVIEW`. Approve by editing
the file (MANUAL flow) or narrowing the globs.

Checks: `npx vitest run tests/integration/review-routing.test.ts` · `npx tsc --noEmit`.
