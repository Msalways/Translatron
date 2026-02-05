import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TranslationImporter } from '../src/utils/importer';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('TranslationImporter with Polars', () => {
    const testDir = './test-import-temp';
    const sourcePath = join(testDir, 'en.json');
    const targetPath = join(testDir, 'fr.json');

    beforeEach(() => {
        // Create test directory
        if (!existsSync(testDir)) {
            mkdirSync(testDir, { recursive: true });
        }

        // Create test source file
        const sourceData = {
            auth: {
                login: 'Log in',
                logout: 'Log out',
                signup: 'Sign up',
            },
            welcome: 'Welcome!',
            goodbye: 'Goodbye!',
        };
        writeFileSync(sourcePath, JSON.stringify(sourceData, null, 2));

        // Create test target file (partial translation)
        const targetData = {
            auth: {
                login: 'Se connecter',
                logout: 'Se déconnecter',
            },
            welcome: 'Bienvenue!',
        };
        writeFileSync(targetPath, JSON.stringify(targetData, null, 2));
    });

    afterEach(() => {
        // Clean up test directory
        if (existsSync(testDir)) {
            rmSync(testDir, { recursive: true, force: true });
        }
    });

    describe('importFromFiles', () => {
        it('should import matching keys from source and target files', async () => {
            const records = await TranslationImporter.importFromFiles(
                sourcePath,
                targetPath,
                'fr'
            );

            expect(records.length).toBe(3); // auth.login, auth.logout, welcome

            const loginRecord = records.find(r => r.keyPath === 'auth.login');
            expect(loginRecord).toBeDefined();
            expect(loginRecord?.langCode).toBe('fr');
            expect(loginRecord?.sourceHash).toBeDefined();
            expect(loginRecord?.targetHash).toBeDefined();
        });

        it('should handle nested JSON structures', async () => {
            const records = await TranslationImporter.importFromFiles(
                sourcePath,
                targetPath,
                'fr'
            );

            const nestedKeys = records.filter(r => r.keyPath.startsWith('auth.'));
            expect(nestedKeys.length).toBe(2); // auth.login, auth.logout
        });

        it('should skip keys missing in target file', async () => {
            const records = await TranslationImporter.importFromFiles(
                sourcePath,
                targetPath,
                'fr'
            );

            const signupRecord = records.find(r => r.keyPath === 'auth.signup');
            expect(signupRecord).toBeUndefined(); // Not in target file

            const goodbyeRecord = records.find(r => r.keyPath === 'goodbye');
            expect(goodbyeRecord).toBeUndefined(); // Not in target file
        });
    });

    describe('importFromMultipleFiles', () => {
        it('should import from multiple target files', async () => {
            // Create additional target file
            const dePath = join(testDir, 'de.json');
            const deData = {
                auth: {
                    login: 'Anmelden',
                },
                welcome: 'Willkommen!',
            };
            writeFileSync(dePath, JSON.stringify(deData, null, 2));

            const records = await TranslationImporter.importFromMultipleFiles(
                sourcePath,
                [
                    { path: targetPath, langCode: 'fr' },
                    { path: dePath, langCode: 'de' },
                ]
            );

            const frRecords = records.filter(r => r.langCode === 'fr');
            const deRecords = records.filter(r => r.langCode === 'de');

            expect(frRecords.length).toBe(3);
            expect(deRecords.length).toBe(2);
        });
    });

    describe('analyzeCoverage', () => {
        it('should calculate coverage statistics using Polars', () => {
            const coverage = TranslationImporter.analyzeCoverage(
                sourcePath,
                targetPath
            );

            expect(coverage.totalKeys).toBe(5); // 3 auth keys + welcome + goodbye
            expect(coverage.matchedKeys).toBe(3); // auth.login, auth.logout, welcome
            expect(coverage.missingKeys).toContain('auth.signup');
            expect(coverage.missingKeys).toContain('goodbye');
            expect(coverage.coverage).toBeCloseTo(60, 0); // 3/5 = 60%
        });

        it('should handle 100% coverage', () => {
            // Create target with all keys
            const fullTargetData = {
                auth: {
                    login: 'Se connecter',
                    logout: 'Se déconnecter',
                    signup: 'S\'inscrire',
                },
                welcome: 'Bienvenue!',
                goodbye: 'Au revoir!',
            };
            writeFileSync(targetPath, JSON.stringify(fullTargetData, null, 2));

            const coverage = TranslationImporter.analyzeCoverage(
                sourcePath,
                targetPath
            );

            expect(coverage.coverage).toBe(100);
            expect(coverage.missingKeys.length).toBe(0);
        });

        it('should handle 0% coverage', () => {
            // Create empty target
            writeFileSync(targetPath, JSON.stringify({}, null, 2));

            const coverage = TranslationImporter.analyzeCoverage(
                sourcePath,
                targetPath
            );

            expect(coverage.coverage).toBe(0);
            expect(coverage.missingKeys.length).toBe(5);
        });
    });
});
