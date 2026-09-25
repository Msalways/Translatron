import { describe, it, expect } from 'vitest';
import { assembleEngineInput } from '../../src/cli/sync-v3.js';
import { normalizeConfig, toLegacyConfig } from '../../src/config/normalize.js';
import type { ProjectState } from '../../src/cli/project.js';
import { StubRuntime } from '../../src/runtime/stub.js';
import { computeHash } from '../../src/utils/hash.js';

function state(): ProjectState {
    return {
        config: {
            sourceLanguage: 'en-GB',
            targetLanguages: [{ language: 'French', shortCode: 'fr-FR' }],
            extractors: [{ type: 'json', pattern: './locales/en.json' }],
            providers: [{ name: 'main', type: 'openai', model: 'gpt-5', temperature: 0.3, maxRetries: 3 }],
            validation: { preservePlaceholders: true, maxLengthRatio: 3, preventSourceLeakage: true },
            output: { dir: './locales', format: 'json', flat: false, indent: 2, fileNaming: '{shortCode}.json', allowSameFolder: false },
            catalogs: { targetOnly: ['legal.*'] },
            policies: { removal: 'warn-only', stale: 'translate' },
        } as ProjectState['config'],
        sourceFiles: ['locales/en.json'],
        sourceUnits: [
            {
                unitId: 'u-a',
                keyPath: 'a',
                sourceText: 'Hello',
                sourceHash: computeHash('Hello'),
                placeholders: [],
                sourceFile: 'en.json',
                schemaVersion: 1,
            },
        ],
        targets: [{ locale: 'fr-FR', entries: {} }],
        targetFiles: [{ locale: 'fr-FR', path: '/tmp/fr-FR.json', found: false }],
        revisions: [],
        registryPresent: false,
        registryReadable: false,
        registryDetail: 'No v3 registry found.',
        skills: [],
        skillWarnings: [],
        registryDir: '/tmp/.translatron',
    };
}

describe('sync-v3: legacy config mapping (C-T003)', () => {
    it('maps project state to engine input with policies, targetOnly, and limits', () => {
        const normalized = normalizeConfig({
            sourceLocale: 'en-GB',
            locales: ['fr-FR'],
            model: 'openai:gpt-5',
            execution: { maxLanguages: 2 },
        });
        const input = assembleEngineInput(state(), normalized, { force: true }, new StubRuntime());
        expect(input.sourceLocale).toBe('en-GB');
        expect(input.targetFiles).toEqual({ 'fr-FR': '/tmp/fr-FR.json' });
        expect(input.targetOnly).toEqual(['legal.*']);
        expect(input.policies).toEqual({ removal: 'warn-only', stale: 'translate' });
        expect(input.forceRegenerate).toBe(true);
        expect(input.limits).toMatchObject({ maxLanguages: 2, maxGlobalModelCalls: 8 });
        expect(input.maxUnitsPerBatch).toBe(20);
        expect(input.conflictKeys?.size ?? 0).toBe(0);
        expect(input.legacyPrompts).toBeUndefined();
    });

    it('forwards legacy prompts and affected-by-skill', () => {
        const st = state();
        st.config = {
            ...st.config,
            prompts: { brandVoice: 'playful', glossary: { hi: 'salut' } },
        } as ProjectState['config'];
        const normalized = normalizeConfig({ sourceLocale: 'en-GB', locales: ['fr-FR'] });
        const input = assembleEngineInput(st, normalized, { affectedBySkill: 's', dryRun: true }, new StubRuntime());
        expect(input.legacyPrompts).toMatchObject({ brandVoice: 'playful' });
        expect(input.affectedBySkill).toBe('s');
        expect(input.dryRun).toBe(true);
    });

    it('toLegacyConfig consumes v3 keys and keeps legacy ones', () => {
        const raw = {
            sourceLocale: 'en-GB',
            locales: ['fr-FR'],
            model: 'groq:llama-x',
            extractors: [{ type: 'json', pattern: './in/en.json' }],
            policies: { removal: 'preserve' },
        };
        const config = toLegacyConfig(raw, normalizeConfig(raw));
        expect(config.sourceLanguage).toBe('en-GB');
        expect(config.targetLanguages).toEqual([{ language: 'French', shortCode: 'fr-FR' }]);
        expect(config.providers).toMatchObject([{ name: 'default', type: 'groq', model: 'llama-x' }]);
        expect(config.extractors).toEqual(raw.extractors);
        expect(config.policies).toMatchObject({ removal: 'preserve' });
        expect((config as Record<string, unknown>)['locales']).toBeUndefined();
        expect((config as Record<string, unknown>)['model']).toBeUndefined();
    });
});
