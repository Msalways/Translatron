/**
 * Model resolver (moved from `runtime/deepagents/models.ts` in Epic 014:
 * pure string mapping with zero framework imports, so `src/core/` can use it
 * without tripping the framework boundary test; re-exported there for compat).
 *
 * Normalizes every supported model reference into a runtime model string plus
 * an ordered fallback chain:
 *   - "provider:model" strings pass through (validated prefix)
 *   - legacy v2 ProviderConfig ({type, model, fallback}) maps to the same form
 *   - Epic 004 adapter output ({model: "type:model"}) passes through
 *
 * Direct provider wrappers are deprecated after the compatibility period;
 * all execution goes through these strings.
 */
import type { ProviderConfig } from '../config/schema.js';

export const KNOWN_MODEL_PREFIXES = [
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
    'openrouter',
    'nvidia',
    'local',
] as const;

export interface ResolvedModels {
    model: string;
    fallbackModels: string[];
}

/** Resolve a "provider:model" string, validating the provider prefix. */
export function resolveModelString(raw: string, fallback: string[] = []): ResolvedModels {
    const trimmed = raw.trim();
    const separator = trimmed.indexOf(':');
    if (separator <= 0) {
        throw new Error(
            `Invalid model "${raw}": expected "provider:model" (e.g. "openai:gpt-5"). Known providers: ${KNOWN_MODEL_PREFIXES.join(', ')}`
        );
    }
    const prefix = trimmed.substring(0, separator);
    if (!(KNOWN_MODEL_PREFIXES as readonly string[]).includes(prefix)) {
        throw new Error(`Unknown model provider "${prefix}" in "${raw}". Known: ${KNOWN_MODEL_PREFIXES.join(', ')}`);
    }
    return { model: trimmed, fallbackModels: fallback };
}

/** Map a legacy v2 provider entry to runtime model strings. */
export function resolveLegacyProvider(provider: ProviderConfig, allProviders: ProviderConfig[]): ResolvedModels {
    const model = `${provider.type}:${provider.model}`;
    const fallbacks: string[] = [];
    const seen = new Set<string>([provider.name]);
    let next: string | undefined = provider.fallback;
    while (next !== undefined && !seen.has(next)) {
        seen.add(next);
        const target = allProviders.find((p) => p.name === next);
        if (target === undefined) break;
        fallbacks.push(`${target.type}:${target.model}`);
        next = target.fallback;
    }
    return resolveModelString(model, fallbacks);
}
