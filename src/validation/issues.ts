/**
 * Shared validation issue shape (Epic 006).
 *
 * Validators are pure deterministic functions: source + candidate in,
 * issues out. The agent is never the sole validator — these decide
 * acceptability, and the repair flow (repair.ts) carries their exact
 * output back to the worker.
 */
import type { ValidationError } from '../types/index.js';

export type { ValidationError };

/** A single deterministic failure for one unit. */
export interface UnitFailure {
    unitId: string;
    keyPath: string;
    errors: ValidationError[];
}

/** True when no blocking issues were found. */
export function isClean(errors: ValidationError[]): boolean {
    return errors.length === 0;
}

/** Human-stable rendering of one failure ("Missing {count}"). */
export function renderFailure(failure: UnitFailure): string {
    return failure.errors.map((e) => e.message).join('; ');
}
