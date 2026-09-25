/**
 * Deterministic planner (Epic 002).
 *
 * Turns reconciler work units into an immutable `RunPlan`:
 *   group by (locale, skill fingerprint, glossary fingerprint, context class)
 *   → token-budget batching → deep-frozen plan.
 *
 * The plan is immutable for the run. Agents execute it; they never rewrite it.
 */
import type {
    AppliedSkill,
    ExecutionLimits,
    LanguagePlan,
    RunPlan,
    RunPolicy,
    TranslationWorkUnit,
} from './domain.js';

export interface BatchingOptions {
    /** Max units per batch (existing default: 20). */
    maxUnitsPerBatch: number;
    /** Max estimated tokens per batch (chars/4 heuristic). */
    maxTokensPerBatch: number;
}

export const DEFAULT_BATCHING: BatchingOptions = {
    maxUnitsPerBatch: 20,
    maxTokensPerBatch: 8000,
};

/** Rough token estimate: ~4 chars per token. */
export function estimateTokens(text: string): number {
    return Math.max(1, Math.ceil(text.length / 4));
}

/** Context class for grouping: explicit context or top key segment. */
export function contextClassOf(unit: TranslationWorkUnit): string {
    if (unit.contextFingerprint !== undefined) return `ctx:${unit.contextFingerprint}`;
    const top = unit.keyPath.split('.')[0];
    return `ns:${top.length > 0 ? top : unit.keyPath}`;
}

export interface PlanLanguageInput {
    locale: string;
    skills: AppliedSkill[];
    glossaryFingerprint?: string;
    units: TranslationWorkUnit[];
}

export interface BuildPlanInput {
    runId: string;
    languages: PlanLanguageInput[];
    limits: ExecutionLimits;
    policy: RunPolicy;
    batching?: BatchingOptions;
}

/** Deeply freeze a plan so agents cannot mutate it at runtime. */
export function freezePlan(plan: RunPlan): RunPlan {
    const seen = new Set<object>();
    const freeze = (value: unknown): void => {
        if (value === null || typeof value !== 'object' || seen.has(value)) return;
        seen.add(value);
        if (Array.isArray(value)) {
            for (const item of value) freeze(item);
        } else {
            for (const item of Object.values(value as Record<string, unknown>)) freeze(item);
        }
        Object.freeze(value);
    };
    freeze(plan);
    return plan;
}

function groupKey(unit: TranslationWorkUnit, glossaryFingerprint: string): string {
    return [
        unit.skillFingerprint ?? '-',
        glossaryFingerprint,
        contextClassOf(unit),
    ].join('|');
}

function batchGroup(units: TranslationWorkUnit[], batching: BatchingOptions): TranslationWorkUnit[][] {
    const batches: TranslationWorkUnit[][] = [];
    let current: TranslationWorkUnit[] = [];
    let tokens = 0;
    for (const unit of units) {
        const cost = estimateTokens(unit.sourceText);
        if (
            current.length > 0 &&
            (current.length >= batching.maxUnitsPerBatch || tokens + cost > batching.maxTokensPerBatch)
        ) {
            batches.push(current);
            current = [];
            tokens = 0;
        }
        current.push(unit);
        tokens += cost;
    }
    if (current.length > 0) batches.push(current);
    return batches;
}

/** Build a frozen `RunPlan` from per-locale work units. Deterministic. */
export function buildRunPlan(input: BuildPlanInput): RunPlan {
    const batching = input.batching ?? DEFAULT_BATCHING;
    const languages: LanguagePlan[] = [];
    let totalUnits = 0;

    for (const lang of input.languages) {
        const glossary = lang.glossaryFingerprint ?? '-';
        const groups = new Map<string, TranslationWorkUnit[]>();
        for (const unit of lang.units) {
            const key = groupKey(unit, glossary);
            const list = groups.get(key);
            if (list === undefined) groups.set(key, [unit]);
            else list.push(unit);
        }
        // Stable order: sort group keys so identical inputs → identical plans.
        const batches: TranslationWorkUnit[][] = [];
        for (const key of [...groups.keys()].sort()) {
            const group = groups.get(key);
            if (group === undefined) continue;
            batches.push(...batchGroup(group, batching));
        }
        totalUnits += lang.units.length;
        languages.push({
            locale: lang.locale,
            skills: [...lang.skills],
            batches,
        });
    }

    return freezePlan({
        runId: input.runId,
        languages,
        totalUnits,
        limits: { ...input.limits },
        policy: { ...input.policy },
    });
}
