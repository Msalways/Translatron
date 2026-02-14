import { readFileSync, existsSync } from 'fs';
import fg from 'fast-glob';
import { type Extractor, type SourceUnit, type ContextFile, type ContextMetadata } from '../types/index';
import { type ExtractorConfig } from '../config/schema';
import { computeHash, extractPlaceholders, generateUnitId } from '../utils/hash';

/**
 * JSON file extractor for translatable strings
 */
export class JsonExtractor implements Extractor {
    private schemaVersion = 1;
    private contextData: ContextFile | null = null;

    /**
     * Extract translatable strings from JSON files
     */
    async extract(_sourceFiles: string[], config: ExtractorConfig): Promise<SourceUnit[]> {
        const units: SourceUnit[] = [];

        // Load context file if configured
        if (config.contextFile?.enabled && config.contextFile?.pattern) {
            this.contextData = await this.loadContextFile(config.contextFile.pattern);
        }

        // Find all matching files
        const patterns = Array.isArray(config.pattern) ? config.pattern : [config.pattern];
        const files = await fg(patterns, {
            ignore: config.exclude || ['**/node_modules/**', '**/dist/**'],
            absolute: true,
        });

        // Extract from each file
        for (const filePath of files) {
            try {
                const content = readFileSync(filePath, 'utf-8');
                const data = JSON.parse(content);

                // Recursively extract all string values
                const fileUnits = this.extractFromObject(data, [], filePath, config.keyPrefix);
                units.push(...fileUnits);
            } catch (error) {
                console.error(`Failed to extract from ${filePath}:`, error);
                // Continue with other files
            }
        }

        // Reset context data after extraction
        this.contextData = null;

        return units;
    }

    /**
     * Recursively extract strings from a JSON object
     */
    private extractFromObject(
        obj: any,
        keyPath: string[],
        sourceFile: string,
        keyPrefix?: string
    ): SourceUnit[] {
        const units: SourceUnit[] = [];

        if (typeof obj === 'string') {
            // This is a translatable string
            const fullKeyPath = keyPrefix
                ? `${keyPrefix}.${keyPath.join('.')}`
                : keyPath.join('.');

            units.push(this.createSourceUnit(fullKeyPath, obj, sourceFile));
        } else if (Array.isArray(obj)) {
            // Handle arrays
            obj.forEach((item, index) => {
                units.push(...this.extractFromObject(item, [...keyPath, index.toString()], sourceFile, keyPrefix));
            });
        } else if (obj && typeof obj === 'object') {
            // Handle nested objects
            for (const [key, value] of Object.entries(obj)) {
                units.push(...this.extractFromObject(value, [...keyPath, key], sourceFile, keyPrefix));
            }
        }

        return units;
    }

    /**
     * Create a source unit from extracted string
     */
    private createSourceUnit(keyPath: string, sourceText: string, sourceFile: string): SourceUnit {
        const placeholders = extractPlaceholders(sourceText);
        const sourceHash = computeHash(sourceText);
        const unitId = generateUnitId(keyPath, sourceFile);

        // Extract context if available
        const context = this.extractContextForKey(keyPath);

        return {
            unitId,
            keyPath,
            sourceText,
            sourceHash,
            context,
            placeholders,
            sourceFile,
            schemaVersion: this.schemaVersion,
        };
    }

    /**
     * Load context file if it exists
     */
    private async loadContextFile(contextFilePath: string): Promise<ContextFile | null> {
        try {
            if (!existsSync(contextFilePath)) {
                return null;
            }

            const content = readFileSync(contextFilePath, 'utf-8');
            const data = JSON.parse(content) as ContextFile;
            return data;
        } catch (error) {
            console.warn(`Failed to load context file ${contextFilePath}:`, error);
            return null;
        }
    }

    /**
     * Extract context for a specific key path
     */
    private extractContextForKey(keyPath: string): string | undefined {
        if (!this.contextData) {
            return undefined;
        }

        const keys = keyPath.split('.');
        let current: ContextFile | ContextMetadata = this.contextData;

        for (const key of keys) {
            if (!current || typeof current !== 'object') {
                return undefined;
            }

            if ('value' in current) {
                // We've reached a ContextMetadata node
                const meta = current as ContextMetadata;
                return meta.context;
            }

            // Type guard: current is ContextFile at this point
            const contextFile = current as ContextFile;
            const next = contextFile[key];

            if (!next) {
                return undefined;
            }

            current = next;
        }

        // Check if final node is ContextMetadata
        if (current && typeof current === 'object' && 'value' in current) {
            const meta = current as ContextMetadata;
            return meta.context;
        }

        return undefined;
    }
}
