import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadProjectState } from '../../src/cli/project.js';
import { validateConfig } from '../../src/config/schema.js';
import { ContextGenerator } from '../../src/utils/context-generator.js';

const dirs: string[] = [];
afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('v3 source context loading', () => {
    it('preserves context under a source key named value when syncing', () => {
        const merged = ContextGenerator.mergeContextFiles(
            { value: { caption: { value: 'Old', context: 'Illustration caption' } } },
            { value: { caption: { value: 'New', context: '' } } }
        );
        expect(merged).toEqual({ value: { caption: { value: 'New', context: 'Illustration caption' } } });
    });

    it('applies nested context metadata through the configured catalog loader', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'translatron-context-'));
        dirs.push(dir);
        const source = join(dir, 'en-GB.json');
        writeFileSync(source, JSON.stringify({ checkout: { payNow: 'Pay now' }, 'welcome.title': 'Welcome', value: { caption: 'Caption' } }));
        writeFileSync(join(dir, 'en-GB.context.json'), JSON.stringify({
            checkout: { payNow: { value: 'Pay now', context: 'Button at the payment step' } },
            'welcome.title': { value: 'Welcome', context: '' },
            value: { caption: { value: 'Caption', context: 'An illustration caption' } },
        }));
        const config = validateConfig({
            sourceLanguage: 'en-GB',
            targetLanguages: [{ language: 'French', shortCode: 'fr-FR' }],
            extractors: [{ type: 'json', pattern: source.replace(/\\/g, '/'), keyPrefix: 'app', contextFile: { enabled: true } }],
            providers: [{ name: 'primary', type: 'openai', model: 'gpt-5' }],
            output: { dir },
            skills: { dir: join(dir, 'skills') },
            registry: { dir: join(dir, '.translatron') },
        });
        const state = await loadProjectState(config);
        expect(state.sourceUnits.find((unit) => unit.keyPath === 'app.checkout.payNow')?.context).toBe('Button at the payment step');
        expect(state.sourceUnits.find((unit) => unit.keyPath === 'app.welcome.title')?.context).toBeUndefined();
        expect(state.sourceUnits.find((unit) => unit.keyPath === 'app.value.caption')?.context).toBe('An illustration caption');
    });

    it('reports a configured missing context file', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'translatron-context-'));
        dirs.push(dir);
        const source = join(dir, 'en-GB.json');
        writeFileSync(source, JSON.stringify({ button: 'Pay now' }));
        const config = validateConfig({
            sourceLanguage: 'en-GB',
            targetLanguages: [{ language: 'French', shortCode: 'fr-FR' }],
            extractors: [{ type: 'json', pattern: source.replace(/\\/g, '/'), contextFile: { enabled: true } }],
            providers: [{ name: 'primary', type: 'openai', model: 'gpt-5' }],
            output: { dir },
            skills: { dir: join(dir, 'skills') },
            registry: { dir: join(dir, '.translatron') },
        });
        await expect(loadProjectState(config)).rejects.toThrow(/Cannot read context file.*en-GB\.context\.json/);
    });
});
