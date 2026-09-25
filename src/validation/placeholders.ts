/**
 * Placeholder preservation validator (Epic 006, F2).
 *
 * Source and target must contain exactly the same placeholder multiset
 * (order-insensitive). Reports the concrete missing/unexpected names so the
 * repair worker receives an exact failure, not a paraphrase.
 */
import { extractPlaceholders } from '../utils/hash.js';
import type { ValidationError } from './issues.js';

export interface PlaceholderCheck {
    sourceText: string;
    translatedText: string;
    keyPath: string;
}

export function validatePlaceholders(check: PlaceholderCheck): ValidationError[] {
    const expected = extractPlaceholders(check.sourceText);
    const actual = new Set(extractPlaceholders(check.translatedText));
    const errors: ValidationError[] = [];
    for (const placeholder of expected) {
        if (!actual.has(placeholder)) {
            errors.push({
                type: 'PLACEHOLDER_MISMATCH',
                message: `Missing ${placeholder} in ${check.keyPath}`,
                field: check.keyPath,
            });
        }
    }
    for (const placeholder of actual) {
        if (!expected.includes(placeholder)) {
            errors.push({
                type: 'PLACEHOLDER_MISMATCH',
                message: `Unexpected ${placeholder} in ${check.keyPath}`,
                field: check.keyPath,
            });
        }
    }
    return errors;
}
