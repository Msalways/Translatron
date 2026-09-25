/**
 * Legacy config adapter (Epic 004).
 *
 * Normalizes v2 `translatronxConfig` shapes into the v3 model with explicit,
 * non-blocking deprecation warnings. Old prompt settings become a synthetic
 * "legacy project skill" + glossary layer (consumed for real in Epic 009);
 * provider config collapses to a `type:model` runtime string (Epic 005).
 */
import type { PromptConfig } from '../config/schema.js';

export interface AdaptedModelConfig {
    /** Runtime model string, e.g. "openai:gpt-4o". */
    model: string;
    temperature: number;
    fallback?: string;
}

export interface LegacyProjectSkill {
    /** Synthetic skill content assembled from legacy prompt settings. */
    content: string;
    glossary: Record<string, string>;
}

export interface ConfigAdapterResult {
    sourceLocale: string;
    locales: string[];
    model: AdaptedModelConfig;
    legacySkill: LegacyProjectSkill | null;
    warnings: string[];
}

interface LegacyConfigShape {
    sourceLanguage?: unknown;
    targetLanguages?: unknown;
    providers?: unknown;
    prompts?: PromptConfig;
    advanced?: { ledgerPath?: unknown };
}

/**
 * Adapt an unknown (possibly v2) config object. Never throws on legacy
 * shapes — degrades with warnings instead.
 */
export function adaptLegacyConfig(raw: unknown): ConfigAdapterResult {
    const warnings: string[] = [];
    const shape = (raw ?? {}) as LegacyConfigShape;

    const sourceLocale = typeof shape.sourceLanguage === 'string' ? shape.sourceLanguage : 'en';
    const locales = Array.isArray(shape.targetLanguages)
        ? (shape.targetLanguages as Array<{ shortCode?: unknown }>)
            .map((t) => (typeof t.shortCode === 'string' ? t.shortCode : null))
            .filter((c): c is string => c !== null)
        : [];

    const providers = Array.isArray(shape.providers) ? (shape.providers as Record<string, unknown>[]) : [];
    const first = providers[0] ?? {};
    const providerType = typeof first['type'] === 'string' ? (first['type'] as string) : 'openai';
    const providerModel = typeof first['model'] === 'string' ? (first['model'] as string) : 'gpt-4o';
    const temperature = typeof first['temperature'] === 'number' ? (first['temperature'] as number) : 0.3;
    const fallback = typeof first['fallback'] === 'string' ? (first['fallback'] as string) : undefined;
    if (providers.length === 0) {
        warnings.push('No providers configured; defaulted to openai:gpt-4o. Set an explicit model.');
    }

    let legacySkill: LegacyProjectSkill | null = null;
    const prompts = shape.prompts;
    if (prompts !== undefined && prompts !== null) {
        const lines: string[] = [];
        if (prompts.systemPrompt !== undefined) {
            lines.push(prompts.systemPrompt);
            warnings.push('prompts.systemPrompt is deprecated; folded into the legacy project skill. Use SKILL.md files instead.');
        }
        if (prompts.customContext !== undefined) lines.push(prompts.customContext);
        if (Array.isArray(prompts.userPrompt)) lines.push(prompts.userPrompt.join('\n'));
        if (prompts.formatting !== undefined) lines.push(`Preferred formatting: ${prompts.formatting}.`);
        if (prompts.brandVoice !== undefined) lines.push(`Brand voice: ${prompts.brandVoice}.`);
        if (Object.keys(prompts.glossary ?? {}).length > 0) {
            warnings.push('prompts.glossary is deprecated; carried as a glossary layer. Prefer skills/ resource bundles.');
        }
        if (lines.length > 0 || Object.keys(prompts.glossary ?? {}).length > 0) {
            legacySkill = { content: lines.join('\n'), glossary: { ...(prompts.glossary ?? {}) } };
        }
    }

    if (shape.advanced?.ledgerPath !== undefined) {
        warnings.push(
            `advanced.ledgerPath (${String(shape.advanced.ledgerPath)}) is deprecated; v3 uses the Git registry. The SQLite file is kept as a migration backup only.`
        );
    }

    return {
        sourceLocale,
        locales,
        model: { model: `${providerType}:${providerModel}`, temperature, ...(fallback ? { fallback } : {}) },
        legacySkill,
        warnings,
    };
}
