/**
 * Supervisor orchestration (Epic 005 sequential path + Epic 008 parallel path).
 *
 * The supervisor is one Deep Agent that never personally translates: it
 * dispatches independent language jobs through `dispatch_language_jobs`,
 * observes summarized outcomes, handles only exceptions, and finalizes.
 * Concurrency topology is code (LangGraph + semaphores), never model output.
 */
import type { RunPlan } from '../../core/domain.js';
import { freezePlan } from '../../core/planner.js';
import type {
    BatchTranslation,
    LanguageSummary,
    RunResult,
    RunStatus,
    RuntimeContext,
    RuntimeEvent,
} from '../runtime.js';
import { dispatchLanguageJobs, planLanguageSends } from './graph.js';
import { ConcurrencyScheduler } from './scheduler.js';
import type { UnitFailure } from '../../validation/issues.js';
import { createLanguageWorker, type LanguageWorker } from './worker.js';
import type { TranslationToolBackend } from './tools.js';

export interface SupervisorDeps {
    createWorker?: (locale: string, context: RuntimeContext) => LanguageWorker | Promise<LanguageWorker>;
    backend?: TranslationToolBackend;
    /** Schedulers/limits for the parallel path (defaults from plan.limits). */
    scheduler?: ConcurrencyScheduler;
    /** Escalation-only reviewer, forwarded to the repair flow. */
    reviewer?: (failures: UnitFailure[]) => Promise<Map<string, BatchTranslation>>;
    maxRepairs?: number;
}

/**
 * Constrained supervisor tool surface (FR-002). The supervisor reasons
 * about exceptions through these — it cannot invent graph topology,
 * write files, or touch the registry.
 */
export const SUPERVISOR_TOOL_NAMES = [
    'dispatch_language_jobs',
    'inspect_language_failure',
    'retry_language_batch',
    'request_repair',
    'request_review',
    'finalize_run',
] as const;

/** Per-language outcome: a summary, never every translation (E6). */
export type { LanguageSummary, RunResult, RunStatus };

/**
 * Fan-in aggregator (E6): combine structured per-language summaries.
 * Green languages persist even when siblings fail (partial success).
 */
export function aggregateResults(runId: string, summaries: LanguageSummary[]): RunResult {
    const translated = summaries.reduce((sum, summary) => sum + summary.translated, 0);
    const failed = summaries.reduce((sum, summary) => sum + summary.failed, 0);
    const failedLanguages = summaries.filter((summary) => summary.status === 'failed').length;
    const status: RunStatus =
        failedLanguages === 0 ? 'complete' : failedLanguages < summaries.length ? 'partial_success' : 'failed';
    return { runId, status, summaries: [...summaries], translated, failed };
}

/**
 * Narrow an immutable plan to one locale for `retry --lang` (FR-005).
 * Returns null when the locale is not part of the plan.
 */
export function filterPlanForRetry(plan: RunPlan, locale: string): RunPlan | null {
    const language = plan.languages.find((entry) => entry.locale === locale);
    if (language === undefined) return null;
    return freezePlan({
        runId: `${plan.runId}-retry-${locale}`,
        languages: [
            {
                locale: language.locale,
                skills: [...language.skills],
                batches: language.batches.map((batch) => [...batch]),
            },
        ],
        totalUnits: language.batches.flat().length,
        limits: { ...plan.limits },
        policy: { ...plan.policy },
    });
}

const EMPTY_BACKEND: TranslationToolBackend = {
    lookupMemory: () => [],
    lookupGlossaryTerm: () => null,
    getKeyContext: () => null,
    getRelatedTranslations: () => [],
    getSkillResource: () => null,
};

function defaultCreateWorker(context: RuntimeContext, backend: TranslationToolBackend) {
    return async (locale: string) => {
        const material = context.materials.find((m) => m.locale === locale);
        return createLanguageWorker({
            locale,
            sourceLocale: context.sourceLocale,
            skills: (material?.skills ?? []).map((s) => ({ id: s.id, scope: 'language', fingerprint: '', content: s.content })),
            glossary: material?.glossary ?? {},
            examples: material?.examples ?? [],
            model: context.model,
            provider: context.provider,
            backend,
        });
    };
}

export async function* runLanguagesSequential(
    plan: RunPlan,
    context: RuntimeContext,
    deps: SupervisorDeps = {}
): AsyncIterable<RuntimeEvent> {
    yield { type: 'run-started', runId: plan.runId, languages: plan.languages.map((l) => l.locale) };
    const backend = deps.backend ?? context.toolBackend ?? EMPTY_BACKEND;
    const createWorker = deps.createWorker ?? defaultCreateWorker(context, backend);
    for (const language of plan.languages) {
        yield { type: 'language-started', locale: language.locale };
        const worker = await createWorker(language.locale, context);
        let translated = 0;
        try {
            for (let batchIndex = 0; batchIndex < language.batches.length; batchIndex++) {
                const batch = language.batches[batchIndex];
                const unitIds = batch.map((u) => u.unitId);
                yield { type: 'batch-started', locale: language.locale, batchIndex, unitIds };
                const translations: BatchTranslation[] = await worker.translateBatch(batch);
                translated += translations.length;
                yield { type: 'batch-completed', locale: language.locale, batchIndex, translations };
            }
            yield { type: 'language-completed', locale: language.locale, translated };
        } catch (error) {
            const failed = language.batches.flat().length - translated;
            yield {
                type: 'language-failed',
                locale: language.locale,
                failed,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
    yield { type: 'run-completed', runId: plan.runId };
}

/** Unbounded event channel: producers never block, consumer drains live. */
class EventQueue<T> {
    private items: T[] = [];
    private takers: Array<(result: IteratorResult<T>) => void> = [];
    private closed = false;

    push(value: T): void {
        const taker = this.takers.shift();
        if (taker !== undefined) taker({ value, done: false });
        else this.items.push(value);
    }

    close(): void {
        this.closed = true;
        for (const taker of this.takers.splice(0)) taker({ value: undefined, done: true });
    }

    async *drain(): AsyncIterable<T> {
        for (;;) {
            const next = this.items.shift();
            if (next !== undefined) {
                yield next;
                continue;
            }
            if (this.closed) return;
            const result = await new Promise<IteratorResult<T>>((resolve) => {
                this.takers.push(resolve);
            });
            if (result.done === true) return;
            yield result.value;
        }
    }
}

/**
 * Parallel supervised execution (Epic 008): deterministic LangGraph fan-out
 * via `dispatch_language_jobs`, code-enforced semaphores, fan-in summaries,
 * crash isolation per language. Events stream live as branches progress.
 */
export async function* runLanguagesParallel(
    plan: RunPlan,
    context: RuntimeContext,
    deps: SupervisorDeps = {}
): AsyncIterable<RuntimeEvent> {
    yield { type: 'run-started', runId: plan.runId, languages: planLanguageSends(plan) };
    const queue = new EventQueue<RuntimeEvent>();
    const emit = (event: RuntimeEvent): void => queue.push(event);
    const scheduler = deps.scheduler ?? ConcurrencyScheduler.fromExecutionLimits(plan.limits);
    const invocation = dispatchLanguageJobs(plan, context, {
        createWorker: deps.createWorker ?? defaultCreateWorker(context, deps.backend ?? context.toolBackend ?? EMPTY_BACKEND),
        scheduler,
        emit,
        ...(deps.reviewer !== undefined ? { reviewer: deps.reviewer } : {}),
        ...(deps.maxRepairs !== undefined ? { maxRepairs: deps.maxRepairs } : {}),
    });
    invocation.then(
        () => queue.close(),
        () => queue.close()
    );
    yield* queue.drain();
    // Throws if the graph itself failed; summaries arrive via events/state.
    const { summaries } = await invocation;
    void aggregateResults(plan.runId, summaries);
    yield { type: 'run-completed', runId: plan.runId };
}
