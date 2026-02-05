import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { translatronxLedger } from '../src/ledger/index';
import { unlinkSync, existsSync } from 'fs';

describe('Ledger Import Functionality', () => {
    const testLedgerPath = './.test-ledger-import.sqlite';
    let ledger: translatronxLedger;

    beforeEach(() => {
        // Clean up any existing test ledger
        if (existsSync(testLedgerPath)) {
            unlinkSync(testLedgerPath);
        }
        ledger = new translatronxLedger(testLedgerPath);
    });

    afterEach(() => {
        ledger.close();
        if (existsSync(testLedgerPath)) {
            unlinkSync(testLedgerPath);
        }
    });

    describe('importExistingTranslation', () => {
        it('should import a single translation and mark as CLEAN', () => {
            ledger.importExistingTranslation(
                'auth.login',
                'fr',
                'source-hash-123',
                'target-hash-456'
            );

            const syncStatus = ledger.getSyncStatus('auth.login', 'fr');
            expect(syncStatus).toBeDefined();
            expect(syncStatus?.status).toBe('CLEAN');
            expect(syncStatus?.target_hash).toBe('target-hash-456');

            const sourceHash = ledger.getSourceHash('auth.login');
            expect(sourceHash).toBe('source-hash-123');
        });

        it('should not re-translate imported translations on next sync', () => {
            ledger.importExistingTranslation(
                'welcome',
                'de',
                'source-hash-abc',
                'target-hash-def'
            );

            const syncStatus = ledger.getSyncStatus('welcome', 'de');
            expect(syncStatus?.status).toBe('CLEAN');
        });
    });

    describe('bulkImportTranslations', () => {
        it('should import multiple translations in a transaction', () => {
            const records = [
                {
                    keyPath: 'auth.login',
                    langCode: 'fr',
                    sourceHash: 'hash1',
                    targetHash: 'hash2',
                },
                {
                    keyPath: 'auth.logout',
                    langCode: 'fr',
                    sourceHash: 'hash3',
                    targetHash: 'hash4',
                },
                {
                    keyPath: 'auth.login',
                    langCode: 'de',
                    sourceHash: 'hash1',
                    targetHash: 'hash5',
                },
            ];

            const stats = ledger.bulkImportTranslations(records);

            expect(stats.totalRecords).toBe(3);
            expect(stats.imported).toBe(3);
            expect(stats.skipped).toBe(0);
            expect(stats.errors).toBe(0);
            expect(stats.languages).toContain('fr');
            expect(stats.languages).toContain('de');
        });

        it('should skip already imported CLEAN translations', () => {
            const record = {
                keyPath: 'test.key',
                langCode: 'es',
                sourceHash: 'hash-a',
                targetHash: 'hash-b',
            };

            // First import
            const stats1 = ledger.bulkImportTranslations([record]);
            expect(stats1.imported).toBe(1);
            expect(stats1.skipped).toBe(0);

            // Second import (should skip)
            const stats2 = ledger.bulkImportTranslations([record]);
            expect(stats2.imported).toBe(0);
            expect(stats2.skipped).toBe(1);
        });

        it('should track import duration', () => {
            const records = [
                {
                    keyPath: 'key1',
                    langCode: 'fr',
                    sourceHash: 'h1',
                    targetHash: 'h2',
                },
            ];

            const stats = ledger.bulkImportTranslations(records);
            expect(stats.duration).toBeGreaterThanOrEqual(0);
        });
    });

    describe('getUntranslatedLanguages', () => {
        it('should return languages missing translations for a key', () => {
            ledger.importExistingTranslation('welcome', 'fr', 'hash1', 'hash2');
            ledger.importExistingTranslation('welcome', 'de', 'hash1', 'hash3');

            const targetLanguages = ['fr', 'de', 'es', 'it'];
            const missing = ledger.getUntranslatedLanguages('welcome', targetLanguages);

            expect(missing).toContain('es');
            expect(missing).toContain('it');
            expect(missing).not.toContain('fr');
            expect(missing).not.toContain('de');
        });

        it('should return all languages if key has no translations', () => {
            const targetLanguages = ['fr', 'de', 'es'];
            const missing = ledger.getUntranslatedLanguages('new.key', targetLanguages);

            expect(missing).toEqual(targetLanguages);
        });
    });

    describe('getMissingKeys', () => {
        it('should return keys that need translation for a language', () => {
            ledger.importExistingTranslation('auth.login', 'fr', 'h1', 'h2');
            ledger.importExistingTranslation('auth.logout', 'fr', 'h3', 'h4');

            const sourceKeys = ['auth.login', 'auth.logout', 'auth.signup', 'welcome'];
            const missing = ledger.getMissingKeys(sourceKeys, 'fr');

            expect(missing).toContain('auth.signup');
            expect(missing).toContain('welcome');
            expect(missing).not.toContain('auth.login');
            expect(missing).not.toContain('auth.logout');
        });

        it('should return all keys if language has no translations', () => {
            const sourceKeys = ['key1', 'key2', 'key3'];
            const missing = ledger.getMissingKeys(sourceKeys, 'es');

            expect(missing).toEqual(sourceKeys);
        });

        it('should handle empty source keys array', () => {
            const missing = ledger.getMissingKeys([], 'fr');
            expect(missing).toEqual([]);
        });
    });

    describe('getLanguageCoverageStats', () => {
        it('should calculate coverage statistics for languages', () => {
            // Import some translations
            ledger.updateSourceHash('key1', 'hash1');
            ledger.updateSourceHash('key2', 'hash2');
            ledger.updateSourceHash('key3', 'hash3');

            ledger.importExistingTranslation('key1', 'fr', 'hash1', 'fr-hash1');
            ledger.importExistingTranslation('key2', 'fr', 'hash2', 'fr-hash2');

            ledger.importExistingTranslation('key1', 'de', 'hash1', 'de-hash1');

            const stats = ledger.getLanguageCoverageStats(['fr', 'de', 'es']);

            const frStats = stats.find(s => s.langCode === 'fr');
            expect(frStats?.totalKeys).toBe(3);
            expect(frStats?.translatedKeys).toBe(2);
            expect(frStats?.coverage).toBeCloseTo(66.67, 1);
            expect(frStats?.missingKeys).toContain('key3');

            const deStats = stats.find(s => s.langCode === 'de');
            expect(deStats?.translatedKeys).toBe(1);
            expect(deStats?.coverage).toBeCloseTo(33.33, 1);

            const esStats = stats.find(s => s.langCode === 'es');
            expect(esStats?.translatedKeys).toBe(0);
            expect(esStats?.coverage).toBe(0);
        });
    });
});
