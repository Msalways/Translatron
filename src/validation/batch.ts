/**
 * Batch validation composer (Epic 006).
 *
 * Runs the v3 validators over one worker batch and returns per-unit
 * failures. Empty results are always failures; placeholders always apply;
 * ICU/markup apply when the source uses them. Length/leakage/brand rules
 * remain in the legacy pipeline for the v2 compiler path — the unified
 * pipeline lands with the v3 compiler (Epic 008/010).
 */
import type { TranslationWorkUnit } from '../core/domain.js';
import type { BatchTranslation } from '../runtime/runtime.js';
import type { UnitFailure, ValidationError } from './issues.js';
import { containsIcu, validateIcu } from './icu.js';
import { extractTagNames, validateMarkup } from './markup.js';
import { validatePlaceholders } from './placeholders.js';
import { validateWorkerOutput } from './result.js';

export function validateBatchOutput(
    units: TranslationWorkUnit[],
    translations: BatchTranslation[]
): UnitFailure[] {
    const byUnit = new Map(units.map((u) => [u.unitId, u]));
    const byTranslation = new Map(translations.map((t) => [t.unitId, t]));
    const failures: UnitFailure[] = [];
    const push = (unitId: string, errors: ValidationError[]) => {
        if (errors.length === 0) return;
        const unit = byUnit.get(unitId);
        failures.push({ unitId, keyPath: unit?.keyPath ?? '(unknown)', errors });
    };

    // Structural coverage first: missing/duplicate/unknown/empty.
    const structural = validateWorkerOutput(units, translations);
    const structuralByUnit = new Map<string, ValidationError[]>();
    for (const error of structural) {
        const list = structuralByUnit.get(error.field ?? '') ?? [];
        list.push(error);
        structuralByUnit.set(error.field ?? '', list);
    }

    for (const unit of units) {
        const errors: ValidationError[] = [...(structuralByUnit.get(unit.unitId) ?? [])];
        const translation = byTranslation.get(unit.unitId);
        if (translation === undefined || translation.text.length === 0) {
            push(unit.unitId, errors);
            continue;
        }
        errors.push(
            ...validatePlaceholders({ sourceText: unit.sourceText, translatedText: translation.text, keyPath: unit.keyPath })
        );
        if (containsIcu(unit.sourceText) || containsIcu(translation.text)) {
            errors.push(
                ...validateIcu({ sourceText: unit.sourceText, translatedText: translation.text, keyPath: unit.keyPath })
            );
        }
        if (extractTagNames(unit.sourceText).length > 0) {
            errors.push(
                ...validateMarkup({ sourceText: unit.sourceText, translatedText: translation.text, keyPath: unit.keyPath })
            );
        }
        push(unit.unitId, errors);
    }

    // Offender IDs with no matching unit (unknown/duplicate of unknown).
    for (const [unitId, errors] of structuralByUnit) {
        if (!byUnit.has(unitId)) push(unitId, errors);
    }

    return failures;
}
