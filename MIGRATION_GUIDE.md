# Migrating to Translatronx from Existing Translation System

This guide helps you integrate Translatronx into an existing project that already has translations.

## Scenario 1: You Have Existing Translations

**Situation:** You have translation files (e.g., `locales/fr.json`, `locales/de.json`) and want to use Translatronx going forward.

**Steps:**

1. **Install Translatronx:**
   ```bash
   npm install --save-dev translatronx
   ```

2. **Initialize Configuration:**
   ```bash
   npx translatronx init
   ```

3. **Edit `translatronx.config.ts`:**
   ```typescript
   export default defineConfig({
     sourceLanguage: 'en',
     targetLanguages: [
       { language: 'French', shortCode: 'fr' },
       { language: 'German', shortCode: 'de' }
     ],
     extractors: [{ type: 'json', pattern: './locales/en.json' }],
     output: { dir: './locales', fileNaming: '{shortCode}.json' },
     // ... providers config
   });
   ```

4. **Import Existing Translations:**
   ```bash
   npx translatronx import
   ```

   This will:
   - Analyze your existing translation files
   - Show coverage statistics
   - Register existing translations in the ledger
   - Mark them as `CLEAN` (won't be re-translated)

5. **Add New Source Strings:**
   Update your `locales/en.json` with new keys.

6. **Sync (Only New Keys Will Be Translated):**
   ```bash
   npx translatronx sync
   ```

   Translatronx will only translate the new keys you added!

---

## Scenario 2: Adding New Languages to Existing Project

**Situation:** You have 8 languages translated, want to add 2 more.

**Steps:**

1. **Update Configuration:**
   ```typescript
   targetLanguages: [
     // Existing 8 languages
     { language: 'French', shortCode: 'fr' },
     { language: 'German', shortCode: 'de' },
     // ... 6 more

     // New 2 languages
     { language: 'Japanese', shortCode: 'ja' },
     { language: 'Korean', shortCode: 'ko' }
   ]
   ```

2. **Import Existing 8 Languages:**
   ```bash
   npx translatronx import
   ```

3. **Sync (Only New Languages Will Be Translated):**
   ```bash
   npx translatronx sync
   ```

   Translatronx automatically detects that `ja` and `ko` are missing and translates only those!

---

## Scenario 3: Partial Translation Coverage

**Situation:** Your French translation file has 60% coverage (some keys missing).

**Steps:**

1. **Import What You Have:**
   ```bash
   npx translatronx import --targets "locales/fr.json"
   ```

   Output shows:
   ```
   fr:
     Total keys: 100
     Matched keys: 60
     Missing keys: 40
     Coverage: 60%
   ```

2. **Sync to Fill Gaps:**
   ```bash
   npx translatronx sync
   ```

   Translatronx translates only the 40 missing keys!

---

## Scenario 4: Migrating from Another Translation Service

**Situation:** You're migrating from a SaaS translation platform and have exported JSON files.

**Steps:**

1. **Export from Old Platform:**
   Export all translations as JSON files.

2. **Organize Files:**
   ```
   locales/
     ├── en.json (source)
     ├── fr.json (from old platform)
     ├── de.json (from old platform)
     └── es.json (from old platform)
   ```

3. **Initialize Translatronx:**
   ```bash
   npx translatronx init
   ```

4. **Import All Existing Translations:**
   ```bash
   npx translatronx import
   ```

5. **Verify Import:**
   ```bash
   npx translatronx status
   ```

   Should show 100% coverage for all languages.

6. **Going Forward:**
   - Add new keys to `en.json`
   - Run `npx translatronx sync`
   - Only new keys are translated (cost-efficient!)

---

## Advanced: Custom File Mapping

If your files don't follow the `{shortCode}.json` pattern:

```bash
npx translatronx import --lang-map '{
  "translations/french-FR.json": "fr",
  "translations/german-DE.json": "de",
  "translations/spanish-ES.json": "es"
}'
```

---

## Best Practices

1. **Always Import First:** Before your first `sync`, import existing translations to avoid re-translating.

2. **Dry Run:** Use `--dry-run` to preview what will be imported:
   ```bash
   npx translatronx import --dry-run
   ```

3. **Verify Coverage:** After import, check coverage:
   ```bash
   npx translatronx status
   ```

4. **Incremental Workflow:**
   - Import once (initial setup)
   - Add new source keys
   - Sync (only new keys translated)
   - Repeat

5. **Cost Optimization:** Importing existing translations means you only pay for new/changed translations!

---

## Troubleshooting

**Q: Import shows 0% coverage?**

A: Check that your source and target files have matching key structures. Use `--dry-run` to debug.

**Q: Some keys were re-translated after import?**

A: This happens if source text changed. Translatronx detects changes via hash comparison.

**Q: Can I import only specific languages?**

A: Yes! Use `--targets`:
```bash
npx translatronx import --targets "locales/fr.json,locales/de.json"
```

**Q: What if my JSON structure is different?**

A: Translatronx flattens nested JSON automatically. Both flat and nested structures work.

---

## Summary

Translatronx makes it easy to integrate with existing translation systems:

✅ Import existing translations once
✅ Only translate new/changed content
✅ Add languages incrementally
✅ Save costs by avoiding re-translation
✅ Maintain full control over your translations
