# Quickstart: Config v3 Ergonomics + v3 Sync Wiring

```ts
// Minimal authoring:
export default { sourceLocale: "en-GB", locales: ["fr-FR", "ja-JP"] };

// Normal authoring:
export default {
  sourceLocale: "en-GB",
  locales: ["fr-FR"],
  model: "openai:gpt-5",
  skills: { paths: ["./translatron/skills"] },
  execution: { maxLanguages: 4, maxGlobalModelCalls: 8 },
};
```

```bash
translatronx sync --dry-run          # v3 plan only
translatronx sync                    # v3 human progress + summary
translatronx sync --json             # §31 machine report
translatronx sync --force            # regenerate manual overrides
translatronx sync --v2               # legacy compatibility mode
translatronx sync                    # v2 path, unchanged
```

Checks: `npx vitest run tests/unit/config-v3.test.ts tests/unit/sync-v3.test.ts` · `npx tsc --noEmit`.
