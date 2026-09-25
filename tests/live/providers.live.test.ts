import { describe, it, expect } from 'vitest';
import { ProviderFactory } from '../../src/providers/index.js';
import type { ProviderConfig } from '../../src/config/schema.js';
import type { TranslationBatch } from '../../src/types/index.js';

/**
 * Live provider integration (K-T006).
 *
 * Opt-in ONLY: `RUN_LIVE_TESTS=1` with real keys. Default runs skip every
 * case with zero network, zero keys, zero cost. Each case additionally
 * requires its own key, so partial credentials run a partial matrix.
 *
 * Required keys:
 *   OPENAI_API_KEY, ANTHROPIC_API_KEY, GROQ_API_KEY
 *
 * Models are the cheapest usable per provider; one unit per call.
 */
const LIVE = process.env['RUN_LIVE_TESTS'] === '1';

function batch(): TranslationBatch {
    return {
        batchId: 'live_probe',
        sourceUnits: [
            {
                unitId: 'u-live-1',
                keyPath: 'live.probe',
                sourceText: 'Hello',
                sourceHash: 'live',
                placeholders: [],
                sourceFile: 'live',
                schemaVersion: 1,
            },
        ],
        targetLanguage: 'fr',
        deduplicationKey: 'live',
    };
}

const PROMPT = { system: 'Translate to French. Reply with a JSON array of translated strings.', user: '["Hello"]', temperature: 0 };

function providerConfig(type: ProviderConfig['type'], model: string, apiKey: string): ProviderConfig {
    return { name: `live-${type}`, type, model, apiKey, temperature: 0, maxRetries: 1 };
}

describe.skipIf(!LIVE)('live providers (K-T006)', () => {
    it('openai translates one unit', async () => {
        if (process.env['OPENAI_API_KEY'] === undefined) return;
        const provider = ProviderFactory.createProvider(
            providerConfig('openai', 'gpt-4o-mini', process.env['OPENAI_API_KEY'])
        );
        const results = await provider.translate(batch(), PROMPT);
        expect(results).toHaveLength(1);
        expect(results[0].translatedText.trim().length).toBeGreaterThan(0);
        expect(provider.getModelFingerprint()).toBe('openai:gpt-4o-mini');
    });

    it('anthropic translates one unit', async () => {
        if (process.env['ANTHROPIC_API_KEY'] === undefined) return;
        const provider = ProviderFactory.createProvider(
            providerConfig('anthropic', 'claude-3-5-haiku-20241022', process.env['ANTHROPIC_API_KEY'])
        );
        const results = await provider.translate(batch(), PROMPT);
        expect(results).toHaveLength(1);
        expect(results[0].translatedText.trim().length).toBeGreaterThan(0);
    });

    it('groq translates one unit', async () => {
        if (process.env['GROQ_API_KEY'] === undefined) return;
        const provider = ProviderFactory.createProvider(
            providerConfig('groq', 'llama-3.1-8b-instant', process.env['GROQ_API_KEY'])
        );
        const results = await provider.translate(batch(), PROMPT);
        expect(results).toHaveLength(1);
        expect(results[0].translatedText.trim().length).toBeGreaterThan(0);
    });
});
