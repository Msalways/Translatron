/**
 * v3 authoring ergonomics (Epic 015).
 *
 * Normalizes the terse v3 config forms (`locales`, `model`, `skills.paths`,
 * `execution`) into the canonical shape the engine consumes. Pure function:
 * unknown top-level keys warn (compat-safe), contradictory combinations throw.
 */
import type { ProviderConfig, TargetLanguage, translatronxConfig } from './schema.js';
import { validateConfig } from './schema.js';
import { DEFAULT_EXECUTION_LIMITS } from '../core/domain.js';
import type { ExecutionLimits } from '../core/domain.js';

export interface NormalizedV3Config {
    sourceLocale: string;
    targetLanguages: TargetLanguage[];
    /** Never empty: minimal form defaults to openai:gpt-5 (with warning). */
    providers: ProviderConfig[];
    skillsDir: string;
    skillPaths: string[];
    skillPackage?: { name: string; version: string };
    limits: ExecutionLimits;
    maxUnitsPerBatch: number;
    warnings: string[];
}

/** Display names for common locale codes; unknown codes fall back to the code. */
export const LOCALE_DISPLAY_NAMES: Record<string, string> = {
    'en-GB': 'English (UK)',
    'en-US': 'English (US)',
    'en': 'English',
    'fr-FR': 'French',
    'fr': 'French',
    'de-DE': 'German',
    'de': 'German',
    'ja-JP': 'Japanese',
    'ja': 'Japanese',
    'es-ES': 'Spanish',
    'es': 'Spanish',
    'pt-BR': 'Portuguese (Brazil)',
    'pt': 'Portuguese',
    'it-IT': 'Italian',
    'it': 'Italian',
    'nl-NL': 'Dutch',
    'nl': 'Dutch',
    'ko-KR': 'Korean',
    'ko': 'Korean',
    'zh-CN': 'Chinese (Simplified)',
    'zh-TW': 'Chinese (Traditional)',
};

const DEFAULT_MODEL = 'openai:gpt-5';

export function displayNameForLocale(code: string): string {
    return LOCALE_DISPLAY_NAMES[code] ?? code;
}

/**
 * Normalize unknown (possibly v3-shorthand or legacy) config input.
 * Never throws on legacy shapes; throws only on contradictions.
 */
export function normalizeConfig(raw: unknown): NormalizedV3Config {
    const warnings: string[] = [];
    const shape = (raw ?? {}) as Record<string, unknown>;

    const sourceLocale = typeof shape['sourceLocale'] === 'string'
        ? shape['sourceLocale']
        : typeof shape['sourceLanguage'] === 'string' ? shape['sourceLanguage'] : 'en-GB';

    // Target languages: v3 `locales: string[]` or legacy `targetLanguages`.
    let targetLanguages: TargetLanguage[];
    if (Array.isArray(shape['locales'])) {
        targetLanguages = (shape['locales'] as unknown[]).map((code) => {
            if (typeof code !== 'string' || code.length < 2) {
                throw new Error(`Invalid locale code in "locales": ${JSON.stringify(code)}`);
            }
            return { language: displayNameForLocale(code), shortCode: code };
        });
    } else if (Array.isArray(shape['targetLanguages'])) {
        targetLanguages = (shape['targetLanguages'] as Array<{ language?: unknown; shortCode?: unknown }>)
            .filter((t) => typeof t.shortCode === 'string')
            .map((t) => ({
                language: typeof t.language === 'string' ? t.language : (t.shortCode as string),
                shortCode: t.shortCode as string,
            }));
    } else {
        targetLanguages = [];
    }

    // Providers: legacy `providers`, v3 `model` shorthand, or the default.
    const providersRaw = Array.isArray(shape['providers'])
        ? (shape['providers'] as ProviderConfig[])
        : [];
    const modelRaw = shape['model'];
    if (providersRaw.length > 0 && modelRaw !== undefined) {
        throw new Error('Ambiguous config: specify either "providers" or "model", not both.');
    }
    let providers: ProviderConfig[];
    if (providersRaw.length > 0) {
        providers = providersRaw;
    } else if (typeof modelRaw === 'string') {
        providers = [providerFromModel(modelRaw)];
    } else {
        providers = [providerFromModel(DEFAULT_MODEL)];
        warnings.push(`No model configured; defaulted to "${DEFAULT_MODEL}". Set "model" explicitly.`);
    }

    // Skills: object form, v3 `skills.paths` shorthand, or defaults.
    let skillsDir = './translatron/skills';
    let skillPaths: string[] = [];
    let skillPackage: { name: string; version: string } | undefined;
    const skillsRaw = shape['skills'] as { dir?: unknown; paths?: unknown; package?: unknown } | undefined;
    if (skillsRaw !== undefined && skillsRaw !== null && typeof skillsRaw === 'object') {
        if (typeof skillsRaw.dir === 'string') skillsDir = skillsRaw.dir;
        if (Array.isArray(skillsRaw.paths)) skillPaths = (skillsRaw.paths as unknown[]).filter((p): p is string => typeof p === 'string');
        if (skillsRaw.package !== undefined && skillsRaw.package !== null && typeof skillsRaw.package === 'object') {
            const candidate = skillsRaw.package as Record<string, unknown>;
            if (typeof candidate.name !== 'string' || typeof candidate.version !== 'string') throw new Error('Invalid skills.package: exact name and version are required.');
            skillPackage = { name: candidate.name, version: candidate.version };
        }
    }

    // Execution limits: per-key merge over DEFAULT_EXECUTION_LIMITS (R&D 8).
    const executionRaw = shape['execution'] as Record<string, unknown> | undefined;
    const limits: ExecutionLimits = { ...DEFAULT_EXECUTION_LIMITS };
    let maxUnitsPerBatch = 20;
    if (executionRaw !== undefined && executionRaw !== null && typeof executionRaw === 'object') {
        for (const key of ['maxLanguages', 'maxBatchesPerLanguage', 'maxGlobalModelCalls'] as const) {
            const value = executionRaw[key];
            if (value !== undefined) {
                if (!Number.isInteger(value) || (value as number) < 1) {
                    throw new Error(`Invalid "execution.${key}": expected a positive integer.`);
                }
                limits[key] = value as number;
            }
        }
        if (executionRaw['maxUnitsPerBatch'] !== undefined) {
            const value = executionRaw['maxUnitsPerBatch'];
            if (!Number.isInteger(value) || (value as number) < 1) {
                throw new Error('Invalid "execution.maxUnitsPerBatch": expected a positive integer.');
            }
            maxUnitsPerBatch = value as number;
        }
    }

    // Compat-safe unknown-key warnings (never throw: legacy configs vary).
    const knownTopLevel = new Set([
        'sourceLanguage', 'sourceLocale', 'locales', 'targetLanguages', 'extractors',
        'providers', 'model', 'validation', 'output', 'prompts', 'advanced',
        'skills', 'registry', 'catalogs', 'policies', 'execution',
    ]);
    for (const key of Object.keys(shape)) {
        if (!knownTopLevel.has(key)) warnings.push(`Unknown config key "${key}" ignored.`);
    }

    return { sourceLocale, targetLanguages, providers, skillsDir, skillPaths, ...(skillPackage !== undefined ? { skillPackage } : {}), limits, maxUnitsPerBatch, warnings };
}

function providerFromModel(model: string): ProviderConfig {
    const separator = model.indexOf(':');
    if (separator <= 0) {
        throw new Error(`Invalid model "${model}": expected "provider:model" (e.g. "openai:gpt-5").`);
    }
    return {
        name: 'default',
        type: model.substring(0, separator) as ProviderConfig['type'],
        model: model.substring(separator + 1),
        temperature: 0.3,
        maxRetries: 3,
    };
}

/**
 * v3 shorthand + legacy keys → effective legacy-shaped config (v3 keys
 * consumed). Used by `sync --v3` and by `loadConfig` as the v3 fallback,
 * so every command accepts v3-minimal configs.
 */
export function toLegacyConfig(raw: unknown, normalized: NormalizedV3Config): translatronxConfig {
    const rawRec = (raw ?? {}) as Record<string, unknown>;
    return validateConfig({
        sourceLanguage: normalized.sourceLocale,
        targetLanguages: normalized.targetLanguages,
        extractors: rawRec['extractors'] ?? [{ type: 'json', pattern: './locales/en.json' }],
        providers: normalized.providers,
        ...(rawRec['validation'] !== undefined ? { validation: rawRec['validation'] } : {}),
        ...(rawRec['output'] !== undefined ? { output: rawRec['output'] } : {}),
        ...(rawRec['prompts'] !== undefined ? { prompts: rawRec['prompts'] } : {}),
        ...(rawRec['advanced'] !== undefined ? { advanced: rawRec['advanced'] } : {}),
        skills: { dir: normalized.skillsDir, paths: normalized.skillPaths, ...(normalized.skillPackage !== undefined ? { package: normalized.skillPackage } : {}) },
        ...(rawRec['registry'] !== undefined ? { registry: rawRec['registry'] } : {}),
        ...(rawRec['catalogs'] !== undefined ? { catalogs: rawRec['catalogs'] } : {}),
        ...(rawRec['policies'] !== undefined ? { policies: rawRec['policies'] } : {}),
    });
}
