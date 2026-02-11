import { z } from 'zod';

/**
 * Provider type definitions
 */
export const ProviderTypeSchema = z.enum([
    'openai',
    'anthropic',
    'groq',
    'local',
    'azure-openai',
    'openrouter',
]);

export type ProviderType = z.infer<typeof ProviderTypeSchema>;

/**
 * Provider configuration schema
 */
export const ProviderConfigSchema = z.object({
    name: z.string().min(1, 'Provider name is required'),
    type: ProviderTypeSchema,
    apiKey: z.string().optional(),
    baseUrl: z.string().url().optional(),
    apiVersion: z.string().optional(), // Azure OpenAI API version
    model: z.string().min(1, 'Model name is required'),
    temperature: z.number().min(0).max(2).default(0.3),
    maxRetries: z.number().int().min(0).default(3),
    fallback: z.string().optional(),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

/**
 * Extractor configuration schema
 */
export const ExtractorConfigSchema = z.object({
    type: z.enum(['json', 'typescript', 'custom']),
    pattern: z.string().or(z.array(z.string())),
    keyPrefix: z.string().optional(),
    exclude: z.array(z.string()).optional(),
});

export type ExtractorConfig = z.infer<typeof ExtractorConfigSchema>;

/**
 * Prompt configuration schema
 */
export const PromptConfigSchema = z.object({
    /** @deprecated Use customContext instead. This field will be removed in v2.0 */
    systemPrompt: z.string().optional(),
    /** User-configurable prompt content (array for better readability, will be joined with newlines) */
    userPrompt: z.array(z.string()).optional(),
    customContext: z.string().optional(),
    formatting: z.enum(['formal', 'casual', 'technical']).optional(),
    glossary: z.record(z.string(), z.string()).optional(),
    brandVoice: z.string().optional(),
}).optional();

export type PromptConfig = z.infer<typeof PromptConfigSchema>;

/**
 * Validation rules schema
 */
export const ValidationConfigSchema = z.object({
    preservePlaceholders: z.boolean().default(true),
    maxLengthRatio: z.number().min(0).default(3),
    preventSourceLeakage: z.boolean().default(true),
    brandNames: z.array(z.string()).optional(),
    customRules: z.array(z.any()).optional(),
});

export type ValidationConfig = z.infer<typeof ValidationConfigSchema>;

/**
 * Output configuration schema
 */
export const OutputConfigSchema = z.object({
    dir: z.string().default('./locales'),
    format: z.enum(['json', 'yaml', 'typescript']).default('json'),
    flat: z.boolean().default(false),
    indent: z.number().int().min(0).max(8).default(2),
    // File naming pattern: {shortCode}.json, {language}.translation.json, or custom
    fileNaming: z.string().default('{shortCode}.json'),
    // Allow source and target files in same directory
    allowSameFolder: z.boolean().default(false),
});

export type OutputConfig = z.infer<typeof OutputConfigSchema>;

/**
 * Advanced configuration schema
 */
export const AdvancedConfigSchema = z.object({
    batchSize: z.number().int().min(1).default(20),
    concurrency: z.number().int().min(1).max(10).default(3),
    cacheDir: z.string().default('./.translatronx'),
    ledgerPath: z.string().default('./.translatronx/ledger.sqlite'),
    verbose: z.boolean().default(false),
}).optional();

export type AdvancedConfig = z.infer<typeof AdvancedConfigSchema>;

/**
 * Target language definition
 */
export const TargetLanguageSchema = z.object({
    language: z.string().min(1, 'Language name is required'),
    shortCode: z.string().min(2, 'Language short code is required'),
});

export type TargetLanguage = z.infer<typeof TargetLanguageSchema>;

/**
 * Main translatronx configuration schema
 */
export const translatronxConfigSchema = z.object({
    sourceLanguage: z.string().min(2, 'Source language code is required'),
    targetLanguages: z.array(TargetLanguageSchema).min(1, 'At least one target language is required'),
    extractors: z.array(ExtractorConfigSchema).min(1, 'At least one extractor is required'),
    providers: z.array(ProviderConfigSchema).min(1, 'At least one provider is required'),
    validation: ValidationConfigSchema.default({}),
    output: OutputConfigSchema.default({}),
    prompts: PromptConfigSchema,
    advanced: AdvancedConfigSchema,
});

export type translatronxConfig = z.infer<typeof translatronxConfigSchema>;

/**
 * Validate configuration and return typed result
 */
export function validateConfig(config: unknown): translatronxConfig {
    return translatronxConfigSchema.parse(config);
}

/**
 * Safe validate configuration without throwing
 */
export function safeValidateConfig(config: unknown): { success: true; data: translatronxConfig } | { success: false; error: z.ZodError } {
    const result = translatronxConfigSchema.safeParse(config);
    if (result.success) {
        return { success: true, data: result.data };
    }
    return { success: false, error: result.error };
}
