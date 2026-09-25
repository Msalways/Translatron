import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { buildRunPlan } from '../../src/core/planner.js';
import { DEFAULT_EXECUTION_LIMITS, type TranslationWorkUnit } from '../../src/core/domain.js';
import { fingerprintSkill, fingerprintSkillSet } from '../../src/skills/fingerprint.js';
import { resolveSkillsForUnit } from '../../src/skills/resolver.js';
import type { LoadedSkill } from '../../src/skills/types.js';

const HEX = '0123456789abcdef'.split('');
function hex(minLength: number, maxLength: number): fc.Arbitrary<string> {
    return fc.array(fc.constantFrom(...HEX), { minLength, maxLength }).map((chars) => chars.join(''));
}

function arbUnit(): fc.Arbitrary<TranslationWorkUnit> {
    return fc.record({
        unitId: fc.uuid(),
        keyPath: fc.constantFrom('checkout.payNow', 'auth.login', 'cart.title', 'legal.terms', 'misc.note'),
        sourceText: fc.string({ minLength: 1, maxLength: 80 }),
        placeholders: fc.constant([] as string[]),
        reason: fc.constant('new' as const),
    });
}

function isDeeplyFrozen(value: unknown, seen = new Set<object>()): boolean {
    if (value === null || typeof value !== 'object') return true;
    if (seen.has(value)) return true;
    seen.add(value);
    if (!Object.isFrozen(value)) return false;
    return Object.values(value).every((item) => isDeeplyFrozen(item, seen));
}

function arbSkill(id: string): fc.Arbitrary<LoadedSkill> {
    return fc.record({
        id: fc.constant(id),
        scope: fc.constantFrom('global', 'language', 'domain') as fc.Arbitrary<LoadedSkill['scope']>,
        locales: fc.array(fc.constantFrom('ja', 'ja-JP', 'de-DE', 'pt-BR', 'fr-FR'), { maxLength: 2 }),
        docPath: fc.constant('mem://test.md'),
        content: fc.string({ minLength: 1, maxLength: 200 }),
        resources: fc.constant(new Map<string, string>()),
        glossary: fc.constant({}),
        examples: fc.constant([] as Array<{ keyPath: string; text: string }>),
        fingerprint: hex(8, 64),
    }) as fc.Arbitrary<LoadedSkill>;
}

/** Unique skill ids, matching the loader's fail-fast contract (duplicate ids are rejected at load). */
function arbSkillSet(): fc.Arbitrary<LoadedSkill[]> {
    return fc.uniqueArray(fc.constantFrom('s0', 's1', 's2', 's3', 's4'), { minLength: 1, maxLength: 5 }).chain((ids) =>
        fc.tuple(...ids.map((id) => arbSkill(id)))
    );
}

describe('invariants: plan immutability (K-T004)', () => {
    it('every built plan is deeply frozen, for any input', () => {
        fc.assert(
            fc.property(
                fc.array(arbUnit(), { minLength: 1, maxLength: 30 }),
                fc.constantFrom('fr-FR', 'de-DE', 'ja-JP'),
                (units, locale) => {
                    const plan = buildRunPlan({
                        runId: 'run_prop',
                        languages: [{ locale, skills: [], units }],
                        limits: DEFAULT_EXECUTION_LIMITS,
                        policy: {},
                    });
                    expect(isDeeplyFrozen(plan)).toBe(true);
                    // All units survive batching exactly once.
                    const planned = plan.languages[0].batches.flat().map((u) => u.unitId).sort();
                    expect(planned).toEqual(units.map((u) => u.unitId).sort());
                }
            ),
            { numRuns: 100 }
        );
    });
});

describe('invariants: fingerprint determinism + sensitivity (K-T004)', () => {
    it('same bytes hash equal; any single-byte doc change hashes different', () => {
        fc.assert(
            fc.property(
                fc.string({ minLength: 1, maxLength: 120 }),
                fc.string({ minLength: 1, maxLength: 40 }),
                fc.string({ minLength: 1, maxLength: 40 }),
                (doc, resourcePath, resourceText) => {
                    const resources = new Map([[resourcePath || 'r.md', resourceText]]);
                    const base = fingerprintSkill(doc, resources);
                    expect(fingerprintSkill(doc, resources)).toBe(base);
                    // Appending a byte rotates the hash (normalization never erases content).
                    fc.pre(doc.trim().length > 0);
                    expect(fingerprintSkill(`${doc}\n# extra`, resources)).not.toBe(base);
                }
            ),
            { numRuns: 100 }
        );
    });

    it('set fingerprint ignores order but not membership', () => {
        fc.assert(
            fc.property(
                fc.array(hex(8, 16), { minLength: 1, maxLength: 6 }),
                (hashes) => {
                    const unique = [...new Set(hashes)];
                    const reversed = [...unique].reverse();
                    expect(fingerprintSkillSet(unique)).toBe(fingerprintSkillSet(reversed));
                    fc.pre(unique.length > 0);
                    expect(fingerprintSkillSet(unique)).not.toBe(fingerprintSkillSet([...unique, 'ff'.repeat(8)]));
                }
            ),
            { numRuns: 100 }
        );
    });
});

describe('invariants: resolution determinism + scope ordering (K-T004)', () => {
    it('same input always resolves the same chain', () => {
        fc.assert(
            fc.property(
                arbSkillSet(),
                fc.constantFrom('ja-JP', 'de-DE', 'pt-BR'),
                fc.constantFrom('checkout.payNow', 'legal.terms'),
                (skills, locale, keyPath) => {
                    const first = resolveSkillsForUnit(skills, { locale, keyPath }).map((s) => s.id);
                    const second = resolveSkillsForUnit(skills, { locale, keyPath }).map((s) => s.id);
                    expect(second).toEqual(first);
                    // No duplicates ever.
                    expect(new Set(first).size).toBe(first.length);
                }
            ),
            { numRuns: 100 }
        );
    });

    it('global skills precede language skills precede domain skills', () => {
        fc.assert(
            fc.property(
                arbSkillSet(),
                fc.constantFrom('ja-JP', 'de-DE'),
                fc.constantFrom('checkout.payNow', 'legal.terms'),
                (skills, locale, keyPath) => {
                    const chain = resolveSkillsForUnit(skills, { locale, keyPath });
                    const rank = (scope: LoadedSkill['scope']): number =>
                        scope === 'global' ? 0 : scope === 'language' ? 1 : 2;
                    const ranks = chain.map((s) => rank(s.scope));
                    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
                }
            ),
            { numRuns: 100 }
        );
    });
});
