import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TranslationCompiler } from '../src/compiler/index';
import { translatronxConfig } from '../src/config/schema';
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

describe('TranslationCompiler Integration', () => {
    const testDir = join(process.cwd(), 'test-env-integration');
    const ledgerPath = join(testDir, 'ledger.sqlite');
    const sourceFile = join(testDir, 'en.json');
    const outputDir = join(testDir, 'locales');

    // Pattern needs to be forward slashes for fast-glob even on Windows
    const pattern = sourceFile.replace(/\\/g, '/');

    const mockConfig: translatronxConfig = {
        sourceLanguage: 'en',
        targetLanguages: [{ language: 'French', shortCode: 'fr' }],
        extractors: [
            {
                type: 'json',
                pattern: pattern,
                exclude: []
            }
        ],
        providers: [
            {
                name: 'mock',
                type: 'openai',
                model: 'gpt-4',
                apiKey: 'test-key',
                temperature: 0.3,
                maxRetries: 3,
            }
        ],
        validation: {
            preservePlaceholders: true,
            maxLengthRatio: 3,
            preventSourceLeakage: true,
        },
        output: {
            dir: outputDir,
            format: 'json',
            flat: false,
            indent: 2,
            fileNaming: '{shortCode}.json',
            allowSameFolder: false
        },
        advanced: {
            ledgerPath: ledgerPath,
            batchSize: 20,
            concurrency: 3,
            cacheDir: join(testDir, '.cache'),
            verbose: true,
        }
    };

    beforeEach(() => {
        if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
        mkdirSync(testDir, { recursive: true });
        mkdirSync(outputDir, { recursive: true });

        const content = JSON.stringify({
            greeting: "Hello, {name}!",
            auth: {
                login: "Sign in",
                logout: "Sign out"
            }
        }, null, 2);
        writeFileSync(sourceFile, content);
    });

    afterEach(() => {
        if (existsSync(testDir)) {
            // Close ledger first if it was opened
            rmSync(testDir, { recursive: true, force: true });
        }
    });

    it('should extract and translate strings', async () => {
        // Mock the LLM provider
        const mockResults = [
            "Bonjour, {name}!",
            "Se connecter",
            "Se déconnecter"
        ];

        // We need to mock the ProviderFactory or use a mock provider class
        // I'll use vi.spyOn on ProviderFactory.createProvider
        const { ProviderFactory } = await import('../src/providers/index.js');
        const spy = vi.spyOn(ProviderFactory, 'createProvider').mockReturnValue({
            translate: async () => {
                return mockResults.map((text, i) => ({
                    unitId: `id-${i}`,
                    translatedText: text,
                    confidence: 1.0,
                }));
            },
            getModelFingerprint: () => 'mock-model',
            estimateCost: () => 0.01,
        } as any);

        const compiler = new TranslationCompiler(mockConfig);
        const stats = await compiler.sync();
        compiler.close();

        expect(stats.translatedUnits).toBe(3);
        expect(stats.failedUnits).toBe(0);

        // Verify output file
        const frFile = join(outputDir, 'fr.json');
        expect(existsSync(frFile)).toBe(true);

        const frContent = JSON.parse(readFileSync(frFile, 'utf-8'));
        expect(frContent.greeting).toBe("Bonjour, {name}!");
        expect(frContent.auth.login).toBe("Se connecter");
        expect(frContent.auth.logout).toBe("Se déconnecter");

        spy.mockRestore();
    });
});
