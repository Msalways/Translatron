# translatronx

**Deterministic, incremental, build-time translation compiler using LLMs**

[![npm version](https://img.shields.io/npm/v/translatronx.svg)](https://www.npmjs.com/package/translatronx)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why translatronx?

Most translation tools are either:
- Runtime systems with performance and cost overhead
- SaaS platforms that own your data and workflow
- Non-deterministic LLM wrappers that retranslate everything

translatronx treats translations like source code:
- Compile once at build time
- Only retranslate what changed
- Preserve manual edits permanently
- Ship static files with zero runtime cost

> translatronx is not another translation management system. It is a **translation compiler** — it treats language like code: build once → ship everywhere → zero runtime cost.


## 🌟 Features

- **🔄 Incremental & Deterministic** - Only translates new/changed strings, same input = same output
- **💰 Cost-Efficient** - Deduplication and intelligent batching minimize LLM API costs
- **🔒 Developer Authority** - Manual edits are detected and protected forever (unless forced)
- **🎯 Provider-Agnostic** - OpenAI, Anthropic, Groq, Azure OpenAI, OpenRouter, or local models
- **⚡ CI/CD Ready** - Integrates seamlessly into GitHub Actions, GitLab CI, CircleCI, etc.
- **📊 State-Aware** - SQLite ledger tracks changes without storing actual translations
- **🛡️ Production-Ready** - Atomic writes, transaction safety, zero data loss on interruption
- **🎨 Customizable Prompts** - Fine-tune translation quality with formatting, glossaries, and brand voice
- **📈 Comprehensive Reporting** - Detailed statistics, cost estimates, and audit trails

## 📋 Table of Contents

- [Installation](#-installation)
- [Quick Start](#-quick-start)
- [Configuration](#-configuration)
- [CLI Commands](#-cli-commands)
- [Advanced Usage](#-advanced-usage)
- [Edge Cases & Troubleshooting](#-edge-cases--troubleshooting)
- [Best Practices](#-best-practices)
- [API Reference](#-api-reference)
- [Contributing](#-contributing)

## 📦 Installation

### Prerequisites

- **Node.js** >= 20.0.0
- **npm**, **yarn**, or **pnpm**

### Install as Dev Dependency

```bash
npm install --save-dev translatronx
# or
yarn add --dev translatronx
# or
pnpm add -D translatronx
```

### Install Globally (Optional)

```bash
npm install -g translatronx
```

## 🚀 Quick Start

### 1. Initialize Configuration

```bash
npx translatronx init
```

This creates a `translatronx.config.ts` file in your project root:

```typescript
import { defineConfig } from 'translatronx';

export default defineConfig({
  sourceLanguage: 'en',
  targetLanguages: [
    { language: 'French', shortCode: 'fr' },
    { language: 'German', shortCode: 'de' },
    { language: 'Spanish', shortCode: 'es' }
  ],
  extractors: [
    {
      type: 'json',
      pattern: './locales/en.json'
    }
  ],
  providers: [
    {
      name: 'openai',
      type: 'openai',
      model: 'gpt-4o-mini',
      temperature: 0.3
    }
  ],
  output: {
    dir: './locales',
    format: 'json',
    fileNaming: '{shortCode}.json'
  }
});
```

### 2. Set API Key

```bash
# For OpenAI
export OPENAI_API_KEY=your-api-key

# For Anthropic
export ANTHROPIC_API_KEY=your-api-key

# For Groq
export GROQ_API_KEY=your-api-key
```

### 3. Create Source Translation File

Create `./locales/en.json`:

```json
{
  "welcome": "Welcome to our app!",
  "greeting": "Hello, {name}!",
  "auth": {
    "login": "Log in",
    "logout": "Log out",
    "signup": "Sign up"
  }
}
```

### 4. Run Translation Sync

```bash
npx translatronx sync
```

**Output:**
```
🔄 Syncing translations...

✅ Translation sync complete!

Statistics:
  Total strings: 5
  Translated: 15
  Failed: 0
  Skipped: 0
  Tokens used: 245 (input) + 312 (output)
  Duration: 3.42s
```

This generates:
- `./locales/fr.json`
- `./locales/de.json`
- `./locales/es.json`

### 5. Check Status

```bash
npx translatronx status
```

## ⚙️ Configuration

### Complete Configuration Reference

```typescript
import { defineConfig } from 'translatronx';

export default defineConfig({
  // Source language code (ISO 639-1)
  sourceLanguage: 'en',

  // Target languages with full names and short codes
  targetLanguages: [
    { language: 'French', shortCode: 'fr' },
    { language: 'German (Formal)', shortCode: 'de-formal' },
    { language: 'Simplified Chinese', shortCode: 'zh-Hans' }
  ],

  // Extractors define how to find translatable strings
  extractors: [
    {
      type: 'json',                    // 'json' | 'typescript' | 'custom'
      pattern: './locales/en.json',    // Glob pattern(s)
      keyPrefix: 'app',                // Optional: prefix for all keys
      exclude: ['**/node_modules/**']  // Optional: exclude patterns
    }
  ],

  // LLM providers configuration
  providers: [
    {
      name: 'openai-primary',
      type: 'openai',
      model: 'gpt-4o-mini',
      temperature: 0.3,
      maxRetries: 3,
      apiKey: process.env.OPENAI_API_KEY,  // Optional: defaults to env var
      fallback: 'anthropic-backup'         // Optional: fallback provider
    },
    {
      name: 'anthropic-backup',
      type: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      temperature: 0.3,
      maxRetries: 2
    }
  ],

  // Validation rules
  validation: {
    preservePlaceholders: true,      // Ensure {var} placeholders are preserved
    maxLengthRatio: 3,               // Max target/source length ratio
    preventSourceLeakage: true,      // Prevent untranslated source text
    brandNames: ['Acme', 'Widget'],  // Protected brand names
    customRules: []                  // Custom validation functions
  },

  // Output configuration
  output: {
    dir: './locales',
    format: 'json',                  // 'json' | 'yaml' | 'typescript'
    flat: false,                     // Flatten nested objects
    indent: 2,                       // JSON indentation
    fileNaming: '{shortCode}.json',  // File naming pattern
    allowSameFolder: false           // Allow source & target in same dir
  },

  // Prompt customization
  prompts: {
    customContext: 'This is a mobile banking app. Use financial terminology.',
    formatting: 'formal',            // 'formal' | 'casual' | 'technical'
    glossary: {
      'Dashboard': 'Tableau de bord',
      'Settings': 'Paramètres'
    },
    brandVoice: 'Professional, trustworthy, and user-friendly',
    userPrompt: [                    // Custom user prompt (optional)
      'Translate the following strings for a mobile app.',
      'Maintain consistency with previous translations.'
    ]
  },

  // Advanced settings
  advanced: {
    batchSize: 20,                   // Strings per LLM call
    concurrency: 3,                  // Parallel LLM requests
    cacheDir: './.translatronx',      // State directory
    ledgerPath: './.translatronx/ledger.sqlite',
    verbose: false                   // Enable verbose logging
  }
});
```

### Configuration Options Explained

#### Target Languages

Each target language requires:
- `language`: Full language name (e.g., "French", "German (Formal)")
- `shortCode`: ISO code or custom code (e.g., "fr", "de-formal", "zh-Hans")

The `language` field provides context to the LLM for better translations.

#### Extractors

**JSON Extractor:**
```typescript
{
  type: 'json',
  pattern: './locales/**/*.json',
  exclude: ['**/node_modules/**']
}
```

**TypeScript Extractor:**
```typescript
{
  type: 'typescript',
  pattern: './src/**/*.ts',
  keyPrefix: 'app'
}
```

#### Providers

**OpenAI:**
```typescript
{
  name: 'openai',
  type: 'openai',
  model: 'gpt-4o-mini',  // or 'gpt-4o', 'gpt-4-turbo'
  temperature: 0.3,
  apiKey: process.env.OPENAI_API_KEY
}
```

**Anthropic:**
```typescript
{
  name: 'anthropic',
  type: 'anthropic',
  model: 'claude-3-5-sonnet-20241022',
  temperature: 0.3,
  apiKey: process.env.ANTHROPIC_API_KEY
}
```

**Groq:**
```typescript
{
  name: 'groq',
  type: 'groq',
  model: 'llama-3.3-70b-versatile',
  temperature: 0.3,
  apiKey: process.env.GROQ_API_KEY
}
```

**Azure OpenAI:**
```typescript
{
  name: 'azure',
  type: 'azure-openai',
  model: 'gpt-4o-deployment',  // Azure OpenAI deployment name
  baseUrl: 'https://your-resource.openai.azure.com',  // Azure OpenAI endpoint
  apiVersion: '2024-02-15-preview',    // Optional: API version (defaults to 2024-02-15-preview)
  apiKey: process.env.AZURE_OPENAI_KEY
}
```

**OpenRouter:**
```typescript
{
  name: 'openrouter',
  type: 'openrouter',
  model: 'anthropic/claude-3.5-sonnet',
  apiKey: process.env.OPENROUTER_API_KEY
}
```

**Local Models:**
```typescript
{
  name: 'local',
  type: 'local',
  model: 'llama3',
  baseUrl: 'http://localhost:11434'  // Ollama endpoint
}
```

#### Output File Naming

Use placeholders in `fileNaming`:
- `{shortCode}` - Language short code (e.g., "fr")
- `{language}` - Full language name (e.g., "French")

Examples:
- `{shortCode}.json` → `fr.json`
- `{language}.translation.json` → `French.translation.json`
- `translations/{shortCode}/app.json` → `translations/fr/app.json`

## 🎮 CLI Commands

### `translatronx init`

Initialize translatronx configuration.

```bash
translatronx init
```

Creates `translatronx.config.ts` with default settings.

---

### `translatronx sync`

Synchronize translations (incremental processing).

```bash
translatronx sync [options]
```

**Options:**
- `-f, --force` - Force regeneration of manual overrides
- `-v, --verbose` - Enable verbose output with streaming

**Examples:**

```bash
# Normal incremental sync
translatronx sync

# Force regenerate all translations (ignores manual edits)
translatronx sync --force

# Verbose mode with detailed logging
translatronx sync --verbose
```

**What happens during sync:**
1. Extracts source strings from configured files
2. Computes hashes and detects changes
3. Identifies new/modified strings needing translation
4. Deduplicates identical strings across keys
5. Batches strings for efficient LLM calls
6. Translates using configured provider(s)
7. Validates translations (placeholders, length, etc.)
8. Atomically writes to target files
9. Updates ledger with new state

---

### `translatronx status`

Display coverage statistics and system state.

```bash
translatronx status
```

**Output:**
```
📊 Checking status...

Project Statistics:
  Total keys: 127
  Manual overrides: 3

Language Coverage:
  French (fr):
    ✓ Translated: 127
    ✗ Failed: 0
    Coverage: 100%

  German (de):
    ✓ Translated: 124
    ✗ Failed: 3
    Coverage: 98%

Latest Run:
  Run ID:    run_2026-01-29T06-30-00
  Model:     gpt-4o-mini
  Cost:      $0.0142
  Duration:  Completed
```

---

### `translatronx retry`

Retry failed translation batches.

```bash
translatronx retry [options]
```

**Options:**
- `--batch <id>` - Specific batch ID to retry
- `--lang <code>` - Specific language to retry (comma-separated)
- `--dry-run` - Show what would be retried without making changes

**Examples:**

```bash
# Retry all failed translations
translatronx retry

# Retry only French translations
translatronx retry --lang fr

# Retry multiple languages
translatronx retry --lang fr,de,es

# Dry run to see what would be retried
translatronx retry --dry-run
```

---

### `translatronx import`

Import existing translations into the ledger (for integrating with existing projects).

```bash
translatronx import [options]
```

**Options:**
- `--source <path>` - Source language file path (overrides config)
- `--targets <paths>` - Target language files (comma-separated)
- `--lang-map <json>` - JSON mapping of file paths to language codes
- `--dry-run` - Show what would be imported without making changes
- `--force` - Overwrite existing ledger entries

**Examples:**

```bash
# Import from existing translation files (auto-detect from config)
translatronx import

# Import specific target files
translatronx import --targets "locales/fr.json,locales/de.json"

# Import with explicit language mapping
translatronx import --lang-map '{"locales/french.json":"fr","locales/german.json":"de"}'

# Preview import without making changes
translatronx import --dry-run
```

**Use Cases:**

1. **Migrating to Translatronx:**
   ```bash
   # You have existing translations in locales/
   translatronx import
   translatronx sync  # Only translates new/missing keys
   ```

2. **Adding New Languages:**
   ```bash
   # You have 8 languages, want to add 2 more
   # Update config with 10 target languages
   translatronx sync  # Automatically translates only the 2 new languages
   ```

3. **Partial Translations:**
   ```bash
   # Import what you have, sync fills in the gaps
   translatronx import --targets "locales/fr.json"  # 60% coverage
   translatronx sync  # Translates the missing 40%
   ```

**Output:**
```
📊 Analyzing coverage...

  fr:
    Total keys: 127
    Matched keys: 120
    Missing keys: 7
    Coverage: 94.5%

✅ Import Statistics:

  Total records: 120
  Imported: 120
  Skipped: 0
  Errors: 0
  Languages: fr
  Duration: 245ms

💡 Tip: Run "translatronx status" to verify the import
```

---

### `translatronx check`

Validate target files without making changes.

```bash
translatronx check
```

**Note:** This command validates:
- Placeholder preservation
- JSON structure integrity
- Length ratios
- Source text leakage

---

## 🔥 Advanced Usage

### Manual Override Protection

translatronx detects when you manually edit translations and protects them from being overwritten.

**Workflow:**

1. **Initial translation:**
   ```json
   // fr.json (auto-generated)
   {
     "welcome": "Bienvenue dans notre application !"
   }
   ```

2. **Manual edit:**
   ```json
   // fr.json (manually edited)
   {
     "welcome": "Bienvenue sur notre plateforme !"
   }
   ```

3. **Next sync:**
   - translatronx detects hash mismatch
   - Marks as `MANUAL` status in ledger
   - **Skips** this key in future syncs

4. **Force regeneration (if needed):**
   ```bash
   translatronx sync --force
   ```

### Provider Fallback Chain

Configure multiple providers with automatic fallback:

```typescript
providers: [
  {
    name: 'primary',
    type: 'openai',
    model: 'gpt-4o-mini',
    fallback: 'backup'
  },
  {
    name: 'backup',
    type: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
    fallback: 'local'
  },
  {
    name: 'local',
    type: 'local',
    model: 'llama3',
    baseUrl: 'http://localhost:11434'
  }
]
```

**Fallback triggers:**
- API rate limits
- Network errors
- Validation failures after max retries

### Custom Prompt Engineering

Fine-tune translation quality with custom prompts:

```typescript
prompts: {
  // Context about your application
  customContext: `
    This is a healthcare application for patients and doctors.
    Use medical terminology appropriately.
    Maintain HIPAA-compliant language.
  `,

  // Tone and style
  formatting: 'formal',

  // Glossary for consistent terminology
  glossary: {
    'Appointment': 'Rendez-vous',
    'Medical Record': 'Dossier médical',
    'Prescription': 'Ordonnance'
  },

  // Brand voice
  brandVoice: 'Compassionate, professional, and clear',

  // Custom user prompt (advanced)
  userPrompt: [
    'Translate the following medical app strings.',
    'Ensure all medical terms are accurate.',
    'Use patient-friendly language where appropriate.'
  ]
}
```

### Same-Folder Source and Target

By default, translatronx prevents source and target files in the same directory to avoid confusion. Enable if needed:

```typescript
output: {
  dir: './locales',
  allowSameFolder: true,
  fileNaming: '{shortCode}.json'
}
```

**Example structure:**
```
locales/
  ├── en.json (source)
  ├── fr.json (target)
  ├── ta.json (target)
  └── es.json (target)
```

### CI/CD Integration

#### GitHub Actions

```yaml
name: Sync Translations

on:
  push:
    branches: [main]
    paths:
      - 'locales/en.json'

jobs:
  translate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Sync translations
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: npx translatronx sync
      
      - name: Commit translations
        run: |
          git config user.name "Translation Bot"
          git config user.email "bot@example.com"
          git add locales/
          git commit -m "chore: update translations" || exit 0
          git push
```

#### GitLab CI

```yaml
translate:
  stage: build
  image: node:18
  script:
    - npm ci
    - npx translatronx sync
  artifacts:
    paths:
      - locales/
  only:
    changes:
      - locales/en.json
```

### Programmatic API Usage

Use translatronx programmatically in Node.js:

```typescript
import { TranslationCompiler, loadConfig } from 'translatronx';

async function translateApp() {
  // Load configuration
  const config = await loadConfig();
  
  // Create compiler instance
  const compiler = new TranslationCompiler(config);
  
  // Run sync
  const stats = await compiler.sync({ verbose: true });
  
  console.log(`Translated ${stats.translatedUnits} strings`);
  console.log(`Cost: $${stats.costEstimateUsd.toFixed(4)}`);
  
  // Close ledger connection
  compiler.close();
}

translateApp().catch(console.error);
```

## 🐛 Edge Cases & Troubleshooting

### Edge Case 1: Placeholder Variations

**Problem:** Different placeholder formats in your app.

**Solution:** translatronx automatically detects and preserves:
- `{variable}` - Single braces
- `{{variable}}` - Double braces
- `$variable` - Dollar sign
- `%s`, `%d` - Printf-style
- `%1$s` - Positional

**Example:**
```json
{
  "greeting": "Hello, {name}!",
  "count": "You have {{count}} messages",
  "format": "User: %s, ID: %d"
}
```

All placeholders are preserved exactly in translations.

### Edge Case 2: Nested JSON Structures

**Problem:** Deep nesting in translation files.

**Solution:** translatronx flattens keys internally using dot notation:

```json
{
  "auth": {
    "login": {
      "title": "Sign In",
      "button": "Log In"
    }
  }
}
```

Internally tracked as:
- `auth.login.title`
- `auth.login.button`

Output maintains original structure.

### Edge Case 3: Empty or Whitespace Strings

**Problem:** Empty strings or whitespace-only values.

**Behavior:**
- Empty strings (`""`) are skipped
- Whitespace-only strings are normalized and translated
- Leading/trailing whitespace is preserved if intentional

### Edge Case 4: Very Long Strings

**Problem:** Strings exceeding token limits.

**Solution:**
- Automatic chunking for strings > 1000 characters
- Configurable `maxLengthRatio` validation
- Warning if target exceeds `source length × maxLengthRatio`

### Edge Case 5: Special Characters & Encoding

**Problem:** Unicode, emojis, RTL languages.

**Solution:**
- All text normalized to Unicode NFC
- Full Unicode support including emojis 🎉
- RTL languages (Arabic, Hebrew) handled correctly
- HTML entities preserved

### Edge Case 6: Interrupted Sync

**Problem:** Process killed during translation.

**Solution:**
- Atomic file writes (temp file → rename)
- Transactional ledger updates
- No partial/corrupted files
- Safe to re-run sync immediately

### Edge Case 7: API Rate Limits

**Problem:** Provider rate limits exceeded.

**Solution:**
- Automatic retry with exponential backoff
- Fallback to secondary provider
- Configurable `maxRetries` per provider
- Batch size adjustment

### Edge Case 8: Inconsistent Translations

**Problem:** Same source string translated differently.

**Solution:**
- Deduplication groups identical strings
- Single translation reused across all occurrences
- Glossary ensures terminology consistency
- Prompt version tracking for reproducibility

### Common Errors

#### Error: "Configuration file not found"

```bash
Error: Could not find translatronx.config.ts
```

**Solution:**
```bash
translatronx init
```

#### Error: "API key not set"

```bash
Error: OPENAI_API_KEY environment variable not set
```

**Solution:**
```bash
export OPENAI_API_KEY=your-key
```

#### Error: "Placeholder mismatch"

```bash
ValidationError: Placeholder mismatch in key "greeting"
Source: {name}, Target: {nom}
```

**Solution:** This is a validation error preventing incorrect translations. The LLM will retry automatically.

#### Error: "Source file not found"

```bash
Error: Source file not found: ./locales/en.json
```

**Solution:** Create the source file or update `extractors.pattern` in config.

## ✅ Best Practices

### 1. Version Control

**Do commit:**
- ✅ `translatronx.config.ts`
- ✅ All translation files (`*.json`, `*.yaml`)
- ✅ `.gitignore` entry for `.translatronx/`

**Don't commit:**
- ❌ `.translatronx/` directory (state files)
- ❌ API keys (use environment variables)

**Recommended `.gitignore`:**
```gitignore
.translatronx/
*.sqlite
*.sqlite-journal
```

### 2. Source File Organization

**Good:**
```
locales/
  ├── en.json          # Single source of truth
  ├── fr.json          # Generated
  ├── de.json          # Generated
  └── es.json          # Generated
```

**Better:**
```
locales/
  ├── source/
  │   └── en.json      # Source (manually edited)
  └── generated/
      ├── fr.json      # Generated (auto-managed)
      ├── de.json
      └── es.json
```

### 3. Incremental Adoption

Start small, expand gradually:

```typescript
// Phase 1: Single language
targetLanguages: [
  { language: 'French', shortCode: 'fr' }
]

// Phase 2: Add more languages
targetLanguages: [
  { language: 'French', shortCode: 'fr' },
  { language: 'German', shortCode: 'de' },
  { language: 'Spanish', shortCode: 'es' }
]

// Phase 3: Regional variants
targetLanguages: [
  { language: 'French (France)', shortCode: 'fr-FR' },
  { language: 'French (Canada)', shortCode: 'fr-CA' },
  { language: 'Spanish (Spain)', shortCode: 'es-ES' },
  { language: 'Spanish (Mexico)', shortCode: 'es-MX' }
]
```

### 4. Cost Optimization

**Minimize costs:**
- Use smaller models for simple strings (`gpt-4o-mini`)
- Increase `batchSize` for fewer API calls
- Use deduplication (enabled by default)
- Set appropriate `temperature` (0.3 recommended)

**Cost estimation:**
```bash
# Dry run to estimate cost
translatronx sync --dry-run
```

### 5. Quality Assurance

**Multi-stage validation:**

```typescript
validation: {
  preservePlaceholders: true,
  maxLengthRatio: 3,
  preventSourceLeakage: true,
  brandNames: ['YourBrand', 'ProductName']
}
```

**Manual review workflow:**
1. Run `translatronx sync`
2. Review generated files
3. Manually edit if needed
4. Commit changes
5. Future syncs preserve manual edits

### 6. Prompt Optimization

**Effective prompts:**

```typescript
prompts: {
  customContext: `
    Context: E-commerce checkout flow
    Audience: International shoppers
    Tone: Clear, reassuring, action-oriented
  `,
  formatting: 'casual',
  glossary: {
    'Cart': 'Panier',
    'Checkout': 'Passer commande',
    'Shipping': 'Livraison'
  }
}
```

### 7. Monitoring & Debugging

**Enable verbose mode:**
```bash
translatronx sync --verbose
```

**Check status regularly:**
```bash
translatronx status
```

**Review run history:**
```bash
# Ledger stores run history
sqlite3 .translatronx/ledger.sqlite "SELECT * FROM run_history ORDER BY started_at DESC LIMIT 5;"
```

## 📚 API Reference

### `defineConfig(config: translatronxConfig)`

Define and validate translatronx configuration.

```typescript
import { defineConfig } from 'translatronx';

export default defineConfig({
  // ... configuration
});
```

### `loadConfig(configPath?: string)`

Load configuration from file.

```typescript
import { loadConfig } from 'translatronx';

const config = await loadConfig('./custom.config.ts');
```

### `TranslationCompiler`

Main orchestrator for translation compilation.

```typescript
import { TranslationCompiler } from 'translatronx';

const compiler = new TranslationCompiler(config);
```

**Methods:**

#### `sync(options?: SyncOptions): Promise<RunStatistics>`

Synchronize translations.

```typescript
const stats = await compiler.sync({
  force: false,
  verbose: false
});
```

#### `retryFailed(options?: RetryOptions): Promise<RetryStatistics>`

Retry failed translations.

```typescript
const stats = await compiler.retryFailed({
  lang: 'fr',
  dryRun: false
});
```

#### `close(): void`

Close ledger connection.

```typescript
compiler.close();
```

### Types

```typescript
interface RunStatistics {
  runId: string;
  startedAt: Date;
  finishedAt?: Date;
  totalUnits: number;
  translatedUnits: number;
  failedUnits: number;
  skippedUnits: number;
  tokensIn: number;
  tokensOut: number;
  costEstimateUsd: number;
  model: string;
}

interface RetryStatistics {
  recoveredUnits: number;
  remainingFailed: number;
  tokensIn: number;
  tokensOut: number;
}
```

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

```bash
# Clone repository
git clone https://github.com/msalways/translatronx.git
cd translatronx

# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build

# Lint
npm run lint
```

## 📄 License

MIT © Shanthosh

## 🙏 Acknowledgments

- Inspired by the TypeScript compiler philosophy
- Built with [OpenAI](https://openai.com), [Anthropic](https://anthropic.com), and [Groq](https://groq.com)
- Uses [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) for state management

## 📞 Support

- **Issues:** [GitHub Issues](https://github.com/msalways/translatron/issues)
- **Discussions:** [GitHub Discussions](https://github.com/msalways/translatron/discussions)
- **Email:** shanthubolt@gmail.com

---

**Made with ❤️ by developers, for developers**
