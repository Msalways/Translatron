import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateWorkerOutput } from '../../src/validation/result.js';
import { validatePlaceholders } from '../../src/validation/placeholders.js';
import { validateIcu } from '../../src/validation/icu.js';
import { validateMarkup } from '../../src/validation/markup.js';
import { validateBatchOutput } from '../../src/validation/batch.js';
import { repairBatch, renderRepairPrompt, REPAIR_BUDGETS } from '../../src/validation/repair.js';
import type { TranslationWorkUnit } from '../../src/core/domain.js';
import type { BatchTranslation } from '../../src/runtime/runtime.js';
import type { UnitFailure } from '../../src/validation/issues.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '..', 'fixtures', 'validation');

function load<T>(name: string): T {
    return JSON.parse(readFileSync(join(FIXTURES, name), 'utf-8')) as T;
}

interface TextCase {
    source: string;
    target: string;
    valid: boolean;
    reason?: string;
}

function unit(unitId: string, keyPath: string, sourceText: string): TranslationWorkUnit {
    return { unitId, keyPath, sourceText, placeholders: [], reason: 'new' };
}

describe('validation: structured-result validator (F-T002/F1)', () => {
    it('matches golden schema cases', () => {
        const cases = load<Array<{ name: string; units: string[]; translations: [string, string][]; valid: boolean }>>('schema.json');
        expect(cases.length).toBeGreaterThan(0);
        for (const c of cases) {
            const units = c.units.map((id, i) => unit(id, `k.${i}`, 'source'));
            const translations = c.translations.map(([unitId, text]) => ({ unitId, text }));
            const errors = validateWorkerOutput(units, translations);
            expect({ case: c.name, errors: errors.map((e) => e.type) }, `case ${c.name}`).toEqual(
                c.valid ? { case: c.name, errors: [] } : expect.objectContaining({ case: c.name })
            );
            if (!c.valid) expect(errors.length).toBeGreaterThan(0);
        }
    });
});

describe('validation: placeholders golden (F-T002/F2)', () => {
    it('accepts exact sets, rejects drops and inventions with names', () => {
        const cases = load<TextCase[]>('placeholders.json');
        for (const c of cases) {
            const errors = validatePlaceholders({ sourceText: c.source, translatedText: c.target, keyPath: 'k' });
            if (c.valid) {
                expect(errors, c.source).toEqual([]);
            } else {
                expect(errors.length, `${c.source} → ${c.target}`).toBeGreaterThan(0);
                expect(errors[0].type).toBe('PLACEHOLDER_MISMATCH');
                expect(errors[0].message).toMatch(/Missing |Unexpected /);
            }
        }
    });
});

describe('validation: ICU golden (F-T002/F3)', () => {
    it('checks syntax, other-branches, and skeleton match', () => {
        const cases = load<TextCase[]>('icu.json');
        for (const c of cases) {
            const errors = validateIcu({ sourceText: c.source, translatedText: c.target, keyPath: 'k' });
            if (c.valid) {
                expect(errors, c.source).toEqual([]);
            } else {
                expect(errors.length, `${c.source} → ${c.target} (${c.reason})`).toBeGreaterThan(0);
                expect(errors.every((e) => e.type === 'ICU_MISMATCH')).toBe(true);
            }
        }
    });

    it('accepts reordered branches with intact skeleton', () => {
        const errors = validateIcu({
            sourceText: '{n, plural, one {# thing} other {# things}}',
            translatedText: '{n, plural, other {# choses} one {# chose}}',
            keyPath: 'k',
        });
        expect(errors).toEqual([]);
    });
});

describe('validation: markup golden (F-T002/F4)', () => {
    it('compares tag multisets, skips plain text', () => {
        const cases = load<TextCase[]>('markup.json');
        for (const c of cases) {
            const errors = validateMarkup({ sourceText: c.source, translatedText: c.target, keyPath: 'k' });
            if (c.valid) {
                expect(errors, c.source).toEqual([]);
            } else {
                expect(errors.length, `${c.source} → ${c.target} (${c.reason})`).toBeGreaterThan(0);
                expect(errors.every((e) => e.type === 'MARKUP_MISMATCH')).toBe(true);
            }
        }
    });
});

describe('validation: batch composer happy path (F-T008)', () => {
    it('single pass, no reviewer, exact failure text on misses', () => {
        const units = [unit('u-1', 'auth.a', 'Hello {name}'), unit('u-2', 'auth.b', 'Bye')];
        const good: BatchTranslation[] = [
            { unitId: 'u-1', text: 'Bonjour {name}' },
            { unitId: 'u-2', text: 'Au revoir' },
        ];
        expect(validateBatchOutput(units, good)).toEqual([]);

        const bad: BatchTranslation[] = [
            { unitId: 'u-1', text: 'Bonjour' },
            { unitId: 'u-2', text: 'Au revoir' },
        ];
        const failures = validateBatchOutput(units, bad);
        expect(failures).toHaveLength(1);
        expect(failures[0].unitId).toBe('u-1');
        expect(failures[0].errors[0].message).toBe('Missing {name} in auth.a');
    });
});

describe('validation: repair workflow (F-T006/F6)', () => {
    const units = [unit('u-1', 'auth.a', 'Hello {name}')];
    const failure = (errors: UnitFailure['errors'] = [{ type: 'PLACEHOLDER_MISMATCH', message: 'Missing {name} in auth.a', field: 'auth.a' }]): UnitFailure[] => [
        { unitId: 'u-1', keyPath: 'auth.a', errors },
    ];

    it('converges on fixable output within budget', async () => {
        let calls = 0;
        const outcome = await repairBatch(units, failure(), {
            retranslate: (requests) => {
                calls += 1;
                expect(requests).toHaveLength(1);
                expect(requests[0].attempt).toBe(calls);
                return Promise.resolve([{ unitId: 'u-1', text: 'Bonjour {name}' }]);
            },
            validate: (translations) => validateBatchOutput(units, translations),
        });
        expect(outcome.accepted).toEqual([{ unitId: 'u-1', text: 'Bonjour {name}' }]);
        expect(outcome.failed).toEqual([]);
        expect(outcome.repairs).toBe(1);
        expect(outcome.reviews).toBe(0);
    });

    it('stops at budget and records FAILED without a reviewer', async () => {
        let calls = 0;
        const outcome = await repairBatch(units, failure(), {
            retranslate: () => {
                calls += 1;
                return Promise.resolve([{ unitId: 'u-1', text: 'Bonjour' }]);
            },
            validate: (translations) => validateBatchOutput(units, translations),
        });
        expect(calls).toBe(REPAIR_BUDGETS.repair);
        expect(outcome.accepted).toEqual([]);
        expect(outcome.failed).toHaveLength(1);
        expect(outcome.failed[0].errors[0].type).toBe('PLACEHOLDER_MISMATCH');
        expect(outcome.reviews).toBe(0);
    });

    it('escalates to the reviewer at most once', async () => {
        let reviews = 0;
        const outcome = await repairBatch(units, failure(), {
            retranslate: () => Promise.resolve([{ unitId: 'u-1', text: 'Bonjour' }]),
            validate: (translations) => validateBatchOutput(units, translations),
            requestReview: (failures) => {
                reviews += 1;
                expect(failures).toHaveLength(1);
                return Promise.resolve(new Map([['u-1', { unitId: 'u-1', text: 'Bonjour {name}' }]]));
            },
        });
        expect(reviews).toBe(1);
        expect(outcome.reviews).toBe(1);
        expect(outcome.accepted).toEqual([{ unitId: 'u-1', text: 'Bonjour {name}' }]);
        expect(outcome.failed).toEqual([]);
    });

    it('keeps failed units when the reviewer declines', async () => {
        const outcome = await repairBatch(units, failure(), {
            retranslate: () => Promise.resolve([{ unitId: 'u-1', text: 'Bonjour' }]),
            validate: (translations) => validateBatchOutput(units, translations),
            requestReview: () => Promise.resolve(new Map()),
        });
        expect(outcome.reviews).toBe(1);
        expect(outcome.failed).toHaveLength(1);
    });

    it('renders exact repair prompts, not paraphrases', () => {
        const prompt = renderRepairPrompt({
            unit: units[0],
            errors: [{ type: 'PLACEHOLDER_MISMATCH', message: 'Missing {name} in auth.a', field: 'auth.a' }],
            attempt: 1,
        });
        expect(prompt).toContain('Missing {name} in auth.a');
        expect(prompt).toContain('Hello {name}');
    });
});
