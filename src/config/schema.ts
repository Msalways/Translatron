import { z } from 'zod';

/**
 * Provider type definitions
 */
export const ProviderTypeSchema = z.enum([
    'openai',
    'anthropic',
    'azure-openai',
    'azure_openai',
    'langsmith',
    'cohere',
    'google',
    'google-vertexai',
    'google-vertexai-web',
    'google-genai',
    'ollama',
    'mistralai',
    'mistral',
    'groq',
    'bedrock',
    'aws',
    'deepseek',
    'xai',
    'cerebras',
    'fireworks',
    'together',
    'perplexity',
    'local',
    'openrouter',
    'nvidia',
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
    region: z.string().optional(),
    project: z.string().optional(),
    location: z.string().optional(),
    endpoint: z.string().optional(),
    /** Provider-specific options forwarded to the LangChain integration. */
    options: z.record(z.unknown()).optional(),
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
    // Context file configuration
    contextFile: z.object({
        enabled: z.boolean().default(false),
        pattern: z.string().optional(),  // e.g., './locales/en.context.json'
        autoGenerate: z.boolean().default(false),
        autoUpdate: z.boolean().default(false),
    }).optional(),
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
 * Catalog configuration schema (v3, Epic 013).
 * `targetOnly` exempts legitimate locale-specific keys from orphan cleanup.
 */
export const CatalogsConfigSchema = z.object({
    targetOnly: z.array(z.string()).default([]),
}).default({ targetOnly: [] });

export type CatalogsConfig = z.infer<typeof CatalogsConfigSchema>;

/**
 * Target language definition
 */
export const TargetLanguageSchema = z.object({
    language: z.string().min(1, 'Language name is required'),
    shortCode: z.string().min(2, 'Language short code is required'),
});

export type TargetLanguage = z.infer<typeof TargetLanguageSchema>;

/**
 * Skills configuration schema (v3).
 * Optional: zero skills is a valid project (core policy alone).
 */
export const SkillsConfigSchema = z.object({
    dir: z.string().default('./translatron/skills'),
    paths: z.array(z.string()).default([]),
}).default({ dir: './translatron/skills', paths: [] });

export type SkillsConfig = z.infer<typeof SkillsConfigSchema>;

/**
 * Registry configuration schema (v3, Epic 012 — committed machine-owned folder).
 * No `remote`: team sync is normal git flow on the dev branch (ref sync is post-v1).
 */
export const RegistryConfigSchema = z.object({
    dir: z.string().default('./.translatron'),
}).default({ dir: './.translatron' });

export type RegistryConfig = z.infer<typeof RegistryConfigSchema>;

/**
 * Behavioral policies (v3, Epic 014). The only behavioral knobs; everything
 * else is derived. `stale: 'review'` is reserved for the review-UX program.
 */
export const PoliciesConfigSchema = z.object({
    removal: z.enum(['remove', 'warn-only', 'preserve']).default('remove'),
    stale: z.enum(['translate', 'preserve', 'review']).default('translate'),
    reviewKeys: z.array(z.string()).default([]),
}).default({ removal: 'remove', stale: 'translate', reviewKeys: [] });

export type PoliciesConfig = z.infer<typeof PoliciesConfigSchema>;

/**
 * v3 shorthand authoring form (Epic 015). Accepted anywhere a config loads;
 * normalized to the canonical shape before use.
 */
export interface TranslatronV3Config {
    sourceLocale?: string;
    locales?: string[];
    model?: string;
    skills?: { dir?: string; paths?: string[] };
    execution?: {
        maxLanguages?: number;
        maxBatchesPerLanguage?: number;
        maxGlobalModelCalls?: number;
        maxUnitsPerBatch?: number;
    };
    providers?: unknown;
    extractors?: unknown;
    validation?: unknown;
    output?: unknown;
    prompts?: unknown;
    advanced?: unknown;
    registry?: unknown;
    catalogs?: unknown;
    policies?: unknown;
}

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
    skills: SkillsConfigSchema.optional(),
    registry: RegistryConfigSchema.optional(),
    catalogs: CatalogsConfigSchema.optional(),
    policies: PoliciesConfigSchema.optional(),
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
