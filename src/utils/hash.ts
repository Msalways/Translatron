import { createHash } from 'crypto';

/**
 * Compute SHA-256 hash of content for change detection
 */
export function computeHash(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Compute context signature from context metadata
 */
export function computeContextSignature(context?: string): string | undefined {
    if (!context) return undefined;
    return createHash('sha256').update(context, 'utf8').digest('hex').substring(0, 16);
}

/**
 * Extract placeholders from a string
 * Supports common placeholder formats: {var}, {{var}}, %s, %d, $1, ${var}
 */
export function extractPlaceholders(text: string): string[] {
    const patterns = [
        /\{([^}]+)\}/g,           // {var}
        /\{\{([^}]+)\}\}/g,       // {{var}}
        /%[sdif]/g,               // %s, %d, %i, %f
        /\$\{([^}]+)\}/g,         // ${var}
        /\$\d+/g,                 // $1, $2, etc.
    ];

    const placeholders = new Set<string>();

    for (const pattern of patterns) {
        const matches = text.matchAll(pattern);
        for (const match of matches) {
            placeholders.add(match[0]);
        }
    }

    return Array.from(placeholders).sort();
}

/**
 * Generate a unique unit ID from key path and source file
 */
export function generateUnitId(keyPath: string, sourceFile: string): string {
    const combined = `${sourceFile}:${keyPath}`;
    return computeHash(combined).substring(0, 16);
}
