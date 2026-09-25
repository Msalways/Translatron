import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRunPlan } from '../../src/core/planner.js';
import { DEFAULT_EXECUTION_LIMITS } from '../../src/core/domain.js';
import { StubRuntime, defaultStubText } from '../../src/runtime/stub.js';
import { TRANSLATION_TOOL_NAMES, createTranslationTools } from '../../src/runtime/deepagents/tools.js';
import { extractWorkerResponse } from '../../src/runtime/deepagents/worker.js';
import { CORE_POLICY, corePolicyFingerprint } from '../../src/runtime/deepagents/policy.js';
import { resolveModelString, resolveLegacyProvider } from '../../src/runtime/deepagents/models.js';
import { isTransientError, withRetry, RETRY_BUDGETS } from '../../src/runtime/deepagents/middleware.js';
import { runLanguagesSequential } from '../../src/runtime/deepagents/supervisor.js';
import type { RuntimeContext } from '../../src/runtime/runtime.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = join(__dirname, '..', '..', 'src');

function testPlan() {
    return buildRunPlan({
        runId: 'run_1',
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
                units: [{ unitId: 'u-1', keyPath: 'a', sourceText: 'hello', placeholders: [], reason: 'new' }],
            },
        ],
        limits: DEFAULT_EXECUTION_LIMITS,
        policy: {},
        batching: { maxUnitsPerBatch: 20, maxTokensPerBatch: 8000 },
    });
}

function testContext(): RuntimeContext {
    return {
        runId: 'run_1',
        sourceLocale: 'en-GB',
        model: 'openai:gpt-5',
        fallbackModels: [],
        materials: [],
        maxRepairAttempts: 2,
    };
}

describe('runtime: TranslationRuntime seam (C-T002)', () => {
    it('stub runtime drives a full plan with zero framework imports', async () => {
        const events = [];
        for await (const event of new StubRuntime().execute(testPlan(), testContext())) {
            events.push(event);
        }
        const types = events.map((e) => e.type);
        expect(types[0]).toBe('run-started');
        expect(types[types.length - 1]).toBe('run-completed');
        const completed = events.filter((e) => e.type === 'batch-completed');
        // fr-FR splits by context class (ns:a vs ns:b), de-DE is one batch.
        expect(completed).toHaveLength(3);
        const allIds = completed.flatMap((e) => (e.type === 'batch-completed' ? e.translations.map((t) => t.unitId) : [])).sort();
        expect(allIds).toEqual(['u-1', 'u-1', 'u-2']);
        const first = completed[0];
        if (first.type !== 'batch-completed') throw new Error('unreachable');
        expect(first.translations[0].text).toContain('hello');
    });

    it('stub fails one language while others complete (partial success)', async () => {
        const runtime = new StubRuntime({ 'de-DE': { kind: 'fail-language', error: 'boom' } });
        const events = [];
        for await (const event of runtime.execute(testPlan(), testContext())) {
            events.push(event);
        }
        expect(events.some((e) => e.type === 'language-failed' && e.locale === 'de-DE')).toBe(true);
        expect(events.some((e) => e.type === 'language-completed' && e.locale === 'fr-FR')).toBe(true);
    });

    it('default stub text is non-empty and locale-marked', () => {
        expect(defaultStubText('u', 'hi', 'ja-JP')).toBe('[ja-JP] hi');
    });

    it('framework imports live only under src/runtime/deepagents', () => {
        const offenders: string[] = [];
        const walk = (dir: string) => {
            for (const entry of readdirSync(dir)) {
                const full = join(dir, entry);
                if (statSync(full).isDirectory()) {
                    if (entry === 'node_modules') continue;
                    walk(full);
                } else if (entry.endsWith('.ts')) {
                    const content = readFileSync(full, 'utf-8');
                    if (/from\s+['"]deepagents['"]|from\s+['"]@langchain\//.test(content)) {
                        const rel = full.replace(SRC_ROOT, 'src').replace(/\\/g, '/');
                        if (!rel.startsWith('src/runtime/deepagents/')) offenders.push(rel);
                    }
                }
            }
        };
        walk(SRC_ROOT);
        expect(offenders).toEqual([]);
    });
});

describe('runtime: worker tools allowlist (C-T008)', () => {
    it('exposes exactly the six narrow tools', () => {
        expect([...TRANSLATION_TOOL_NAMES].sort()).toEqual([
            'get_key_context',
            'get_related_translations',
            'get_skill_resource',
            'lookup_glossary',
            'lookup_translation_memory',
            'request_clarification',
        ]);
        const tools = createTranslationTools(
            {
                lookupMemory: () => [],
                lookupGlossaryTerm: () => null,
                getKeyContext: () => null,
                getRelatedTranslations: () => [],
                getSkillResource: () => null,
            },
            'fr-FR'
        );
        expect(tools.map((t) => t.name).sort()).toEqual([...TRANSLATION_TOOL_NAMES].sort());
    });
});

describe('runtime: worker response extraction (C-T004)', () => {
    it('accepts structuredResponse', () => {
        const out = extractWorkerResponse({
            structuredResponse: { translations: [{ unitId: 'u-1', text: 'bonjour' }] },
        });
        expect(out.translations).toEqual([{ unitId: 'u-1', text: 'bonjour' }]);
    });

    it('falls back to JSON in the last message', () => {
        const out = extractWorkerResponse({
            messages: [
                { content: 'thinking…' },
                { content: 'done: {"translations": [{"unitId": "u-2", "text": "au revoir"}]}' },
            ],
        });
        expect(out.translations).toEqual([{ unitId: 'u-2', text: 'au revoir' }]);
    });

    it('rejects positional arrays and empty results', () => {
        expect(() => extractWorkerResponse({ structuredResponse: ['a', 'b'] })).toThrow(/parseable/);
        expect(() => extractWorkerResponse({ messages: [] })).toThrow(/parseable/);
    });
});

describe('runtime: core policy (C-T006)', () => {
    it('policy is non-empty and fingerprinted stably', () => {
        expect(CORE_POLICY.length).toBeGreaterThan(100);
        expect(corePolicyFingerprint()).toBe(corePolicyFingerprint());
        expect(corePolicyFingerprint()).toMatch(/^[0-9a-f]{16}$/);
    });
});

describe('runtime: model resolver (C-T007)', () => {
    it('passes through provider:model strings', () => {
        expect(resolveModelString('openai:gpt-5')).toEqual({ model: 'openai:gpt-5', fallbackModels: [] });
    });

    it('rejects bare names and unknown providers', () => {
        expect(() => resolveModelString('gpt-5')).toThrow(/provider:model/);
        expect(() => resolveModelString('acme:model-x')).toThrow(/Unknown model provider/);
    });

    it('maps legacy provider chains with cycle protection', () => {
        const providers = [
            { name: 'a', type: 'openai', model: 'gpt-5', temperature: 0.3, maxRetries: 3 },
            { name: 'b', type: 'anthropic', model: 'claude-x', temperature: 0.3, maxRetries: 3, fallback: 'a' },
        ];
        expect(resolveLegacyProvider(providers[1], providers)).toEqual({
            model: 'anthropic:claude-x',
            fallbackModels: ['openai:gpt-5'],
        });
        const cyclic = [
            { name: 'a', type: 'openai', model: 'm1', temperature: 0.3, maxRetries: 3, fallback: 'b' },
            { name: 'b', type: 'groq', model: 'm2', temperature: 0.3, maxRetries: 3, fallback: 'a' },
        ];
        expect(resolveLegacyProvider(cyclic[0], cyclic).fallbackModels).toEqual(['groq:m2']);
    });
});

describe('runtime: retry middleware (C-T011)', () => {
    it('retries transient 429s then succeeds', async () => {
        let calls = 0;
        const out = await withRetry(
            () => {
                calls += 1;
                if (calls < 3) throw new Error('429 rate limit exceeded');
                return Promise.resolve('ok');
            },
            { sleep: () => Promise.resolve(), baseDelayMs: 1 }
        );
        expect(out).toBe('ok');
        expect(calls).toBe(3);
    });

    it('never retries deterministic failures', async () => {
        let calls = 0;
        await expect(
            withRetry(
                () => {
                    calls += 1;
                    throw new Error('PLACEHOLDER_MISMATCH Missing {count}');
                },
                { sleep: () => Promise.resolve() }
            )
        ).rejects.toThrow(/PLACEHOLDER_MISMATCH/);
        expect(calls).toBe(1);
    });

    it('classifies transient vs deterministic', () => {
        expect(isTransientError(new Error('503 overloaded, try again'))).toBe(true);
        expect(isTransientError(new Error('schema validation failed'))).toBe(false);
        expect(RETRY_BUDGETS).toMatchObject({ modelRetry: 3, repair: 2, review: 1 });
    });
});

describe('runtime: supervisor sequential path (C-T009)', () => {
    it('emits language summaries and isolates failures', async () => {
        const events = [];
        for await (const event of runLanguagesSequential(testPlan(), testContext(), {
            createWorker: (locale) => ({
                locale,
                translateBatch: (batch) => {
                    if (locale === 'de-DE') throw new Error('worker exploded');
                    return Promise.resolve(batch.map((u) => ({ unitId: u.unitId, text: `T:${u.sourceText}` })));
                },
            }),
        })) {
            events.push(event);
        }
        expect(events.some((e) => e.type === 'language-completed' && e.locale === 'fr-FR')).toBe(true);
        const failed = events.find((e) => e.type === 'language-failed');
        expect(failed?.type).toBe('language-failed');
        if (failed?.type === 'language-failed') {
            expect(failed.locale).toBe('de-DE');
            expect(failed.error).toContain('worker exploded');
        }
        expect(events[events.length - 1].type).toBe('run-completed');
    });
});
