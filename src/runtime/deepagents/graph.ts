/**
 * Programmatic parallel orchestration (Epic 008, E3).
 *
 * LangGraph owns the fan-out/fan-in topology; the LLM never invents the
 * execution graph. The supervisor step returns one `Send` per planned
 * language — built deterministically from the immutable `RunPlan`
 * (`planLanguageSends`), never from model output. Language branches run
 * concurrently, gated by the code-enforced `ConcurrencyScheduler`, and the
 * fan-in reducer aggregates per-language summaries for the supervisor.
 */
import { Annotation, END, Send, START, StateGraph } from '@langchain/langgraph';
import type { LanguagePlan, RunPlan, TranslationWorkUnit } from '../../core/domain.js';
import type { BatchTranslation, LanguageSummary, RuntimeContext, RuntimeEvent } from '../runtime.js';
import { renderFailure, type UnitFailure } from '../../validation/issues.js';
import { validateBatchOutput } from '../../validation/batch.js';
import { repairBatch, type RepairRequest } from '../../validation/repair.js';
import { ConcurrencyScheduler, providerOfModel } from './scheduler.js';
import type { LanguageWorker } from './worker.js';

const OrchestrationAnnotation = Annotation.Root({
    locales: Annotation<string[]>({
        reducer: (left, right) => left.concat(right),
        default: () => [],
    }),
    summaries: Annotation<LanguageSummary[]>({
        reducer: (left, right) => left.concat(right),
        default: () => [],
    }),
});

export interface GraphRunDeps {
    createWorker: (locale: string, context: RuntimeContext) => LanguageWorker | Promise<LanguageWorker>;
    scheduler: ConcurrencyScheduler;
    emit?: (event: RuntimeEvent) => void;
    /** Escalation-only reviewer, forwarded to the repair flow. */
    reviewer?: (failures: UnitFailure[]) => Promise<Map<string, BatchTranslation>>;
    maxRepairs?: number;
}

export interface GraphRunResult {
    summaries: LanguageSummary[];
}

/**
 * Deterministic dispatch list: every planned locale, in plan order.
 * Pure function of the plan — no model output involved (SC-003).
 */
export function planLanguageSends(plan: RunPlan): string[] {
    return plan.languages.map((language) => language.locale);
}

interface BatchOutcome {
    accepted: BatchTranslation[];
    failed: UnitFailure[];
    repairs: number;
    reviews: number;
}

async function executeBatch(args: {
    worker: LanguageWorker;
    scheduler: ConcurrencyScheduler;
    provider: string;
    locale: string;
    batchIndex: number;
    units: TranslationWorkUnit[];
    maxRepairs: number;
    reviewer?: (failures: UnitFailure[]) => Promise<Map<string, BatchTranslation>>;
    emit?: (event: RuntimeEvent) => void;
}): Promise<BatchOutcome> {
    const { worker, scheduler, provider, locale, batchIndex, units, maxRepairs, reviewer, emit } = args;
    const unitIds = units.map((u) => u.unitId);
    emit?.({ type: 'batch-started', locale, batchIndex, unitIds });
    // A crashed batch fails all its units; the language (not the run) absorbs it.
    let translations: BatchTranslation[];
    try {
        translations = await scheduler.withModelCall(provider, () => worker.translateBatch(units));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            accepted: [],
            failed: units.map((unit) => ({
                unitId: unit.unitId,
                keyPath: unit.keyPath,
                errors: [{ type: 'WORKER_ERROR', message, field: unit.unitId }],
            })),
            repairs: 0,
            reviews: 0,
        };
    }
    const failures = validateBatchOutput(units, translations);
    if (failures.length === 0) {
        emit?.({ type: 'batch-completed', locale, batchIndex, translations });
        return { accepted: translations, failed: [], repairs: 0, reviews: 0 };
    }
    const outcome = await repairBatch(units, failures, {
        retranslate: (requests: RepairRequest[]) =>
            scheduler.withModelCall(provider, () =>
                worker.translateBatch(
                    requests.map((request) => request.unit),
                    requests.map((request) => ({
                        unitId: request.unit.unitId,
                        errors: renderFailure({
                            unitId: request.unit.unitId,
                            keyPath: request.unit.keyPath,
                            errors: request.errors,
                        }),
                    }))
                )
            ),
        validate: (retranslated) => validateBatchOutput(units, retranslated),
        ...(reviewer !== undefined ? { requestReview: reviewer } : {}),
        maxRepairs,
    });
    emit?.({ type: 'batch-completed', locale, batchIndex, translations: outcome.accepted });
    return { accepted: outcome.accepted, failed: outcome.failed, repairs: outcome.repairs, reviews: outcome.reviews };
}

async function executeLanguage(args: {
    language: LanguagePlan;
    context: RuntimeContext;
    deps: GraphRunDeps;
    provider: string;
}): Promise<LanguageSummary> {
    const { language, context, deps, provider } = args;
    const { scheduler, emit } = deps;
    const locale = language.locale;
    emit?.({ type: 'language-started', locale });
    try {
        const worker = await deps.createWorker(locale, context);
        const maxRepairs = deps.maxRepairs ?? context.maxRepairAttempts;
        const batchOutcomes = await Promise.all(
            language.batches.map((units, batchIndex) =>
                scheduler.withBatchSlot(locale, () =>
                    executeBatch({
                        worker,
                        scheduler,
                        provider,
                        locale,
                        batchIndex,
                        units,
                        maxRepairs,
                        ...(deps.reviewer !== undefined ? { reviewer: deps.reviewer } : {}),
                        ...(emit !== undefined ? { emit } : {}),
                    })
                )
            )
        );
        const accepted = batchOutcomes.flatMap((outcome) => outcome.accepted);
        const failed = batchOutcomes.flatMap((outcome) => outcome.failed);
        const repairs = batchOutcomes.reduce((sum, outcome) => sum + outcome.repairs, 0);
        const reviews = batchOutcomes.reduce((sum, outcome) => sum + outcome.reviews, 0);
        if (failed.length > 0) {
            // Surface the first underlying cause (crash message or exact
            // validation failure), not a generic count.
            const firstCause = failed[0]?.errors[0]?.message;
            const summary: LanguageSummary = {
                locale,
                status: 'failed',
                translated: accepted.length,
                failed: failed.length,
                batches: language.batches.length,
                repairs,
                reviews,
                error: firstCause ?? `${failed.length} unit(s) failed`,
            };
            emit?.({ type: 'language-failed', locale, failed: failed.length, error: summary.error ?? 'batch failures' });
            return summary;
        }
        emit?.({ type: 'language-completed', locale, translated: accepted.length });
        return {
            locale,
            status: 'complete',
            translated: accepted.length,
            failed: 0,
            batches: language.batches.length,
            repairs,
            reviews,
        };
    } catch (error) {
        // Worker crash mid-language: FAILED, other languages unaffected.
        const failed = language.batches.flat().length;
        const message = error instanceof Error ? error.message : String(error);
        emit?.({ type: 'language-failed', locale, failed, error: message });
        return {
            locale,
            status: 'failed',
            translated: 0,
            failed,
            batches: language.batches.length,
            repairs: 0,
            reviews: 0,
            error: message,
        };
    }
}

/**
 * Single deterministic tool the supervisor exposes: fan out the planned
 * language jobs through LangGraph and aggregate summaries (FR-001, E6).
 * Concurrency comes from `deps.scheduler`, built from the plan limits.
 */
export async function dispatchLanguageJobs(
    plan: RunPlan,
    context: RuntimeContext,
    deps: GraphRunDeps
): Promise<GraphRunResult> {
    const provider = providerOfModel(context.model);
    const planByLocale = new Map(plan.languages.map((language) => [language.locale, language]));

    const graph = new StateGraph(OrchestrationAnnotation)
        .addNode('language_worker', async (payload: { locale: string }) => {
            const language = planByLocale.get(payload.locale);
            if (language === undefined) {
                throw new Error(`No plan for dispatched locale ${payload.locale}`);
            }
            // The language semaphore gates here, so engine-level parallelism
            // can never exceed maxLanguages regardless of LangGraph internals.
            const summary = await deps.scheduler.withLanguageSlot(() =>
                executeLanguage({ language, context, deps, provider })
            );
            return { summaries: [summary] };
        })
        .addConditionalEdges(START, (state) =>
            state.locales.map((locale) => new Send('language_worker', { locale }))
        )
        .addEdge('language_worker', END)
        .compile();

    const finalState = await graph.invoke({ locales: planLanguageSends(plan), summaries: [] });
    return { summaries: finalState.summaries };
}
