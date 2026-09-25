import { describe, it, expect } from 'vitest';
import { buildV2Scaffold, buildV3Scaffold } from '../../src/cli/init.js';
import { getDefaultConfig } from '../../src/config/loader.js';
import { normalizeConfig } from '../../src/config/normalize.js';

describe('init scaffolds (D-T004)', () => {
    it('v2 scaffold matches the historical template shape', () => {
        const scaffold = buildV2Scaffold(getDefaultConfig());
        expect(scaffold.file).toBe('translatronx.config.ts');
        expect(scaffold.content.startsWith(`import { defineConfig } from 'translatronx';`)).toBe(true);
        expect(scaffold.content).toContain('export default defineConfig(');
        expect(scaffold.content).toContain('"sourceLanguage": "en"');
    });

    it('v3 scaffold is a TypeScript provider config parsing warning-free', () => {
        const scaffold = buildV3Scaffold();
        expect(scaffold.file).toBe('translatronx.config.ts');
        expect(scaffold.content).toContain("import { defineConfig } from 'translatronx';");
        expect(scaffold.content).toContain('apiKey: process.env.OPENAI_API_KEY');
        expect(scaffold.content).toContain('baseUrl: process.env.OPENAI_BASE_URL');
        expect(scaffold.content).toContain('sourceLocale: \'en-GB\'');
        expect(scaffold.content).toContain('locales: [\'fr-FR\', \'de-DE\']');
    });

    it('v3 scaffold provider form normalizes without warnings', () => {
        const normalized = normalizeConfig({
            sourceLocale: 'en-GB',
            locales: ['fr-FR', 'de-DE'],
            providers: [{ name: 'primary', type: 'openai', model: 'gpt-5', apiKey: undefined, baseUrl: undefined }],
            skills: { paths: ['./translatron/skills'] },
            execution: { maxLanguages: 4, maxGlobalModelCalls: 8 },
        });
        expect(normalized.warnings).toEqual([]);
        expect(normalized.targetLanguages).toHaveLength(2);
        expect(normalized.providers).toHaveLength(1);
    });
});
