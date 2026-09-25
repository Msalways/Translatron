/**
 * Deterministic repair workflow (Epic 006, F5/F6).
 *
 * A failed batch re-enters translation with the EXACT deterministic failure
 * attached — never a paraphrase. Budgets cap the loop (repair: 2 rounds by
 * default); exhaustion routes once to the reviewer hook when provided, else
 * records FAILED. Reviewer is escalation-only: the happy path never calls it.
 */
import type { TranslationWorkUnit } from '../core/domain.js';
import type { BatchTranslation } from '../runtime/runtime.js';
import { renderFailure, type UnitFailure, type ValidationError } from './issues.js';

/** Budgets mirror the runtime retry policy (defined here to avoid layering). */
export const REPAIR_BUDGETS = {
    repair: 2,
    review: 1,
} as const;

/** One unit plus its exact failures plus the current attempt number. */
export interface RepairRequest {
    unit: TranslationWorkUnit;
    errors: ValidationError[];
    attempt: number;
}

export interface FailedUnit {
    unitId: string;
    keyPath: string;
    errors: ValidationError[];
}

export interface RepairOutcome {
    accepted: BatchTranslation[];
    failed: FailedUnit[];
    /** Repair rounds performed. */
    repairs: number;
    /** Reviewer escalations performed (0 or 1). */
    reviews: number;
}

export interface RepairDeps {
    /**
     * Re-translate failing units with their exact errors attached.
     * Implementations prepend the failure text to the worker prompt.
     */
    retranslate: (requests: RepairRequest[]) => Promise<BatchTranslation[]>;
    /** Re-validate repaired output (typically validateBatchOutput). */
    validate: (translations: BatchTranslation[]) => UnitFailure[];
    /**
     * Escalation-only reviewer. Called at most once per batch, only when
     * failures remain after the repair budget. Return accepted fixes keyed
     * by unitId (re-validated by the caller loop); null/empty means give up.
     */
    requestReview?: (failures: UnitFailure[]) => Promise<Map<string, BatchTranslation>>;
    maxRepairs?: number;
}

/** Render the exact repair instruction attached to a retranslate request. */
export function renderRepairPrompt(request: RepairRequest): string {
    return [
        `Repair the translation for ${request.unit.keyPath} (attempt ${request.attempt}).`,
        `Previous output was rejected for exactly these reasons: ${renderFailure({ unitId: request.unit.unitId, keyPath: request.unit.keyPath, errors: request.errors })}.`,
        `Source: ${request.unit.sourceText}`,
        'Fix ONLY the listed problems. Preserve everything else, including placeholders, ICU structure, and markup.',
    ].join('\n');
}

export async function repairBatch(
    units: TranslationWorkUnit[],
    initialFailures: UnitFailure[],
    deps: RepairDeps
): Promise<RepairOutcome> {
    const maxRepairs = deps.maxRepairs ?? REPAIR_BUDGETS.repair;
    const byUnit = new Map(units.map((u) => [u.unitId, u]));
    const accepted = new Map<string, BatchTranslation>();
    let pending = new Map(initialFailures.map((f) => [f.unitId, f]));
    let repairs = 0;
    let reviews = 0;

    for (let attempt = 1; attempt <= maxRepairs && pending.size > 0; attempt++) {
        repairs += 1;
        const requests: RepairRequest[] = [];
        for (const failure of pending.values()) {
            const unit = byUnit.get(failure.unitId);
            if (unit === undefined) continue;
            requests.push({ unit, errors: failure.errors, attempt });
        }
        if (requests.length === 0) break;
        const retranslated = await deps.retranslate(requests);
        const acceptedIds = new Set(retranslated.map((t) => t.unitId));
        for (const translation of retranslated) {
            if (byUnit.has(translation.unitId)) accepted.set(translation.unitId, translation);
        }
        const stillFailing = deps.validate(retranslated.filter((t) => acceptedIds.has(t.unitId)));
        const next = new Map<string, UnitFailure>();
        for (const failure of stillFailing) {
            if (accepted.has(failure.unitId)) accepted.delete(failure.unitId);
            next.set(failure.unitId, failure);
        }
        // Units the worker dropped entirely stay pending with their last errors.
        for (const [unitId, failure] of pending) {
            if (!acceptedIds.has(unitId) && !next.has(unitId) && byUnit.has(unitId)) {
                next.set(unitId, failure);
            }
        }
        pending = next;
    }

    if (pending.size > 0 && deps.requestReview !== undefined && reviews < REPAIR_BUDGETS.review) {
        reviews += 1;
        const fixes = await deps.requestReview([...pending.values()]);
        for (const [unitId, translation] of fixes) {
            if (pending.has(unitId) && byUnit.has(unitId)) {
                accepted.set(unitId, translation);
                pending.delete(unitId);
            }
        }
        // Reviewer output is trusted per contract but re-checked by the caller
        // pipeline before any write (compiler validates everything pre-write).
    }

    return {
        accepted: [...accepted.values()],
        failed: [...pending.values()].map((f) => ({ unitId: f.unitId, keyPath: f.keyPath, errors: f.errors })),
        repairs,
        reviews,
    };
}
