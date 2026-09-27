# Translatron

<p align="center">
  <img src="https://raw.githubusercontent.com/Msalways/Translatron/master/docs/assets/translatron-mark.png" width="112" alt="Translatron logo">
</p>

<p align="center"><strong>Change one source string. Review only the translations that need work.</strong><br>Translatron generates ordinary locale JSON at build time and records why each translation was made.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/translatronx"><img src="https://img.shields.io/npm/v/translatronx.svg" alt="npm version"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="MIT License"></a>
</p>

## What happens when copy changes?

Suppose a checkout button changes in your source catalog:

```diff
- "payNow": "Pay now"
+ "payNow": "Continue to payment"
```

`sync --dry-run` counts the translations it would make. `sync` updates the target catalogs and records the result. `check` names any missing, stale, or invalid translations. Your app keeps reading the same JSON files.

Translatron keeps successful translation history in `.translatron/`. A human edit to a target catalog is preserved on the next sync unless you explicitly use `--force`.

## Start a v3 project

Requires Node.js 22 or newer. `init` creates a v3 config by default; run it in a new project because it overwrites an existing config.

```bash
npm install --save-dev translatronx
npx translatronx init
```

The generated `translatronx.config.ts` starts with `en-GB` → `fr-FR` and `de-DE`, reads `./locales/en-GB.json`, and writes `./locales/fr-FR.json` and `./locales/de-DE.json`. Change the locale codes, catalog path, and provider to fit your project. The relevant config looks like this:

```ts
import { defineConfig } from 'translatronx';

export default defineConfig({
  sourceLocale: 'en-GB',
  locales: ['fr-FR', 'de-DE'],
  extractors: [{ type: 'json', pattern: './locales/en-GB.json' }],
  providers: [{
    name: 'openai', type: 'openai', model: 'gpt-5',
    apiKey: process.env.OPENAI_API_KEY,
  }],
  skills: { dir: './translatron/skills' },
});
```

Create the source catalog at that path:

```json
{
  "welcome": "Welcome back, {name}!",
  "checkout": { "payNow": "Pay now" }
}
```

Set `OPENAI_API_KEY` in your environment. Then preview, translate, and validate:

```bash
npx translatronx sync --dry-run
npx translatronx sync
npx translatronx check
```

Review and commit the resulting locale files and `.translatron/` history together. `check` is read-only; `check --json` is available for CI.

## Give a string the right guidance

The `skills.dir` setting above is optional. Add repo-local `SKILL.md` files when voice or terminology matters; there is **no separate skills package to install**. Translatron discovers this pattern:

```text
translatron/skills/
  global/SKILL.md
  languages/fr-FR/SKILL.md
  domains/checkout/SKILL.md
```

A domain skill can select source keys directly:

```md
---
id: checkout
scope: domain
keys:
  - checkout.*
---
Keep payment button text short and direct.
```

Global guidance applies first, then language guidance (base language before region), then matching domain guidance. A skill can also carry `glossary.csv`, `examples.json`, and `references/` beside `SKILL.md`. Changes to applied guidance are recorded in provenance and can make translations stale.

For one ambiguous string, add a **context file** beside the source catalog:

```bash
npx translatronx context generate
```

Edit the generated `locales/en-GB.context.json`:

```json
{
  "welcome": {
    "value": "Welcome back, {name}!",
    "context": ""
  },
  "checkout": {
    "payNow": {
      "value": "Pay now",
      "context": "Button at the payment step; the order is not yet complete"
    }
  }
}
```

Enable it on the source extractor in `translatronx.config.ts`:

```ts
extractors: [{
  type: 'json',
  pattern: './locales/en-GB.json',
  contextFile: { enabled: true },
}],
```

Leave `context` empty for keys that need no explanation. Run `npx translatronx context validate` after editing the file, and `npx translatronx context sync` when source keys change. Context changes are tracked separately from source text.

## Let CI review the result

`npx translatronx check --json` checks missing and orphan keys, placeholders, ICU, markup, and stale source, skill, or context history when the registry is present. Use `--catalogs-only` if CI has no registry history. A failed or incomplete `sync` returns nonzero while retaining successful output.

The [GitHub Actions translation PR example](https://github.com/Msalways/Translatron/blob/master/docs/github-actions-translation-pr.yml) checks translation validity on source PRs, then runs translation and the full `check` after merge before opening or updating one generated PR. Updates are serialized because content-addressed registry files can merge cleanly while edits to a shared locale JSON can still conflict.

## Going deeper

The [v3 guide](https://github.com/Msalways/Translatron/blob/master/docs/V3_GUIDE.md) covers the complete setup, skills, context files, adapters, provenance, and CI. For an existing extractor, see the [adapter contract](https://github.com/Msalways/Translatron/blob/master/docs/CATALOG_ADAPTERS.md).

`init` and `sync` use v3 by default. The explicit `--v2` path is available during the deprecation window; v1-era configs and data are legacy inputs, with no `--v1` runtime. See [migration](https://github.com/Msalways/Translatron/blob/master/MIGRATION_GUIDE.md) and the [legacy reference](https://github.com/Msalways/Translatron/blob/master/docs/LEGACY_GUIDE.md) if you have an older project.

## License

MIT
