import { describe, it, expect } from 'vitest';
import { buildRunPlan } from '../../src/core/planner.js';
import { DEFAULT_EXECUTION_LIMITS } from '../../src/core/domain.js';
import { StubRuntime } from '../../src/runtime/stub.js';
import { DeepAgentRuntime } from '../../src/runtime/deepagents/runtime.js';
import type { LanguageWorker } from '../../src/runtime/deepagents/worker.js';
import type { RuntimeContext, RuntimeEvent, TranslationRuntime } from '../../src/runtime/runtime.js';

const KNOWN_EVENT_TYPES = new Set([
    'run-started',
    'language-started',
    'batch-started',
    'batch-completed',
    'language-completed',
    'language-failed',
    'run-completed',
]);

function plan() {
    return buildRunPlan({
        runId: 'run_contract',
        languages: [
            {
                locale: 'fr-FR',
                skills: [],
                units: [
                    { unitId: 'u-1', keyPath: 'a', sourceText: 'hello', placeholders: [], reason: 'new' },
                    { unitId: 'u-2', keyPath: 'b', sourceText: 'bye', placeholders: [], reason: 'new' },
                ],
            },
            {
                locale: 'de-DE',
                skills: [],
                units: [{ unitId: 'u-3', keyPath: 'c', sourceText: 'thanks', placeholders: [], reason: 'new' }],
            },
        ],
        limits: DEFAULT_EXECUTION_LIMITS,
        policy: {},
        batching: { maxUnitsPerBatch: 20, maxTokensPerBatch: 8000 },
    });
}

function context(): RuntimeContext {
    return {
        runId: 'run_contract',
        sourceLocale: 'en-GB',
        model: 'openai:gpt-5',
        fallbackModels: [],
        materials: [],
        maxRepairAttempts: 0,
    };
}

function fakeWorker(locale: string): LanguageWorker {
    return {
        locale,
        translateBatch: (batch) => Promise.resolve(batch.map((u) => ({ unitId: u.unitId, text: `[${locale}] ${u.sourceText}` }))),
    };
}

const implementations: Array<{ name: string; runtime: TranslationRuntime }> = [
    { name: 'StubRuntime', runtime: new StubRuntime() },
    { name: 'DeepAgentRuntime(fakes)', runtime: new DeepAgentRuntime({ createWorker: (locale) => fakeWorker(locale) }) },
];

async function collect(runtime: TranslationRuntime): Promise<RuntimeEvent[]> {
    const events: RuntimeEvent[] = [];
    for await (const event of runtime.execute(plan(), context())) {
        events.push(event);
    }
    return events;
}

describe.each(implementations)('runtime contract: $name (K-T005/FR-003)', ({ runtime }) => {
    it('opens with run-started (all locales) and closes with run-completed (same run)', async () => {
        const events = await collect(runtime);
        expect(events.length).toBeGreaterThan(0);
        const first = events[0];
        const last = events[events.length - 1];
        expect(first.type).toBe('run-started');
        if (first.type !== 'run-started') throw new Error('unreachable');
        expect([...first.languages].sort()).toEqual(['de-DE', 'fr-FR']);
        expect(last).toEqual({ type: 'run-completed', runId: 'run_contract' });
    });

    it('uses only seam event shapes (no framework internals leak)', async () => {
        const events = await collect(runtime);
        for (const event of events) {
            expect(KNOWN_EVENT_TYPES.has(event.type)).toBe(true);
            expect(event).not.toHaveProperty('messages');
            expect(JSON.stringify(event)).not.toContain('__langgraph');
        }
    });

    it('announces every planned unit exactly once per language', async () => {
        const events = await collect(runtime);
        const announced = new Map<string, string[]>();
        for (const event of events) {
            if (event.type !== 'batch-started') continue;
            announced.set(`${event.locale}:${event.batchIndex}`, [...event.unitIds]);
        }
        const frUnits = [...announced.entries()].filter(([key]) => key.startsWith('fr-FR:')).flatMap(([, ids]) => ids).sort();
        const deUnits = [...announced.entries()].filter(([key]) => key.startsWith('de-DE:')).flatMap(([, ids]) => ids).sort();
        expect(frUnits).toEqual(['u-1', 'u-2']);
        expect(deUnits).toEqual(['u-3']);
    });

    it('every batch-started resolves to batch-completed or a language failure', async () => {
        const events = await collect(runtime);
        const started = new Set<string>();
        const completed = new Set<string>();
        const failedLocales = new Set<string>();
        for (const event of events) {
            if (event.type === 'batch-started') started.add(`${event.locale}:${event.batchIndex}`);
            if (event.type === 'batch-completed') completed.add(`${event.locale}:${event.batchIndex}`);
            if (event.type === 'language-failed') failedLocales.add(event.locale);
        }
        for (const key of started) {
            const locale = key.split(':')[0];
            expect(completed.has(key) || failedLocales.has(locale)).toBe(true);
        }
    });

    it('translations reference only announced units with non-empty text', async () => {
        const events = await collect(runtime);
        const announced = new Set<string>();
        for (const event of events) {
            if (event.type === 'batch-started') {
                for (const id of event.unitIds) announced.add(`${event.locale}:${id}`);
            }
            if (event.type === 'batch-completed') {
                for (const translation of event.translations) {
                    expect(announced.has(`${event.locale}:${translation.unitId}`)).toBe(true);
                    expect(translation.text.length).toBeGreaterThan(0);
                }
            }
        }
    });

    it('each language completes XOR fails exactly once', async () => {
        const events = await collect(runtime);
        const terminal = new Map<string, string>();
        for (const event of events) {
            if (event.type === 'language-completed' || event.type === 'language-failed') {
                expect(terminal.has(event.locale)).toBe(false);
                terminal.set(event.locale, event.type);
            }
        }
        expect([...terminal.keys()].sort()).toEqual(['de-DE', 'fr-FR']);
    });
});
