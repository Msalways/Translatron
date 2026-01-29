import { writeFileSync, mkdirSync, renameSync, existsSync, readFileSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { type AtomicWriter } from '../types/index';
import { type TargetLanguage } from '../config/schema';
import { type OutputConfig } from '../config/schema';

/**
 * Atomic file writer using temp file + rename pattern
 */
export class AtomicFileWriter implements AtomicWriter {
    /**
     * Get output file path based on configuration
     */
    static getOutputPath(targetLanguage: TargetLanguage, outputConfig: OutputConfig): string {
        const pattern = outputConfig.fileNaming || '{shortCode}.json';
        const filename = pattern
            .replace(/\{shortCode\}/g, targetLanguage.shortCode)
            .replace(/\{language\}/g, targetLanguage.language);

        return join(outputConfig.dir, filename);
    }

    /**
     * Write translations to a file atomically
     */
    async writeTranslations(filePath: string, translations: Record<string, string>): Promise<void> {
        // Ensure directory exists
        const dir = dirname(filePath);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }

        // Read existing content for merging
        let existing: Record<string, any> = {};
        if (existsSync(filePath)) {
            try {
                const content = readFileSync(filePath, 'utf-8');
                existing = JSON.parse(content);
            } catch (error) {
                console.warn(`Failed to read existing file ${filePath}, starting fresh:`, error);
            }
        }

        // Deep merge translations
        const merged = this.deepMerge(existing, translations);

        // Write to temporary file first
        const tempPath = `${filePath}.tmp`;
        try {
            writeFileSync(tempPath, JSON.stringify(merged, null, 2), 'utf-8');

            // Atomic rename
            renameSync(tempPath, filePath);
        } catch (error) {
            // Cleanup temp file if failed
            if (existsSync(tempPath)) {
                unlinkSync(tempPath);
            }
            throw error;
        }
    }

    /**
     * Deep merge two objects, preserving existing values not being updated
     */
    private deepMerge(target: any, source: any): any {
        if (!source || typeof source !== 'object') {
            return source;
        }

        if (Array.isArray(source)) {
            return source;
        }

        const result = { ...target };

        for (const [key, value] of Object.entries(source)) {
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                result[key] = this.deepMerge(result[key] || {}, value);
            } else {
                result[key] = value;
            }
        }

        return result;
    }

    /**
     * Convert flat key-value pairs to nested object structure
     */
    static flatToNested(flat: Record<string, string>): Record<string, any> {
        const result: Record<string, any> = {};

        for (const [keyPath, value] of Object.entries(flat)) {
            const keys = keyPath.split('.');
            let current = result;

            for (let i = 0; i < keys.length - 1; i++) {
                const key = keys[i];
                if (!current[key]) {
                    current[key] = {};
                }
                current = current[key];
            }

            current[keys[keys.length - 1]] = value;
        }

        return result;
    }
}
