import pl from 'nodejs-polars';
import { readFileSync } from 'fs';
import { computeHash } from '../utils/hash';
import type { ImportRecord } from '../ledger/index';

/**
 * Import utility for loading existing translations using Polars for efficient key comparison
 */
export class TranslationImporter {
    /**
     * Load and compare source and target translation files
     * Returns import records ready for ledger insertion
     */
    static async importFromFiles(
        sourcePath: string,
        targetPath: string,
        langCode: string
    ): Promise<ImportRecord[]> {
        // Read JSON files
        const sourceData = JSON.parse(readFileSync(sourcePath, 'utf-8'));
        const targetData = JSON.parse(readFileSync(targetPath, 'utf-8'));

        // Flatten nested JSON to key-value pairs
        const sourceFlat = this.flattenJson(sourceData);
        const targetFlat = this.flattenJson(targetData);

        // Convert to Polars DataFrames for efficient comparison
        const sourceDf = pl.DataFrame({
            keyPath: Object.keys(sourceFlat),
            sourceText: Object.values(sourceFlat),
        });

        const targetDf = pl.DataFrame({
            keyPath: Object.keys(targetFlat),
            translatedText: Object.values(targetFlat),
        });

        // Inner join to find matching keys
        const matched = sourceDf.join(targetDf, { on: 'keyPath', how: 'inner' });

        // Convert to import records with computed hashes
        const records: ImportRecord[] = [];
        const keyPaths = matched.getColumn('keyPath').toArray() as string[];
        const sourceTexts = matched.getColumn('sourceText').toArray() as string[];
        const translatedTexts = matched.getColumn('translatedText').toArray() as string[];

        for (let i = 0; i < keyPaths.length; i++) {
            const sourceText = String(sourceTexts[i]);
            const translatedText = String(translatedTexts[i]);

            // Skip empty values
            if (!sourceText || !translatedText) continue;

            records.push({
                keyPath: keyPaths[i],
                langCode,
                sourceHash: computeHash(sourceText),
                targetHash: computeHash(translatedText),
            });
        }

        return records;
    }

    /**
     * Import from multiple target files at once
     */
    static async importFromMultipleFiles(
        sourcePath: string,
        targetFiles: Array<{ path: string; langCode: string }>
    ): Promise<ImportRecord[]> {
        const allRecords: ImportRecord[] = [];

        for (const target of targetFiles) {
            const records = await this.importFromFiles(
                sourcePath,
                target.path,
                target.langCode
            );
            allRecords.push(...records);
        }

        return allRecords;
    }

    /**
     * Analyze coverage between source and target files using Polars
     */
    static analyzeCoverage(
        sourcePath: string,
        targetPath: string
    ): {
        totalKeys: number;
        matchedKeys: number;
        missingKeys: string[];
        coverage: number;
    } {
        const sourceData = JSON.parse(readFileSync(sourcePath, 'utf-8'));
        const targetData = JSON.parse(readFileSync(targetPath, 'utf-8'));

        const sourceFlat = this.flattenJson(sourceData);
        const targetFlat = this.flattenJson(targetData);

        const sourceDf = pl.DataFrame({
            keyPath: Object.keys(sourceFlat),
        });

        const targetDf = pl.DataFrame({
            keyPath: Object.keys(targetFlat),
        });

        // Find matched keys (inner join)
        const matched = sourceDf.join(targetDf, { on: 'keyPath', how: 'inner' });

        // Find missing keys (anti join - keys in source but not in target)
        const missing = sourceDf.join(targetDf, { on: 'keyPath', how: 'anti' });

        const totalKeys = sourceDf.height;
        const matchedKeys = matched.height;
        const missingKeys = missing.getColumn('keyPath').toArray() as string[];

        return {
            totalKeys,
            matchedKeys,
            missingKeys,
            coverage: totalKeys > 0 ? (matchedKeys / totalKeys) * 100 : 0,
        };
    }

    /**
     * Flatten nested JSON object to dot-notation keys
     */
    private static flattenJson(
        obj: Record<string, unknown>,
        prefix: string = '',
        result: Record<string, string> = {}
    ): Record<string, string> {
        for (const key in obj) {
            const value = obj[key];
            const newKey = prefix ? `${prefix}.${key}` : key;

            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                this.flattenJson(value as Record<string, unknown>, newKey, result);
            } else if (typeof value === 'string') {
                result[newKey] = value;
            }
        }

        return result;
    }
}
