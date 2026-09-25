/**
 * Structured-result validator (Epic 006, F1).
 *
 * Verifies the worker's unitId-keyed output before anything touches files:
 * all requested IDs returned exactly once, no unknown IDs, every value a
 * non-empty string. Positional arrays never reach this layer (rejected in
 * worker response extraction).
 */
import type { TranslationWorkUnit } from '../core/domain.js';
import type { BatchTranslation } from '../runtime/runtime.js';
import type { ValidationError } from './issues.js';

export function validateWorkerOutput(
    units: TranslationWorkUnit[],
    translations: BatchTranslation[]
): ValidationError[] {
    const errors: ValidationError[] = [];
    const expected = new Map(units.map((u) => [u.unitId, u]));
    const seen = new Set<string>();

    for (const translation of translations) {
        if (seen.has(translation.unitId)) {
            errors.push({
                type: 'DUPLICATE_ID',
                message: `Duplicate translation for unit ${translation.unitId}`,
                field: translation.unitId,
            });
            continue;
        }
        seen.add(translation.unitId);
        const unit = expected.get(translation.unitId);
        if (unit === undefined) {
            errors.push({
                type: 'UNKNOWN_ID',
                message: `Translation for unknown unit ${translation.unitId}`,
                field: translation.unitId,
            });
            continue;
        }
        if (typeof translation.text !== 'string' || translation.text.length === 0) {
            if (unit.sourceText.length > 0) {
                errors.push({
                    type: 'EMPTY_TRANSLATION',
                    message: `Empty translation for ${unit.keyPath} (${translation.unitId})`,
                    field: translation.unitId,
                });
            }
        }
    }

    for (const unit of units) {
        if (!seen.has(unit.unitId)) {
            errors.push({
                type: 'MISSING_ID',
                message: `Missing translation for ${unit.keyPath} (${unit.unitId})`,
                field: unit.unitId,
            });
        }
    }

    return errors;
}
