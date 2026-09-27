import { cosmiconfig } from 'cosmiconfig';
import { type translatronxConfig, type TranslatronV3Config } from './schema';
import { validateConfig } from './schema';
import { normalizeConfig, toLegacyConfig } from './normalize.js';
import chalk from 'chalk';
import { pathToFileURL } from 'url';

const MODULE_NAME = 'translatronx';

const SEARCH_PLACES = [
    'translatronx.config.ts',
    'translatronx.config.js',
    'translatronx.config.json',
    'translatron.config.ts',
    'translatron.config.js',
    'translatron.config.json',
    `.${MODULE_NAME}rc`,
    `.${MODULE_NAME}rc.json`,
    `.${MODULE_NAME}rc.ts`,
    `.${MODULE_NAME}rc.js`,
];

async function searchRawConfig(searchFrom?: string): Promise<{ config: unknown; filepath: string }> {
    const explorer = cosmiconfig(MODULE_NAME, {
        searchPlaces: SEARCH_PLACES,
        loaders: {
            '.ts': async (filepath: string) => {
                try {
                    const fileUrl = pathToFileURL(filepath).href;
                    const module = await import(fileUrl);
                    return module.default || module;
                } catch (error) {
                    throw new Error(`Failed to load TypeScript config from ${filepath}: ${error}`);
                }
            },
        },
    });
    const result = await explorer.search(searchFrom);
    if (!result || result.config === undefined) {
        throw new Error(
            `No ${MODULE_NAME} configuration found. Run 'translatronx init' to create one.`
        );
    }
    return { config: result.config, filepath: result.filepath };
}

/**
 * Load raw (unvalidated) configuration (Epic 015).
 * Lets v3 shorthand configs (`locales`, `model`) flow into `normalizeConfig`;
 * legacy callers should keep using `loadConfig`.
 */
export async function loadRawConfig(searchFrom?: string): Promise<unknown> {
    const { config } = await searchRawConfig(searchFrom);
    return config;
}

/**
 * Load and validate translatronx configuration
 */
export async function loadConfig(searchFrom?: string): Promise<translatronxConfig> {
  const explorer = cosmiconfig(MODULE_NAME, {
    searchPlaces: [
      'translatronx.config.ts',
      'translatronx.config.js',
      'translatronx.config.json',
      'translatron.config.ts',
      'translatron.config.js',
      'translatron.config.json',
      `.${MODULE_NAME}rc`,
      `.${MODULE_NAME}rc.json`,
      `.${MODULE_NAME}rc.ts`,
      `.${MODULE_NAME}rc.js`,
    ],
    loaders: {
      '.ts': async (filepath: string) => {
        // Use dynamic import for TypeScript files
        try {
          const fileUrl = pathToFileURL(filepath).href;
          const module = await import(fileUrl);
          return module.default || module;
        } catch (error) {
          throw new Error(`Failed to load TypeScript config from ${filepath}: ${error}`);
        }
      },
    },
  });

  try {
    const result = await explorer.search(searchFrom);

    if (!result || !result.config) {
      throw new Error(
        `No ${MODULE_NAME} configuration found. Run 'translatronx init' to create one.`
      );
    }

    // Validate configuration (legacy schema first; v3 shorthands normalize
    // through when the raw config carries v3 keys — every command then
    // accepts v3-minimal configs, not just `sync --v3`).
    try {
      const config = validateConfig(result.config);
      return config;
    } catch (legacyError: any) {
      const rawRec = (result.config ?? {}) as Record<string, unknown>;
      if (rawRec['locales'] !== undefined || rawRec['model'] !== undefined) {
        return toLegacyConfig(result.config, normalizeConfig(result.config));
      }
      const issues = (legacyError as { errors?: Array<{ path: Array<string | number>; message: string }> }).errors;
      console.error(chalk.red('Configuration validation failed:'));
      if (issues !== undefined) {
        for (const issue of issues) {
          console.error(chalk.yellow(`  - ${issue.path.join('.')}: ${issue.message}`));
        }
      } else {
        console.error(chalk.yellow(`  ${legacyError.message}`));
      }
      throw new Error('Invalid configuration');
    }
  } catch (error: any) {
    if (error.message.includes('No translatronx configuration found')) {
      throw error;
    }
    console.error(chalk.red('❌ Failed to load configuration:'));
    console.error(chalk.yellow(`  ${error.message}`));
    throw error;
  }
}

/**
 * Get default configuration template
 */
export function getDefaultConfig(): Partial<translatronxConfig> {
  return {
    sourceLanguage: 'en',
    targetLanguages: [
      { language: 'Spanish', shortCode: 'es' },
      { language: 'French', shortCode: 'fr' },
      { language: 'German', shortCode: 'de' }
    ],
    extractors: [
      {
        type: 'json',
        pattern: 'src/locales/en/**/*.json',
      },
    ],
    providers: [
      {
        name: 'primary',
        type: 'openai',
        model: 'gpt-4-turbo-preview',
        temperature: 0.3,
        maxRetries: 3,
      },
    ],
    validation: {
      preservePlaceholders: true,
      maxLengthRatio: 3,
      preventSourceLeakage: true,
    },
    output: {
      dir: './locales',
      format: 'json',
      flat: false,
      indent: 2,
      fileNaming: '{shortCode}.json',
      allowSameFolder: false,
    },
    // Optional: Customize translation prompts
    // prompts: {
    //   userPrompt: [
    //     'Please translate the following strings.',
    //     'Maintain a professional and friendly tone.',
    //     'Use gender-neutral language where possible.',
    //   ],
    //   customContext: 'This is a mobile banking application.',
    //   formatting: 'formal',
    //   brandVoice: 'Professional, trustworthy, and approachable',
    //   glossary: {
    //     'Account': 'Cuenta',
    //     'Balance': 'Saldo',
    //   },
    // },
    advanced: {
      batchSize: 20,
      concurrency: 3,
      cacheDir: './.translatronx',
      ledgerPath: './.translatronx/ledger.sqlite',
      verbose: false,
    },
  };
}

/**
 * Configuration helper for better IDE support.
 * Accepts the legacy shape or the v3 shorthand (normalized at load).
 */
export function defineConfig(
  config: translatronxConfig | TranslatronV3Config
): translatronxConfig | TranslatronV3Config {
  return config;
}
