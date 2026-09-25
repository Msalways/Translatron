import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    TranslationRevisionSchema,
    TranslationStatusSchema,
    ExecutionLimitsSchema,
    TRANSLATION_STATUSES,
    FORBIDDEN_CORE_IMPORT_PATTERNS,
    type TranslationRevision,
    type SourceUnit as DomainSourceUnit,
} from '../../src/core/domain.js';
import type { SourceUnit as LegacySourceUnit } from '../../src/types/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORE_DIR = join(__dirname, '..', '..', 'src', 'core');

const HEX = '0123456789abcdef'.split('');
function hex(minLength: number, maxLength: number): fc.Arbitrary<string> {
    return fc.array(fc.constantFrom(...HEX), { minLength, maxLength }).map((a) => a.join(''));
}

function arbRevision(): fc.Arbitrary<TranslationRevision> {
    const origin = fc.constantFrom('agent', 'human', 'imported') as fc.Arbitrary<TranslationRevision['origin']>;
    return fc.record({
        id: fc.uuid(),
        catalogId: fc.constant('main'),
        keyPath: fc.string({ minLength: 1, maxLength: 40 }).map((s) => `k.${s.replace(/[^a-zA-Z0-9_]/g, 'x')}`),
        sourceLocale: fc.constant('en-GB'),
        targetLocale: fc.constantFrom('fr-FR', 'de-DE', 'ja-JP'),
        sourceHash: hex(8, 64),
        targetHash: hex(8, 64),
        origin,
        parentIds: fc.array(fc.uuid(), { maxLength: 3 }),
        skillFingerprints: fc.option(
            fc.array(
                fc.record({
                    id: fc.constantFrom('global', 'ja', 'ja-JP', 'ecommerce'),
                    scope: fc.constantFrom('global', 'language', 'domain'),
                    fingerprint: hex(8, 16),
                }),
                { maxLength: 4 }
            ),
            { nil: undefined }
        ),
        runId: fc.uuid(),
        createdAt: fc
            .integer({ min: Date.UTC(2024, 0, 1), max: Date.UTC(2027, 0, 1) })
            .map((t) => new Date(t).toISOString()),
    }) as fc.Arbitrary<TranslationRevision>;
}

describe('domain: TranslationRevision round-trip (A1-T002)', () => {
    it('preserves 100% of fields through schema parse (100 runs)', () => {
        fc.assert(
            fc.property(arbRevision(), (rev) => {
                const json = JSON.parse(JSON.stringify(rev)) as unknown;
                const parsed = TranslationRevisionSchema.parse(json);
                expect(parsed).toEqual(rev);
            }),
            { numRuns: 100 }
        );
    });

    it('rejects unknown origin values', () => {
        const base: TranslationRevision = {
            id: 'tr_1',
            catalogId: 'main',
            keyPath: 'a.b',
            sourceLocale: 'en-GB',
            targetLocale: 'fr-FR',
            sourceHash: 'h1',
            targetHash: 'h2',
            origin: 'agent',
            parentIds: [],
            runId: 'run_1',
            createdAt: new Date().toISOString(),
        };
        expect(() =>
            TranslationRevisionSchema.parse({ ...base, origin: 'robot' })
        ).toThrow();
    });
});

describe('domain: core boundary — no framework/storage imports (A1-T003)', () => {
    it('src/core contains zero forbidden imports', () => {
        const files = readdirSync(CORE_DIR).filter((f) => f.endsWith('.ts'));
        expect(files.length).toBeGreaterThan(0);
        const violations: string[] = [];
        for (const file of files) {
            const content = readFileSync(join(CORE_DIR, file), 'utf-8');
            for (const pattern of FORBIDDEN_CORE_IMPORT_PATTERNS) {
                const importRe = new RegExp(`(from\\s+['"][^'"]*${pattern.replace(/[/@-]/g, '\\$&')}[^'"]*['"]|require\\(\\s*['"][^'"]*${pattern.replace(/[/@-]/g, '\\$&')})`);
                if (importRe.test(content)) violations.push(`${file}: ${pattern}`);
            }
        }
        expect(violations).toEqual([]);
    });
});

describe('domain: status union + limits (A1-T004)', () => {
    it('accepts all 12 derived states and rejects unknowns', () => {
        expect(TRANSLATION_STATUSES).toHaveLength(12);
        for (const status of TRANSLATION_STATUSES) {
            expect(TranslationStatusSchema.parse(status)).toBe(status);
        }
        expect(() => TranslationStatusSchema.parse('STALE')).toThrow();
    });

    it('applies R&D §8 default concurrency caps', () => {
        const limits = ExecutionLimitsSchema.parse({});
        expect(limits).toMatchObject({
            maxLanguages: 4,
            maxBatchesPerLanguage: 2,
            maxGlobalModelCalls: 8,
        });
    });

    it('domain SourceUnit stays structurally compatible with legacy type', () => {
        const legacy: LegacySourceUnit = {
            unitId: 'u-1',
            keyPath: 'auth.login',
            sourceText: 'Log in',
            sourceHash: 'abc',
            placeholders: [],
            sourceFile: 'en.json',
            schemaVersion: 1,
        };
        const asDomain: DomainSourceUnit = legacy;
        expect(asDomain.keyPath).toBe('auth.login');
    });
});
