import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname } from 'path';
import { mkdirSync } from 'fs';
import { type ContextFile, type ContextMetadata } from '../types/index';

/**
 * Context file generator utility
 * Generates context file templates from source files
 */
export class ContextGenerator {
    /**
     * Generate context file template from source JSON file
     */
    static async generateContextTemplate(
        sourceFilePath: string,
        outputPath: string,
        merge = false
    ): Promise<void> {
        // Read source file
        const sourceContent = readFileSync(sourceFilePath, 'utf-8');
        const sourceData = JSON.parse(sourceContent);

        // Generate context structure
        const contextData = this.sourceToContextStructure(sourceData, []);

        // Merge with existing if requested
        let finalContext = contextData;
        if (merge && existsSync(outputPath)) {
            const existingContent = readFileSync(outputPath, 'utf-8');
            const existingData = JSON.parse(existingContent) as ContextFile;
            finalContext = this.mergeContextFiles(existingData, contextData);
        }

        // Write context file
        const dir = dirname(outputPath);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }

        writeFileSync(outputPath, JSON.stringify(finalContext, null, 2), 'utf-8');
    }

    /**
     * Convert source data to context file structure
     */
    static sourceToContextStructure(sourceData: any, keyPath: string[]): ContextFile {
        const result: ContextFile = {};

        if (typeof sourceData === 'string') {
            // This is a leaf node - create context metadata
            return {
                value: sourceData,
                context: '',
            } as unknown as ContextFile;
        } else if (Array.isArray(sourceData)) {
            // Handle arrays
            sourceData.forEach((item, index) => {
                result[index.toString()] = this.sourceToContextStructure(item, [...keyPath, index.toString()]);
            });
        } else if (sourceData && typeof sourceData === 'object') {
            // Handle nested objects
            for (const [key, value] of Object.entries(sourceData)) {
                if (typeof value === 'string') {
                    // Leaf node - create context metadata
                    result[key] = {
                        value: value,
                        context: '',
                    } as ContextMetadata;
                } else {
                    // Nested object - recurse
                    result[key] = this.sourceToContextStructure(value, [...keyPath, key]);
                }
            }
        }

        return result;
    }

    /**
     * Merge existing context file with newly generated one
     * Preserves existing context values, adds new keys, removes deleted keys
     */
    static mergeContextFiles(existing: ContextFile, generated: ContextFile): ContextFile {
        const result: ContextFile = {};

        // Add all keys from generated (this represents current source structure)
        for (const [key, value] of Object.entries(generated)) {
            if (this.isContextMetadata(value)) {
                // This is a leaf node
                if (existing[key] && this.isContextMetadata(existing[key])) {
                    // Preserve existing context if available
                    const existingMeta = existing[key] as ContextMetadata;
                    result[key] = {
                        value: value.value,
                        context: existingMeta.context || value.context,
                        notes: existingMeta.notes,
                        maxLength: existingMeta.maxLength,
                        tone: existingMeta.tone,
                    } as ContextMetadata;
                } else {
                    // New key, use generated template
                    result[key] = value;
                }
            } else {
                // This is a nested object
                if (existing[key] && !this.isContextMetadata(existing[key])) {
                    // Merge nested objects
                    result[key] = this.mergeContextFiles(
                        existing[key] as ContextFile,
                        value as ContextFile
                    );
                } else {
                    // New nested object, use generated
                    result[key] = value;
                }
            }
        }

        return result;
    }

    /**
     * Validate context file against source file
     * Returns list of validation errors/warnings
     */
    static validateContextFile(
        sourceFilePath: string,
        contextFilePath: string
    ): { errors: string[]; warnings: string[] } {
        const errors: string[] = [];
        const warnings: string[] = [];

        try {
            const sourceContent = readFileSync(sourceFilePath, 'utf-8');
            const sourceData = JSON.parse(sourceContent);

            const contextContent = readFileSync(contextFilePath, 'utf-8');
            const contextData = JSON.parse(contextContent) as ContextFile;

            this.validateStructure(sourceData, contextData, [], errors, warnings);
        } catch (error) {
            errors.push(`Failed to validate: ${error instanceof Error ? error.message : String(error)}`);
        }

        return { errors, warnings };
    }

    /**
     * Recursively validate context structure matches source
     */
    private static validateStructure(
        source: any,
        context: ContextFile | ContextMetadata,
        keyPath: string[],
        errors: string[],
        warnings: string[]
    ): void {
        const currentPath = keyPath.join('.');

        if (typeof source === 'string') {
            // Source is a leaf node
            if (!this.isContextMetadata(context)) {
                errors.push(`${currentPath}: Expected context metadata, got nested object`);
                return;
            }

            const meta = context as ContextMetadata;
            if (meta.value !== source) {
                warnings.push(`${currentPath}: Context value "${meta.value}" doesn't match source "${source}"`);
            }
        } else if (Array.isArray(source)) {
            // Handle arrays
            source.forEach((item, index) => {
                const key = index.toString();
                const contextFile = context as ContextFile;
                if (contextFile[key]) {
                    this.validateStructure(item, contextFile[key], [...keyPath, key], errors, warnings);
                } else {
                    warnings.push(`${currentPath}.${key}: Missing in context file`);
                }
            });
        } else if (source && typeof source === 'object') {
            // Handle nested objects
            const contextFile = context as ContextFile;
            for (const [key, value] of Object.entries(source)) {
                if (contextFile[key]) {
                    this.validateStructure(value, contextFile[key], [...keyPath, key], errors, warnings);
                } else {
                    warnings.push(`${currentPath ? currentPath + '.' : ''}${key}: Missing in context file`);
                }
            }

            // Check for extra keys in context
            for (const key of Object.keys(contextFile)) {
                if (!(key in source)) {
                    warnings.push(`${currentPath ? currentPath + '.' : ''}${key}: Extra key in context file (not in source)`);
                }
            }
        }
    }

    /**
     * Type guard to check if value is ContextMetadata
     */
    private static isContextMetadata(value: any): value is ContextMetadata {
        return value && typeof value === 'object' && 'value' in value;
    }
}
