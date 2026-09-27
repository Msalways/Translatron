# Legacy projects and workflows

> This section is an archive for teams maintaining v1/v2-era projects. New projects should start with [Translatron v3](V3_GUIDE.md).

## Migration

- **v2 project:** `sync --v2` remains available during the deprecation window. Preview with `npx translatronx migrate`, then apply with `npx translatronx migrate --apply`. Migration preserves locale files and keeps the SQLite ledger as a backup.
- **v1-era files:** there is no `--v1` runtime. Keep the catalogs, move the config to the v3 shape, then use `check` and `sync`.
- **v2 scaffold:** `npx translatronx init --v2` is available for compatibility. Plain `init` creates a v3 project.

See the [migration guide](../MIGRATION_GUIDE.md) for the full process.

## Older examples

These examples are collapsed so you can open only the reference you need. They describe the former v2 workflow; new projects should use v3.

<details>
<summary>The old v2 quick start</summary>

This is the older v2 setup sequence. Use init --v2 and sync --v2 for these examples; plain init and sync select v3.

### 1. Basic Translation Workflow

#### Step 1.1: Initialize Your Project

```bash
# Create a new directory for your translations
mkdir my-app-i18n
cd my-app-i18n

# Initialize npm project
npm init -y

# Install translatronx
npm install --save-dev translatronx

# Initialize configuration
npx translatronx init --v2
```

#### Step 1.2: Configure Your Project

Edit `translatronx.config.ts`:

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

#### Step 1.3: Create Your Source Translations

Create `./locales/en.json`:

```json
{
  "app": {
    "title": "My Awesome App",
    "description": "The best app you'll ever use"
  },
  "navigation": {
    "home": "Home",
    "about": "About",
    "contact": "Contact Us"
  },
  "auth": {
    "login": "Log in",
    "logout": "Log out",
    "signup": "Sign up",
    "forgotPassword": "Forgot Password?"
  },
  "messages": {
    "welcome": "Welcome, {username}!",
    "goodbye": "See you soon, {username}!",
    "error": "An error occurred. Please try again."
  }
}
```

#### Step 1.4: Run Your First Translation

```bash
# Set your API key
export OPENAI_API_KEY=your-api-key-here

# Run translation sync
npx translatronx sync --v2
```

**What happens:**
1. translatronx reads your source file (`en.json`)
2. Extracts all translatable strings
3. Batches them efficiently for the LLM
4. Generates translations for all target languages
5. Writes output files (`fr.json`, `de.json`, `es.json`)
6. Stores state in `.translatronx/ledger.sqlite`

#### Step 1.5: Check Translation Status

```bash
npx translatronx status
```

**Output:**
```
 Translation Coverage Report


 Language     Total   Clean      Dirty     Coverage

 French (fr)  12      12         0         100.0%
 German (de)  12      12         0         100.0%
 Spanish (es) 12      12         0         100.0%

```

#### Step 1.6: Update Source and Re-sync

Add a new string to `en.json`:

```json
{
  "app": {
    "title": "My Awesome App",
    "description": "The best app you'll ever use",
    "tagline": "Built with love "  // NEW!
  },
  // ... rest of the file
}
```

Run sync again:

```bash
npx translatronx sync --v2
```

**Output:**
```
 Translation sync complete!

Statistics:
  Total strings: 13
  Translated: 3     Only the new string!
  Failed: 0
  Skipped: 10       Existing translations skipped
```

**This is the power of incremental translation!** Only new/changed strings are translated, saving you time and money.

---

</details>

<details>
<summary>Context and prompt examples</summary>

### 2. Using Context Files for Better Translations

Context files allow you to provide additional information to the LLM about each translation key, resulting in more accurate and contextually appropriate translations.

#### Step 2.1: Generate a Context File Template

```bash
npx translatronx context generate --source ./locales/en.json
```

**Output:**
```
 Generating context file template...

  Source: /path/to/locales/en.json
  Output: /path/to/locales/en.context.json
  Merge:  No

 Context file generated successfully!

 Tip: Edit locales/en.context.json to add context for each translation key
```

This creates `./locales/en.context.json`:

```json
{
  "app": {
    "title": {
      "value": "My Awesome App",
      "context": ""
    },
    "description": {
      "value": "The best app you'll ever use",
      "context": ""
    },
    "tagline": {
      "value": "Built with love ",
      "context": ""
    }
  },
  "navigation": {
    "home": {
      "value": "Home",
      "context": ""
    },
    // ... etc
  }
}
```

#### Step 2.2: Add Context to Your Keys

Edit `en.context.json` to add helpful context:

```json
{
  "app": {
    "title": {
      "value": "My Awesome App",
      "context": "Main application title shown in the header and browser tab"
    },
    "description": {
      "value": "The best app you'll ever use",
      "context": "Marketing tagline shown on the landing page. Should be enthusiastic and engaging."
    },
    "tagline": {
      "value": "Built with love ",
      "context": "Footer tagline. Keep the heart emoji in all translations."
    }
  },
  "auth": {
    "login": {
      "value": "Log in",
      "context": "Button text for user authentication. Should be concise and action-oriented."
    },
    "logout": {
      "value": "Log out",
      "context": "Button text for ending user session."
    },
    "forgotPassword": {
      "value": "Forgot Password?",
      "context": "Link text for password recovery. Should be phrased as a question."
    }
  },
  "messages": {
    "welcome": {
      "value": "Welcome, {username}!",
      "context": "Greeting shown when user logs in. {username} is the user's display name."
    }
  }
}
```

#### Step 2.3: Validate Your Context File

```bash
npx translatronx context validate
```

**Output:**
```
 Validating context file...

  Source:  /path/to/locales/en.json
  Context: /path/to/locales/en.context.json

 Context file is valid!
```

#### Step 2.4: Enable Context in Configuration

Update `translatronx.config.ts`:

```typescript
export default defineConfig({
  // ... other config
  extractors: [
    {
      type: 'json',
      pattern: './locales/en.json',
      contextFile: {
        enabled: true,
        pattern: './locales/en.context.json',
        autoGenerate: false,
        autoUpdate: false
      }
    }
  ],
  // ... rest of config
});
```

#### Step 2.5: Re-translate with Context

To see the improvement, let's force a retranslation:

```bash
# Delete existing translations
rm ./locales/fr.json ./locales/de.json ./locales/es.json

# Clear the ledger to force retranslation
rm -rf .translatronx

# Run sync with context
npx translatronx sync --v2
```

**The LLM now receives context for each string, resulting in better translations!**

For example, without context:
- "Log in" might be translated as "Connexion" (noun) in French

With context ("Button text for user authentication"):
- "Log in" is translated as "Se connecter" (verb/action) in French

---


### 3. Managing Existing Translations

If you already have translations and want to add context files without affecting them:

#### Step 3.1: Import Context from Source

```bash
npx translatronx context import --source ./locales/en.json
```

**Output:**
```
 Importing context from source...

  Source:  /path/to/locales/en.json
  Output:  /path/to/locales/en.context.json
  Merge:   Yes

 Context imported from source successfully!
   Existing context preserved
   New keys from source added
   Source values updated to match current source
   Your existing translations are safe

 Tip: Your existing translations will NOT be affected.
   Context files only improve future translations.
```

**Key Points:**
-  Your existing translation files (`fr.json`, `de.json`, etc.) are **never touched**
-  Existing context you've written is **preserved**
-  New keys from source are **added** with empty context
-  Only **future translations** will benefit from context

#### Step 3.2: Sync Context When Source Changes

When you add/remove keys in your source file:

```bash
npx translatronx context sync
```

**Output:**
```
 Syncing context file with source...

  Source:  /path/to/locales/en.json
  Context: /path/to/locales/en.context.json

 Context file synced successfully!
   New keys added
   Deleted keys removed
   Existing context preserved
```

---


### 4. Customizing Prompts

Improve translation quality by customizing the prompts sent to the LLM.

#### Step 4.1: Add Custom Context

```typescript
export default defineConfig({
  // ... other config
  prompts: {
    customContext: 'This is a mobile banking app. Use financial terminology and maintain a professional tone.',
  }
});
```

#### Step 4.2: Add Glossary

```typescript
export default defineConfig({
  // ... other config
  prompts: {
    glossary: {
      'Dashboard': 'Tableau de bord',
      'Account': 'Compte',
      'Transaction': 'Transaction',
      'Balance': 'Solde'
    }
  }
});
```

#### Step 4.3: Set Formatting Style

```typescript
export default defineConfig({
  // ... other config
  prompts: {
    formatting: 'formal',  // 'formal' | 'casual' | 'technical'
    brandVoice: 'Professional, trustworthy, and user-friendly'
  }
});
```

#### Step 4.4: Custom User Prompt

```typescript
export default defineConfig({
  // ... other config
  prompts: {
    userPrompt: [
      'Translate the following strings for a mobile banking application.',
      'Maintain consistency with previous translations.',
      'Use formal language and financial terminology.',
      'Preserve all placeholders like {username} exactly as they appear.'
    ]
  }
});
```

---

</details>

<details>
<summary>Historical CI examples</summary>

### 5. CI/CD Integration

#### Step 5.1: GitHub Actions

Create `.github/workflows/translations.yml`:

```yaml
name: Update Translations

on:
  push:
    paths:
      - 'locales/en.json'
      - 'locales/en.context.json'
    branches:
      - main

jobs:
  translate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run translations
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: npx translatronx sync --v2

      - name: Commit translations
        run: |
          git config --local user.email "action@github.com"
          git config --local user.name "GitHub Action"
          git add locales/*.json
          git diff --quiet && git diff --staged --quiet || git commit -m "chore: update translations"
          git push
```

#### Step 5.2: GitLab CI

Create `.gitlab-ci.yml`:

```yaml
translate:
  image: node:20
  stage: build
  only:
    changes:
      - locales/en.json
      - locales/en.context.json
  script:
    - npm ci
    - npx translatronx sync --v2
    - git config user.email "ci@gitlab.com"
    - git config user.name "GitLab CI"
    - git add locales/*.json
    - git diff --quiet && git diff --staged --quiet || (git commit -m "chore: update translations" && git push)
  variables:
    OPENAI_API_KEY: $OPENAI_API_KEY
```

---

</details>

<details>
<summary>Legacy configuration reference</summary>

### Complete Configuration Example

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
      exclude: ['**/node_modules/**'], // Optional: exclude patterns
      contextFile: {                   // Optional: context file configuration
        enabled: true,
        pattern: './locales/en.context.json',
        autoGenerate: false,
        autoUpdate: false
      }
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
      'Settings': 'Paramtres'
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
    cacheDir: './.translatronx',     // State directory
    ledgerPath: './.translatronx/ledger.sqlite',
    verbose: false                   // Enable verbose logging
  }
});
```

### Configuration Options

#### `sourceLanguage`
- **Type:** `string`
- **Required:** Yes
- **Description:** ISO 639-1 language code for source language

#### `targetLanguages`
- **Type:** `Array<{ language: string, shortCode: string }>`
- **Required:** Yes
- **Description:** Array of target languages with full names and codes

#### `extractors`
- **Type:** `Array<ExtractorConfig>`
- **Required:** Yes
- **Description:** Configuration for extracting translatable strings

##### Extractor Context File Options
- `enabled`: Enable context file support
- `pattern`: Path to context file (defaults to `{source}.context.json`)
- `autoGenerate`: Auto-generate context file if missing
- `autoUpdate`: Auto-update context file when source changes

#### `providers`
- **Type:** `Array<ProviderConfig>`
- **Required:** Yes
- **Description:** LLM provider configuration

Supported providers:
- `openai` - OpenAI (GPT-4, GPT-3.5, etc.)
- `anthropic` - Anthropic (Claude)
- `groq` - Groq
- `azure-openai` - Azure OpenAI
- `openrouter` - OpenRouter

#### `validation`
- **Type:** `ValidationConfig`
- **Required:** No
- **Description:** Translation validation rules

#### `output`
- **Type:** `OutputConfig`
- **Required:** Yes
- **Description:** Output file configuration

#### `prompts`
- **Type:** `PromptConfig`
- **Required:** No
- **Description:** Prompt customization options

#### `advanced`
- **Type:** `AdvancedConfig`
- **Required:** No
- **Description:** Advanced performance and behavior settings

---

</details>

<details>
<summary>Legacy CLI reference</summary>

### `translatronx sync`

Synchronize translations (incremental processing).

```bash
npx translatronx sync --v2 [options]
```

**Options:**
- `-f, --force` - Force regeneration of manual overrides
- `-v, --verbose` - Enable verbose output

**Example:**
```bash
npx translatronx sync --v2 --verbose
```

---

### `translatronx status`

Display coverage statistics and system state.

```bash
npx translatronx status
```

**Output:**
```
 Translation Coverage Report


 Language     Total   Clean      Dirty     Coverage

 French (fr)  12      12         0         100.0%
 German (de)  12      11         1         91.7%

```

---

### `translatronx retry`

Retry failed translation batches.

```bash
npx translatronx retry [options]
```

**Options:**
- `--batch <id>` - Specific batch ID to retry
- `--lang <code>` - Specific language to retry
- `--dry-run` - Show what would be retried without making changes

**Example:**
```bash
npx translatronx retry --lang fr --dry-run
```

---

### `translatronx init`

Initialize translatronx configuration.

```bash
npx translatronx init --v2
```

Creates a `translatronx.config.ts` file in your project root.

---

### `translatronx context generate`

Generate context file template from source file.

```bash
npx translatronx context generate [options]
```

**Options:**
- `--source <path>` - Source file path (overrides config)
- `--output <path>` - Context file output path
- `--merge` - Merge with existing context file
- `--dry-run` - Preview changes without writing

**Example:**
```bash
npx translatronx context generate --source ./locales/en.json
```

---

### `translatronx context validate`

Validate context file matches source file.

```bash
npx translatronx context validate [options]
```

**Options:**
- `--source <path>` - Source file path (overrides config)
- `--context <path>` - Context file path (overrides config)

**Example:**
```bash
npx translatronx context validate
```

---

### `translatronx context sync`

Sync context file with source (add new keys, remove deleted keys).

```bash
npx translatronx context sync [options]
```

**Options:**
- `--source <path>` - Source file path (overrides config)
- `--context <path>` - Context file path (overrides config)
- `--dry-run` - Preview changes without writing

**Example:**
```bash
npx translatronx context sync --dry-run
```

---

### `translatronx context import`

Import/generate context file from source JSON (preserves existing translations).

```bash
npx translatronx context import [options]
```

**Options:**
- `--source <path>` - Source JSON file to generate context from
- `--output <path>` - Output context file path
- `--merge` - Merge with existing context file (default: true)
- `--dry-run` - Preview changes without writing

**Example:**
```bash
npx translatronx context import --source ./locales/en.json
```

**Use Case:** Perfect for users who already have translations and want to add context files without affecting existing translations.

---

</details>

<details>
<summary>Legacy context files</summary>

Context files provide additional information to the LLM about each translation key, resulting in more accurate and contextually appropriate translations.

### Context File Structure

Context files mirror your source file structure:

**Source File (`en.json`):**
```json
{
  "greeting": "Hello, {name}!",
  "auth": {
    "login": "Sign in",
    "logout": "Sign out"
  }
}
```

**Context File (`en.context.json`):**
```json
{
  "greeting": {
    "value": "Hello, {name}!",
    "context": "Greeting shown when user logs in. {name} is the user's display name.",
    "notes": "Keep it friendly and welcoming",
    "maxLength": 50,
    "tone": "casual"
  },
  "auth": {
    "login": {
      "value": "Sign in",
      "context": "Button text for user authentication. Should be concise and action-oriented."
    },
    "logout": {
      "value": "Sign out",
      "context": "Button text for ending user session."
    }
  }
}
```

### Context Metadata Fields

Each key in a context file can have:

- **`value`** (required): The source text (for validation)
- **`context`** (optional): Descriptive text for the LLM
- **`notes`** (optional): Additional notes
- **`maxLength`** (optional): Maximum character length
- **`tone`** (optional): Desired tone (e.g., "formal", "casual", "technical")

### Context File Workflow

1. **Generate template:**
   ```bash
   npx translatronx context generate
   ```

2. **Add context to keys:**
   Edit the generated `en.context.json` file

3. **Validate:**
   ```bash
   npx translatronx context validate
   ```

4. **Enable in config:**
   ```typescript
   extractors: [{
     type: 'json',
     pattern: './locales/en.json',
     contextFile: {
       enabled: true,
       pattern: './locales/en.context.json'
     }
   }]
   ```

5. **Run sync:**
   ```bash
   npx translatronx sync --v2
   ```

### Benefits of Context Files

- **Better Translation Quality** - LLMs understand the purpose and usage of each string
- **Consistency** - Maintain consistent terminology across your app
- **Tone Control** - Specify formal vs. casual tone per string
- **Length Constraints** - Ensure translations fit UI constraints
- **Optional** - Works with or without context files
- **Backward Compatible** - No breaking changes to existing workflows

---

</details>

<details>
<summary>Legacy advanced usage</summary>

### Manual Edits Protection

translatronx automatically detects and protects manual edits:

1. Translate your strings:
   ```bash
   npx translatronx sync --v2
   ```

2. Manually edit a translation in `fr.json`:
   ```json
   {
     "welcome": "Bienvenue chez nous!"  // Manual edit
   }
   ```

3. Run sync again:
   ```bash
   npx translatronx sync --v2
   ```

4. Your manual edit is preserved! The ledger marks it as `MANUAL` status.

To force retranslation of manual edits:
```bash
npx translatronx sync --v2 --force
```

---

### Multiple Providers with Fallback

```typescript
export default defineConfig({
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
      model: 'claude-3-5-sonnet-20241022'
    }
  ]
});
```

If the primary provider fails, translatronx automatically uses the backup.

---

### Custom Validation Rules

```typescript
export default defineConfig({
  validation: {
    customRules: [
      (source, target) => {
        // Ensure translations don't exceed source length by more than 50%
        if (target.length > source.length * 1.5) {
          return { isValid: false, error: 'Translation too long' };
        }
        return { isValid: true };
      }
    ]
  }
});
```

---

### Importing Existing Translations

If you have existing translations you want to import:

```bash
npx translatronx import --source ./old-translations/fr.json --target fr
```

This imports your existing translations and marks them as `MANUAL` in the ledger, protecting them from being overwritten.

---

</details>

<details>
<summary>Legacy best practices</summary>

### 1. Use Context Files for Important Strings

Add context to strings where:
- The meaning is ambiguous (e.g., "Bank" - financial institution or river bank?)
- Tone matters (e.g., error messages should be helpful, not scary)
- Length constraints exist (e.g., button text must be short)
- Cultural nuances matter (e.g., greetings, politeness levels)

### 2. Keep Source Files Clean

- Use clear, descriptive keys: `auth.loginButton` not `btn1`
- Avoid abbreviations in source text
- Use consistent placeholder format: `{variable}` not `{{variable}}` or `$variable`

### 3. Leverage Glossaries

Create a glossary for:
- Brand names
- Product names
- Technical terms
- Domain-specific terminology

### 4. Run Translations in CI/CD

Automate translations on source file changes:
- Ensures translations are always up-to-date
- Catches issues early
- Reduces manual work

### 5. Review Generated Translations

While LLMs are good, they're not perfect:
- Review critical strings (legal, security, payments)
- Have native speakers spot-check
- Use the `status` command to track coverage

### 6. Use Incremental Workflow

Don't retranslate everything:
- Let translatronx track changes
- Only force retranslation when necessary
- Trust the ledger system

---

</details>

<details>
<summary>Legacy API reference</summary>

### Programmatic Usage

```typescript
import { TranslationCompiler, loadConfig } from 'translatronx';

async function main() {
  // Load configuration
  const config = await loadConfig();

  // Create compiler
  const compiler = new TranslationCompiler(config);

  // Run sync
  const stats = await compiler.sync({ verbose: true });

  console.log(`Translated ${stats.translatedUnits} strings`);
  console.log(`Cost: $${stats.costEstimateUsd.toFixed(4)}`);

  // Close compiler
  compiler.close();
}

main();
```

### Configuration API

```typescript
import { defineConfig } from 'translatronx';

export default defineConfig({
  // Type-safe configuration
  sourceLanguage: 'en',
  targetLanguages: [
    { language: 'French', shortCode: 'fr' }
  ],
  // ... rest of config
});
```

### Custom Extractors

```typescript
import { type Extractor, type SourceUnit } from 'translatronx';

class CustomExtractor implements Extractor {
  async extract(sourceFiles: string[], config: ExtractorConfig): Promise<SourceUnit[]> {
    // Your custom extraction logic
    return [];
  }
}
```

---

</details>

---

[Back to README](../README.md)  |  [v3 guide](V3_GUIDE.md)
