import { cosmiconfig } from 'cosmiconfig';
import { type TranslatronConfig } from './schema';
import { validateConfig } from './schema';
import chalk from 'chalk';
import { pathToFileURL } from 'url';

const MODULE_NAME = 'translatron';

/**
 * Load and validate Translatron configuration
 */
export async function loadConfig(searchFrom?: string): Promise<TranslatronConfig> {
  const explorer = cosmiconfig(MODULE_NAME, {
    searchPlaces: [
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
        `No ${MODULE_NAME} configuration found. Run 'translatron init' to create one.`
      );
    }

    // Validate configuration
    try {
      const config = validateConfig(result.config);
      return config;
    } catch (error: any) {
      console.error(chalk.red('❌ Configuration validation failed:'));
      if (error.errors) {
        error.errors.forEach((err: any) => {
          console.error(chalk.yellow(`  - ${err.path.join('.')}: ${err.message}`));
        });
      } else {
        console.error(chalk.yellow(`  ${error.message}`));
      }
      throw new Error('Invalid configuration');
    }
  } catch (error: any) {
    if (error.message.includes('No translatron configuration found')) {
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
export function getDefaultConfig(): Partial<TranslatronConfig> {
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
      cacheDir: './.translatron',
      ledgerPath: './.translatron/ledger.sqlite',
      verbose: false,
    },
  };
}

/**
 * Configuration helper for better IDE support
 */
export function defineConfig(config: TranslatronConfig): TranslatronConfig {
  return config;
}
