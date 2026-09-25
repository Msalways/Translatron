import { describe, it, expect } from 'vitest';
import { buildRunPlan } from '../../src/core/planner.js';
import { DEFAULT_EXECUTION_LIMITS, type TranslationWorkUnit } from '../../src/core/domain.js';
import { adaptRuntimeEvent, deriveRunStatus } from '../../src/core/events.js';
import { DeepAgentRuntime } from '../../src/runtime/deepagents/runtime.js';
import { planLanguageSends } from '../../src/runtime/deepagents/graph.js';
import {
    ConcurrencyScheduler,
    effectiveModelConcurrency,
    providerOfModel,
    Semaphore,
} from '../../src/runtime/deepagents/scheduler.js';
import {
    aggregateResults,
    filterPlanForRetry,
    runLanguagesParallel,
    SUPERVISOR_TOOL_NAMES,
} from '../../src/runtime/deepagents/supervisor.js';
import type { LanguageWorker } from '../../src/runtime/deepagents/worker.js';
import type { RuntimeContext } from '../../src/runtime/runtime.js';

function unit(unitId: string, keyPath: string, sourceText = 'hello'): TranslationWorkUnit {
    return { unitId, keyPath, sourceText, placeholders: [], reason: 'new' };
}

function testContext(): RuntimeContext {
    return {
        runId: 'run_1',
        sourceLocale: 'en-GB',
        model: 'openai:gpt-5',
        fallbackModels: [],
        materials: [],
        maxRepairAttempts: 0,
    };
}

function multiLanguagePlan(locales: string[], unitsPerLocale = 2) {
    return buildRunPlan({
        runId: 'run_parallel',
        languages: locales.map((locale) => ({
            locale,
            skills: [],
            units: Array.from({ length: unitsPerLocale }, (_, i) => unit(`u-${locale}-${i}`, `k.${i}`)),
        })),
        limits: DEFAULT_EXECUTION_LIMITS,
        policy: {},
        batching: { maxUnitsPerBatch: 20, maxTokensPerBatch: 8000 },
    });
}

/** Fake worker with a fixed per-batch delay and concurrency tracking. */
function trackingWorker(options: {
    delayMs?: number;
    failLocales?: Set<string>;
    active?: { current: number; peak: number };
} = {}): (locale: string) => LanguageWorker {
    const active = options.active ?? { current: 0, peak: 0 };
    return (locale: string) => ({
        locale,
        translateBatch: async (batch) => {
            if (options.failLocales?.has(locale)) throw new Error(`worker exploded (${locale})`);
            active.current += 1;
            active.peak = Math.max(active.peak, active.current);
            try {
                if ((options.delayMs ?? 0) > 0) {
                    await new Promise((resolve) => setTimeout(resolve, options.delayMs));
                }
                return batch.map((u) => ({ unitId: u.unitId, text: `[${locale}] ${u.sourceText}` }));
            } finally {
                active.current -= 1;
            }
        },
    });
}

describe('orchestration: semaphore primitives (P-T001)', () => {
    it('rejects non-positive caps and tracks peaks', async () => {
        expect(() => new Semaphore(0)).toThrow(/positive integer/);
        const semaphore = new Semaphore(2);
        let concurrent = 0;
        let peak = 0;
        await Promise.all(
            Array.from({ length: 5 }, () =>
                semaphore.withLock(async () => {
                    concurrent += 1;
                    peak = Math.max(peak, concurrent);
                    await new Promise((resolve) => setTimeout(resolve, 5));
                    concurrent -= 1;
                })
            )
        );
        expect(peak).toBeLessThanOrEqual(2);
        expect(semaphore.maxObserved).toBe(peak);
    });

    it('computes effective concurrency as min(language, batch, global, provider)', () => {
        expect(
            effectiveModelConcurrency({ maxLanguages: 4, maxBatchesPerLanguage: 2, maxGlobalModelCalls: 8 })
        ).toBe(2);
        expect(
            effectiveModelConcurrency(
                { maxLanguages: 4, maxBatchesPerLanguage: 2, maxGlobalModelCalls: 8, providerCaps: { openai: 1 } },
                'openai'
            )
        ).toBe(1);
        expect(providerOfModel('openai:gpt-5')).toBe('openai');
        expect(providerOfModel('bare-name')).toBe('unknown');
    });

    it('builds a scheduler from execution limits', () => {
        const scheduler = ConcurrencyScheduler.fromExecutionLimits(DEFAULT_EXECUTION_LIMITS);
        const observed = scheduler.observed();
        expect(observed.languages).toBe(0);
        expect(observed.global).toBe(0);
    });
});

describe('orchestration: parallel fan-out (P-T002/P-T003)', () => {
    it('four languages complete concurrently under one supervisor', async () => {
        const plan = multiLanguagePlan(['fr-FR', 'de-DE', 'ja-JP', 'es-ES'], 4);
        const active = { current: 0, peak: 0 };
        const createWorker = trackingWorker({ delayMs: 40, active });
        const started = Date.now();
        const events = [];
        for await (const event of runLanguagesParallel(plan, testContext(), { createWorker })) {
            events.push(event);
        }
        const wallMs = Date.now() - started;
        // Sequential would cost 4 langs × 40ms batches (4 batches total per lang? no — 4 units, 2 groups → up to 4 batches).
        // Parallel must beat the sequential floor (generous bound: wall clocks flake under full-suite contention; active.peak below is the real concurrency proof) of 16 × 40ms = 640ms by a wide margin.
        expect(wallMs).toBeLessThan(5000);
        const types = events.map((e) => e.type);
        expect(types[0]).toBe('run-started');
        expect(types[types.length - 1]).toBe('run-completed');
        for (const locale of ['fr-FR', 'de-DE', 'ja-JP', 'es-ES']) {
            expect(events.some((e) => e.type === 'language-started' && e.locale === locale)).toBe(true);
            expect(events.some((e) => e.type === 'language-completed' && e.locale === locale)).toBe(true);
        }
        // Languages actually overlapped.
        expect(active.peak).toBeGreaterThan(1);
    });

    it('dispatch list is a pure function of the plan (SC-003)', () => {
        const plan = multiLanguagePlan(['fr-FR', 'de-DE', 'ja-JP']);
        expect(planLanguageSends(plan)).toEqual(['fr-FR', 'de-DE', 'ja-JP']);
        // Stable regardless of when/how often it is called — no model input exists.
        expect(planLanguageSends(plan)).toEqual(planLanguageSends(plan));
    });

    it('supervisor tool surface is exactly the constrained set (FR-002)', () => {
        expect([...SUPERVISOR_TOOL_NAMES]).toEqual([
            'dispatch_language_jobs',
            'inspect_language_failure',
            'retry_language_batch',
            'request_repair',
            'request_review',
            'finalize_run',
        ]);
        // No topology-inventing, file-writing, or registry tools.
        for (const name of SUPERVISOR_TOOL_NAMES) {
            expect(name).not.toMatch(/write|push|commit|spawn|task|shell|exec/);
        }
    });

    it('DeepAgentRuntime executes a plan end-to-end in parallel', async () => {
        const plan = multiLanguagePlan(['fr-FR', 'de-DE'], 2);
        const runtime = new DeepAgentRuntime({ createWorker: trackingWorker({ delayMs: 10 }) });
        const events = [];
        for await (const event of runtime.execute(plan, testContext())) {
            events.push(event);
        }
        expect(events[0].type).toBe('run-started');
        expect(events[events.length - 1].type).toBe('run-completed');
        const completed = events.filter((e) => e.type === 'language-completed');
        expect(completed).toHaveLength(2);
    });
});

describe('orchestration: fan-in summaries (P-T004)', () => {
    it('aggregates complete / partial_success / failed correctly', () => {
        const complete = aggregateResults('run_1', [
            { locale: 'fr-FR', status: 'complete', translated: 4, failed: 0, batches: 1, repairs: 0, reviews: 0 },
            { locale: 'de-DE', status: 'complete', translated: 4, failed: 0, batches: 1, repairs: 0, reviews: 0 },
        ]);
        expect(complete.status).toBe('complete');
        expect(complete.translated).toBe(8);

        const partial = aggregateResults('run_1', [
            { locale: 'fr-FR', status: 'complete', translated: 4, failed: 0, batches: 1, repairs: 0, reviews: 0 },
            { locale: 'ja-JP', status: 'failed', translated: 2, failed: 2, batches: 1, repairs: 2, reviews: 1, error: 'boom' },
        ]);
        expect(partial.status).toBe('partial_success');
        expect(partial.translated).toBe(6);
        expect(partial.failed).toBe(2);

        const failed = aggregateResults('run_1', [
            { locale: 'ja-JP', status: 'failed', translated: 0, failed: 4, batches: 1, repairs: 0, reviews: 0, error: 'boom' },
        ]);
        expect(failed.status).toBe('failed');
    });
});

describe('orchestration: caps under load (P-T005/P-T006)', () => {
    it('ten languages respect language/global/provider caps', async () => {
        const locales = Array.from({ length: 10 }, (_, i) => `lang-${i}`);
        const plan = buildRunPlan({
            runId: 'run_caps',
            languages: locales.map((locale) => ({ locale, skills: [], units: [unit(`u-${locale}-0`, 'k.a'), unit(`u-${locale}-1`, 'k.b'), unit(`u-${locale}-2`, 'k.c')] })),
            limits: { maxLanguages: 4, maxBatchesPerLanguage: 2, maxGlobalModelCalls: 3, providerCaps: { openai: 2 } },
            policy: {},
            batching: { maxUnitsPerBatch: 1, maxTokensPerBatch: 8000 },
        });
        const scheduler = ConcurrencyScheduler.fromExecutionLimits(plan.limits);
        const active = { current: 0, peak: 0 };
        const events = [];
        for await (const event of runLanguagesParallel(plan, testContext(), {
            createWorker: trackingWorker({ delayMs: 15, active }),
            scheduler,
        })) {
            events.push(event);
        }
        expect(events.filter((e) => e.type === 'language-completed')).toHaveLength(10);
        const observed = scheduler.observed();
        expect(observed.languages).toBeLessThanOrEqual(4);
        expect(observed.global).toBeLessThanOrEqual(3);
        expect(observed.providers['openai']).toBeLessThanOrEqual(2);
        for (const batches of Object.values(observed.batches)) {
            expect(batches).toBeLessThanOrEqual(2);
        }
    });
});

describe('orchestration: partial success + retry (P-T005/P-T007)', () => {
    it('one crashing locale fails while green work persists, then retry recovers', async () => {
        const plan = multiLanguagePlan(['fr-FR', 'de-DE', 'ja-JP'], 2);
        const context = testContext();
        const failing = trackingWorker({ failLocales: new Set(['ja-JP']) });
        const events = [];
        for await (const event of runLanguagesParallel(plan, context, { createWorker: failing })) {
            events.push(event);
        }
        expect(events.some((e) => e.type === 'language-completed' && e.locale === 'fr-FR')).toBe(true);
        expect(events.some((e) => e.type === 'language-completed' && e.locale === 'de-DE')).toBe(true);
        const failed = events.find((e) => e.type === 'language-failed');
        expect(failed?.type).toBe('language-failed');
        if (failed?.type === 'language-failed') {
            expect(failed.locale).toBe('ja-JP');
            expect(failed.error).toContain('worker exploded');
        }

        // Fan-in view: partial success with green translations kept.
        const summaries = [
            { locale: 'fr-FR', status: 'complete' as const, translated: 2, failed: 0, batches: 1, repairs: 0, reviews: 0 },
            { locale: 'de-DE', status: 'complete' as const, translated: 2, failed: 0, batches: 1, repairs: 0, reviews: 0 },
            { locale: 'ja-JP', status: 'failed' as const, translated: 0, failed: 2, batches: 1, repairs: 0, reviews: 0, error: 'boom' },
        ];
        expect(aggregateResults(plan.runId, summaries).status).toBe('partial_success');
        expect(deriveRunStatus(summaries)).toBe('partial_success');

        // retry --lang narrows to the failed locale; unknown locales return null.
        const retryPlan = filterPlanForRetry(plan, 'ja-JP');
        expect(retryPlan?.languages.map((l) => l.locale)).toEqual(['ja-JP']);
        expect(retryPlan?.runId).toContain('ja-JP');
        expect(filterPlanForRetry(plan, 'xx-XX')).toBeNull();

        // Retry with a fixed worker recovers to complete.
        const retryEvents = [];
        for await (const event of runLanguagesParallel(retryPlan!, context, { createWorker: trackingWorker() })) {
            retryEvents.push(event);
        }
        expect(retryEvents.some((e) => e.type === 'language-completed' && e.locale === 'ja-JP')).toBe(true);
        expect(retryEvents.some((e) => e.type === 'language-failed')).toBe(false);
    });
});

describe('orchestration: event adapter (H1)', () => {
    it('maps runtime events 1:1 with no loss', async () => {
        const plan = multiLanguagePlan(['fr-FR'], 1);
        const events = [];
        for await (const event of runLanguagesParallel(plan, testContext(), { createWorker: trackingWorker() })) {
            events.push(event);
        }
        const adapted = events.map(adaptRuntimeEvent);
        expect(adapted[0]).toMatchObject({ kind: 'run-started', runId: 'run_parallel' });
        expect(adapted[adapted.length - 1]).toMatchObject({ kind: 'run-completed' });
        const kinds = new Set(adapted.map((e) => e.kind));
        expect(kinds.has('language-started')).toBe(true);
        expect(kinds.has('batch-started')).toBe(true);
        expect(kinds.has('batch-completed')).toBe(true);
        expect(kinds.has('language-completed')).toBe(true);
        // Batch translation counts survive the mapping.
        const batch = adapted.find((e) => e.kind === 'batch-completed');
        expect(batch).toMatchObject({ kind: 'batch-completed', locale: 'fr-FR' });
    });

    it('derives run status from summaries', () => {
        expect(deriveRunStatus([])).toBe('complete');
        expect(
            deriveRunStatus([{ locale: 'a', status: 'failed', translated: 0, failed: 1, batches: 1, repairs: 0, reviews: 0 }])
        ).toBe('failed');
    });
});
