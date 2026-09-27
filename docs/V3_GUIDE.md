# Work with Translatron v3

Translatron reads source JSON, decides which locale strings need attention, asks a configured provider for the pending translations, and writes ordinary target JSON. It records successful work in `.translatron/` so the next run can distinguish a source edit from a guidance edit or a human edit to a target file.

This guide starts at the first source file and follows it into review and CI. The [README](../README.md) has the shorter setup you can read on npm.

## 1. Create a project you can run

Use Node.js 22 or newer:

```bash
npm install --save-dev translatronx
npx translatronx init
```

`init` writes `translatronx.config.ts`. Its v3 defaults are `en-GB` as source, `fr-FR` and `de-DE` as targets, and `./locales/en-GB.json` as the source catalog. Target files default to `./locales/fr-FR.json` and `./locales/de-DE.json`. Change these values for your project.

```ts
import { defineConfig } from 'translatronx';

export default defineConfig({
  sourceLocale: 'en-GB',
  locales: ['fr-FR', 'de-DE'],
  extractors: [{ type: 'json', pattern: './locales/en-GB.json' }],
  providers: [{
    name: 'openai',
    type: 'openai',
    model: 'gpt-5',
    apiKey: process.env.OPENAI_API_KEY,
  }],
  skills: { dir: './translatron/skills' },
});
```

Put a JSON object at the source path. Nested objects and arrays are flattened into key paths for translation; non-string values are skipped.

```json
{
  "welcome": "Welcome back, {name}!",
  "checkout": { "payNow": "Pay now" }
}
```

Set the provider credential in your shell or CI secret. The generated config reads `OPENAI_API_KEY`; `init --provider <id>` lets you choose another provider and offers to install its integration package when needed. Keep credentials out of the config file.

Run `npx translatronx doctor` to see discovered source files, target files, credential readiness, registry state, and loaded skills. A missing skills directory is fine; a missing source catalog needs fixing before sync.

## 2. Preview, translate, inspect

```bash
npx translatronx sync --dry-run
npx translatronx sync
npx translatronx check
```

The dry run plans work without changing files or calling a model. `sync` translates pending units, validates generated text, writes successful locale changes through the configured adapter, and records revisions in `.translatron/`. If some required work fails, it exits nonzero and keeps the successful output so you can inspect what remains. A manually edited target is preserved unless you request `sync --force`.

`check` is read-only and deterministic. It reports missing and orphan target keys, empty translations, placeholder, ICU, and markup errors. With readable registry history, it also reports source-stale, skill-stale, and context-stale translations. `check --json` prints a machine-readable report; `check --catalogs-only` skips registry-based stale checks when history is unavailable.

For one key, run `npx translatronx explain checkout.payNow --lang fr-FR` to see its current target and provenance. `npx translatronx registry verify` checks committed registry segments. Commit source changes, target files, and `.translatron/` together.

When the result needs investigation:

| Task | Command |
| --- | --- |
| Inspect project readiness | `npx translatronx doctor` |
| Replan work affected by one skill | `npx translatronx sync --affected-by-skill checkout` |
| Trace a key and locale | `npx translatronx explain checkout.payNow --lang fr-FR` |
| Inspect registry health | `npx translatronx registry status` |
| Verify history integrity | `npx translatronx registry verify` |
| Quarantine corrupt segments after inspection | `npx translatronx registry repair` |
| Resolve competing revisions | `npx translatronx resolve checkout.payNow --lang fr-FR` |

Never hand-edit `.translatron/` segments. `registry repair` quarantines corrupt files; it does not rewrite history. Review what it quarantines and recover from Git if needed.

## 3. Add guidance with local skills

Skills are project-owned `SKILL.md` files. They are optional and need no additional npm package. The default `skills.dir` is `./translatron/skills`; discovery follows this layout:

```text
translatron/skills/
  global/SKILL.md
  languages/fr/SKILL.md
  languages/fr-FR/SKILL.md
  domains/checkout/SKILL.md
  domains/checkout/glossary.csv
  domains/checkout/examples.json
  domains/checkout/references/button-copy.md
```

`global` applies across locales. `languages/fr` applies to French locales, then `languages/fr-FR` can add region-specific guidance. Domain skills can select keys, locale tags, or a catalog. The directory name supplies the scope if frontmatter omits it. For example:

```md
---
id: checkout
scope: domain
keys:
  - checkout.*
locales: [fr-FR, de-DE]
---
# Checkout copy

Keep payment calls to action short. Preserve product names.
```

For a `checkout.*` key in `fr-FR`, applicable guidance is ordered global → `fr` → `fr-FR` → matching domain skills. Within each group, IDs give a stable order. Translatron's placeholder, ICU, and markup rules remain authoritative. The exact applied skill fingerprints are stored with a revision, so changing a skill can make affected translations stale.

Put `glossary.csv` (`source,target` rows), `examples.json` (objects with `keyPath` and `text`), or supporting files in `references/` next to that `SKILL.md`. These files are loaded as skill resources and included in its fingerprint. Use `skills: { paths: ['./docs/voice.md'] }` for an explicit extra Markdown file; `dir` can point to another local skills root.

An organization *may* distribute the same skills to multiple repos with `skills.package: { name: '@acme/translation-policy', version: '1.2.3' }`. That is optional. If configured, the installed package version must match exactly; organization guidance is applied before repo-local guidance, and the package identity affects provenance. One repo can use only its local files.

## 4. Explain individual strings with context files

A skill guides a set of translations. A source context file gives a particular key its meaning, such as whether `Pay now` is a payment-step button or a final order confirmation. The context file is developer-owned JSON beside the source catalog.

Generate its initial shape from the source:

```bash
npx translatronx context generate
```

With the config above, that creates `./locales/en-GB.context.json`. Fill in `context` where an explanation is useful:

```json
{
  "welcome": {
    "value": "Welcome back, {name}!",
    "context": "Greeting on the signed-in home screen"
  },
  "checkout": {
    "payNow": {
      "value": "Pay now",
      "context": "Button at the payment step; the order is not yet complete"
    }
  }
}
```

Then enable the file on the source extractor:

```ts
extractors: [{
  type: 'json',
  pattern: './locales/en-GB.json',
  contextFile: { enabled: true },
}],
```

For JSON source files, v3 reads `<source-name>.context.json` by default. You can set `contextFile.pattern` for a different path. Once enabled, a missing or malformed JSON context file fails project loading with its path, so CI cannot silently ignore it. Empty `context` fields add no guidance. `value` mirrors the source string; the `context` text is what v3 uses when translating and fingerprinting.

```bash
npx translatronx context validate
npx translatronx context sync
```

`context validate` compares the file to the source and warns about missing, extra, or outdated keys. `context sync` adds new keys, removes deleted keys, updates mirrored values, and preserves existing context text. With multiple source catalogs, pass `--source` and `--context` to these commands for each pair; the commands otherwise use the first configured extractor. When context changes after a translation was recorded, `check` can report `context-stale` and the next sync can plan it again.

## 5. Bring an existing catalog

JSON is the built-in adapter. The configured extractor discovers and reads source files; the same adapter reads target catalogs and writes generated changes. For a custom format or existing extraction script, set the extractor to `type: 'custom'` with an adapter `module` that implements `discover`, `read`, and `write`. Unsupported configured types fail with a diagnostic. The [adapter guide](CATALOG_ADAPTERS.md) gives the contract and a fixture.

You can also choose target output naming and directory in `output`, allow legitimate target-only keys with `catalogs.targetOnly`, and set `policies.removal`, `policies.stale`, and `policies.reviewKeys`. Start with the defaults; add these only for a real catalog need.

The `execution` block sets concurrency and batch limits (`maxLanguages`, `maxBatchesPerLanguage`, `maxGlobalModelCalls`, and `maxUnitsPerBatch`). These govern how much work one sync can schedule. The generated config includes an `execution` example; adjust it to match your provider budget.

## 6. Put review in CI

On pull requests, `check --json` inspects catalogs without writing files or calling a provider. The [GitHub Actions example](github-actions-translation-pr.yml) gates ordinary source PRs on empty strings and placeholder, ICU, or markup errors; missing, orphan, and stale work waits for translation after merge. The translation job runs the full `check` on generated files before opening or updating a single translation PR, then reports an incomplete result if either sync or check failed. Configure the provider credential as a repository secret.

Registry segments have content-addressed names, so independent source branches can merge their history without a shared registry-file edit. Locale JSON files are shared assets and may still conflict; serializing generated writes into one PR reduces that collision. Local `sync` remains available.

## Moving from legacy projects

Plain `init` and `sync` use v3. `init --v2` and `sync --v2` are explicit compatibility paths for the current deprecation window. v1-era configs and data are legacy inputs; there is no `--v1` runtime. `npx translatronx migrate` previews migration, and `migrate --apply` preserves catalogs and imports available SQLite history into `.translatron/`. Follow the [migration guide](../MIGRATION_GUIDE.md) for that sequence; use the [legacy reference](LEGACY_GUIDE.md) for older commands.
