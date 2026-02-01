import { defineConfig } from 'translatron';

export default defineConfig({
  "sourceLanguage": "en",
  "targetLanguages": [
    {
      "language": "tamil",
      "shortCode": "ta"
    },
    {
      "language": "French",
      "shortCode": "fr"
    }
  ],
  "extractors": [
    {
      "type": "json",
      "pattern": "locales/en.json"
    }
  ],
  "providers": [
    {
      "name": "primary",
      "type": "openrouter",
      "model": "upstage/solar-pro-3:free",
      "baseUrl": "https://openrouter.ai/api/v1",
      "apiKey": process.env.OPENROUTER_API_KEY,
      "temperature": 0.3,
      "maxRetries": 3
    }
  ],
  "validation": {
    "preservePlaceholders": true,
    "maxLengthRatio": 3,
    "preventSourceLeakage": true
  },
  "output": {
    "dir": "./locales",
    "format": "json",
    "flat": false,
    "indent": 2,
    "fileNaming": "{shortCode}.json",
    "allowSameFolder": false
  },
  "advanced": {
    "batchSize": 20,
    "concurrency": 3,
    "cacheDir": "./.translatron",
    "ledgerPath": "./.translatron/ledger.sqlite",
    "verbose": false
  }
});
