import { describe, it, expect } from 'vitest';
import { normalizeConfig, displayNameForLocale } from '../../src/config/normalize.js';

describe('config-v3: minimal form (C-T001)', () => {
    it('locales map to display names; model defaults with warning', () => {
        const normalized = normalizeConfig({ sourceLocale: 'en-GB', locales: ['fr-FR', 'ja-JP', 'xx-YY'] });
        expect(normalized.sourceLocale).toBe('en-GB');
        expect(normalized.targetLanguages).toEqual([
            { language: 'French', shortCode: 'fr-FR' },
            { language: 'Japanese', shortCode: 'ja-JP' },
            { language: 'xx-YY', shortCode: 'xx-YY' },
        ]);
        expect(normalized.providers).toEqual([
            { name: 'default', type: 'openai', model: 'gpt-5', temperature: 0.3, maxRetries: 3 },
        ]);
        expect(normalized.warnings.join('\n')).toContain('openai:gpt-5');
        expect(normalized.limits).toEqual({ maxLanguages: 4, maxBatchesPerLanguage: 2, maxGlobalModelCalls: 8 });
        expect(normalized.maxUnitsPerBatch).toBe(20);
        expect(normalized.skillsDir).toBe('./translatron/skills');
        expect(normalized.skillPaths).toEqual([]);
    });
});

describe('config-v3: normal form (C-T001)', () => {
    it('model/skills.paths/execution normalize fully', () => {
        const normalized = normalizeConfig({
            sourceLocale: 'en-GB',
            locales: ['de-DE'],
            model: 'anthropic:claude-x',
            skills: { paths: ['./docs/guide.md'] },
            execution: { maxLanguages: 2, maxGlobalModelCalls: 3, maxUnitsPerBatch: 5 },
        });
        expect(normalized.providers).toEqual([
            { name: 'default', type: 'anthropic', model: 'claude-x', temperature: 0.3, maxRetries: 3 },
        ]);
        expect(normalized.skillPaths).toEqual(['./docs/guide.md']);
        expect(normalized.limits).toMatchObject({ maxLanguages: 2, maxBatchesPerLanguage: 2, maxGlobalModelCalls: 3 });
        expect(normalized.maxUnitsPerBatch).toBe(5);
        expect(normalized.warnings).toEqual([]);
    });

    it('skills.dir override respected', () => {
        const normalized = normalizeConfig({ locales: ['fr-FR'], skills: { dir: './mine/skills' } });
        expect(normalized.skillsDir).toBe('./mine/skills');
    });

    it('uses the configured v3 source locale', () => {
        expect(normalizeConfig({ sourceLocale: 'en-US', locales: ['fr-FR'] }).sourceLocale).toBe('en-US');
    });
});

describe('config-v3: legacy passthrough + conflicts (C-T001)', () => {
    function legacy() {
        return {
            sourceLanguage: 'en-GB',
            targetLanguages: [{ language: 'French', shortCode: 'fr' }],
            extractors: [{ type: 'json', pattern: './locales/en.json' }],
            providers: [{ name: 'main', type: 'openai', model: 'gpt-4o' }],
        };
    }

    it('legacy config normalizes without warnings or alteration', () => {
        const normalized = normalizeConfig(legacy());
        expect(normalized.sourceLocale).toBe('en-GB');
        expect(normalized.targetLanguages).toEqual([{ language: 'French', shortCode: 'fr' }]);
        expect(normalized.providers).toEqual(legacy().providers);
        expect(normalized.warnings).toEqual([]);
    });

    it('providers + model together throw', () => {
        expect(() => normalizeConfig({ ...legacy(), model: 'openai:gpt-5' })).toThrow(/either "providers" or "model"/);
    });

    it('bad model, bad locale, bad execution values throw', () => {
        expect(() => normalizeConfig({ locales: ['fr-FR'], model: 'gpt-5' })).toThrow(/provider:model/);
        expect(() => normalizeConfig({ locales: ['x'] })).toThrow(/Invalid locale code/);
        expect(() => normalizeConfig({ locales: ['fr-FR'], execution: { maxLanguages: 0 } })).toThrow(/positive integer/);
        expect(() => normalizeConfig({ locales: ['fr-FR'], execution: { maxUnitsPerBatch: -2 } })).toThrow(/positive integer/);
    });

    it('unknown top-level keys warn, never throw', () => {
        const normalized = normalizeConfig({ ...legacy(), futureFlag: true });
        expect(normalized.warnings).toEqual(['Unknown config key "futureFlag" ignored.']);
    });
});

describe('config-v3: display names (C-T001)', () => {
    it('covers common codes and falls back to the code', () => {
        expect(displayNameForLocale('de-DE')).toBe('German');
        expect(displayNameForLocale('pt-BR')).toBe('Portuguese (Brazil)');
        expect(displayNameForLocale('xx-YY')).toBe('xx-YY');
    });
});

describe('config-v3: loadConfig fallback (review)', () => {
    it('v3-minimal config loads through loadConfig with synthesized providers', async () => {
        const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
        const { tmpdir } = await import('node:os');
        const { join } = await import('node:path');
        const { loadConfig } = await import('../../src/config/loader.js');
        const dir = mkdtempSync(join(tmpdir(), 'trn-cfg-'));
        try {
            writeFileSync(
                join(dir, 'translatronx.config.json'),
                JSON.stringify({ sourceLocale: 'en-US', locales: ['fr-FR'], model: 'groq:llama-x' }),
                'utf-8'
            );
            const config = await loadConfig(dir);
            expect(config.sourceLanguage).toBe('en-US');
            expect(config.targetLanguages).toEqual([{ language: 'French', shortCode: 'fr-FR' }]);
            expect(config.providers).toMatchObject([{ name: 'default', type: 'groq', model: 'llama-x' }]);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('broken legacy config still throws (no v3 keys, no fallback)', async () => {
        const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
        const { tmpdir } = await import('node:os');
        const { join } = await import('node:path');
        const { loadConfig } = await import('../../src/config/loader.js');
        const dir = mkdtempSync(join(tmpdir(), 'trn-cfg-'));
        try {
            writeFileSync(join(dir, 'translatronx.config.json'), JSON.stringify({ nope: true }), 'utf-8');
            await expect(loadConfig(dir)).rejects.toThrow();
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
