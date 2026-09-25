import { describe, it, expect } from 'vitest';
import {
    buildRunPlan,
    contextClassOf,
    DEFAULT_BATCHING,
    estimateTokens,
    type PlanLanguageInput,
} from '../../src/core/planner.js';
import { DEFAULT_EXECUTION_LIMITS, type TranslationWorkUnit } from '../../src/core/domain.js';

function workUnit(keyPath: string, text = 'hello', extra: Partial<TranslationWorkUnit> = {}): TranslationWorkUnit {
    return {
        unitId: `u-${keyPath}`,
        keyPath,
        sourceText: text,
        placeholders: [],
        reason: 'new',
        ...extra,
    };
}

describe('planner: grouping + batching (A2-T007)', () => {
    it('estimates ~4 chars per token, minimum 1', () => {
        expect(estimateTokens('')).toBe(1);
        expect(estimateTokens('12345678')).toBe(2);
    });

    it('derives context class from context fingerprint or top segment', () => {
        expect(contextClassOf(workUnit('auth.login', 'x', { contextFingerprint: 'c1' }))).toBe('ctx:c1');
        expect(contextClassOf(workUnit('auth.login'))).toBe('ns:auth');
    });

    it('groups by skill fingerprint and batches by token budget', () => {
        const lang: PlanLanguageInput = {
            locale: 'fr-FR',
            skills: [],
            units: [
                workUnit('auth.a', 'aaa', { skillFingerprint: 's1' }),
                workUnit('auth.b', 'bbb', { skillFingerprint: 's1' }),
                workUnit('auth.c', 'ccc', { skillFingerprint: 's2' }),
            ],
        };
        const plan = buildRunPlan({
            runId: 'run_1',
            languages: [lang],
            limits: DEFAULT_EXECUTION_LIMITS,
            policy: {},
            batching: { maxUnitsPerBatch: 20, maxTokensPerBatch: 1 },
        });
        // s1 pair splits by token cap (1 token each), s2 alone → 3 batches.
        expect(plan.languages[0].batches).toHaveLength(3);
        expect(plan.totalUnits).toBe(3);
    });

    it('respects max units per batch', () => {
        const lang: PlanLanguageInput = {
            locale: 'de-DE',
            skills: [],
            units: [workUnit('ns.a'), workUnit('ns.b'), workUnit('ns.c')],
        };
        const plan = buildRunPlan({
            runId: 'run_1',
            languages: [lang],
            limits: DEFAULT_EXECUTION_LIMITS,
            policy: {},
            batching: { maxUnitsPerBatch: 2, maxTokensPerBatch: 8000 },
        });
        expect(plan.languages[0].batches.map((b) => b.length)).toEqual([2, 1]);
    });

    it('separates glossary fingerprints into distinct groups', () => {
        const mk = (glossary?: string): PlanLanguageInput => ({
            locale: 'ja-JP',
            skills: [],
            glossaryFingerprint: glossary,
            units: [workUnit('shop.a')],
        });
        const plan = buildRunPlan({
            runId: 'run_1',
            languages: [mk('g1'), mk('g2')],
            limits: DEFAULT_EXECUTION_LIMITS,
            policy: {},
        });
        expect(plan.languages).toHaveLength(2);
        expect(plan.languages[0].batches).toHaveLength(1);
    });

    it('produces deeply frozen plans (A2-T008)', () => {
        const plan = buildRunPlan({
            runId: 'run_1',
            languages: [{ locale: 'fr-FR', skills: [{ id: 'g', scope: 'global', fingerprint: 'f' }], units: [workUnit('a.b')] }],
            limits: DEFAULT_EXECUTION_LIMITS,
            policy: {},
        });
        expect(Object.isFrozen(plan)).toBe(true);
        expect(Object.isFrozen(plan.languages)).toBe(true);
        expect(Object.isFrozen(plan.languages[0])).toBe(true);
        expect(Object.isFrozen(plan.languages[0].batches)).toBe(true);
        expect(Object.isFrozen(plan.languages[0].batches[0])).toBe(true);
        expect(Object.isFrozen(plan.limits)).toBe(true);
        expect(() => {
            (plan as { runId: string }).runId = 'mutated';
        }).toThrow();
    });

    it('is deterministic: identical inputs → identical plans', () => {
        const input = {
            runId: 'run_1',
            languages: [
                {
                    locale: 'fr-FR',
                    skills: [],
                    units: [workUnit('b.key'), workUnit('a.key', 'x', { skillFingerprint: 's9' })],
                },
            ],
            limits: DEFAULT_EXECUTION_LIMITS,
            policy: {},
        };
        expect(buildRunPlan(input)).toEqual(buildRunPlan(input));
    });

    it('exposes batching defaults for tests', () => {
        expect(DEFAULT_BATCHING.maxUnitsPerBatch).toBe(20);
    });
});
