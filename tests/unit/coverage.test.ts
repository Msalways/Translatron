import { describe, it, expect } from 'vitest';
import { findTargetOnlyKeys } from '../../src/core/coverage.js';
import { runCheck, formatCheckReport } from '../../src/cli/commands/check.js';
import { reconcile } from '../../src/core/reconciler.js';
import { safeValidateConfig } from '../../src/config/schema.js';
import type { SourceUnit, TranslationRevision } from '../../src/core/domain.js';
import { computeHash } from '../../src/utils/hash.js';

function unit(keyPath: string, sourceText = 'text'): SourceUnit {
    return {
        unitId: `u-${keyPath}`,
        keyPath,
        sourceText,
        sourceHash: computeHash(sourceText),
        placeholders: [],
        sourceFile: 'en.json',
        schemaVersion: 1,
    };
}

describe('coverage: target-only detection (K-T001/S11)', () => {
    const sources = [unit('auth.login', 'Log in'), unit('checkout.pay', 'Pay')];

    it('finds keys present in targets but absent from source, in stable order', () => {
        const orphans = findTargetOnlyKeys({
            sourceUnits: sources,
            targets: [
                { locale: 'ja-JP', entries: { 'auth.login': 'x', stale: 'y' } },
                { locale: 'fr-FR', entries: { 'auth.login': 'x', 'checkout.pay': 'y', extra: 'z' } },
            ],
        });
        expect(orphans).toEqual([
            { locale: 'fr-FR', keyPath: 'extra' },
            { locale: 'ja-JP', keyPath: 'stale' },
        ]);
    });

    it('exempts configured target-only patterns, still reports the rest', () => {
        const orphans = findTargetOnlyKeys({
            sourceUnits: sources,
            targets: [{ locale: 'de-DE', entries: { 'legal.countrySpecific.note': 'x', 'rogue.key': 'y' } }],
            except: ['legal.countrySpecific.*'],
        });
        expect(orphans).toEqual([{ locale: 'de-DE', keyPath: 'rogue.key' }]);
    });

    it('exact pattern matches; non-matching patterns report', () => {
        const targets = [{ locale: 'fr-FR', entries: { 'a.b': 'x' } }];
        expect(findTargetOnlyKeys({ sourceUnits: [], targets, except: ['a.b'] })).toEqual([]);
        expect(findTargetOnlyKeys({ sourceUnits: [], targets, except: ['a.*'] })).toEqual([]);
        expect(findTargetOnlyKeys({ sourceUnits: [], targets, except: ['c.*'] })).toEqual([
            { locale: 'fr-FR', keyPath: 'a.b' },
        ]);
    });

    it('empty targets and empty sources behave', () => {
        expect(findTargetOnlyKeys({ sourceUnits: sources, targets: [] })).toEqual([]);
        expect(findTargetOnlyKeys({ sourceUnits: [], targets: [] })).toEqual([]);
        expect(
            findTargetOnlyKeys({ sourceUnits: [], targets: [{ locale: 'fr-FR', entries: {} }] })
        ).toEqual([]);
    });

    it('return shape carries no source text or translatable payload', () => {
        const orphans = findTargetOnlyKeys({
            sourceUnits: sources,
            targets: [{ locale: 'fr-FR', entries: { secret: 'classified text' } }],
        });
        expect(orphans).toHaveLength(1);
        for (const orphan of orphans) {
            expect(Object.keys(orphan).sort()).toEqual(['keyPath', 'locale']);
            expect(JSON.stringify(orphan)).not.toContain('classified');
        }
    });
});

describe('coverage: ORPHANED vs TARGET_DELETED stay distinct (K-T002/S12)', () => {
    it('source-missing + target-present is orphan-side; source-present + target-missing is reconciler TARGET_DELETED', () => {
        // Orphan side: coverage function, never a translation candidate.
        const orphans = findTargetOnlyKeys({
            sourceUnits: [unit('a', 'A')],
            targets: [{ locale: 'fr-FR', entries: { a: 'A-fr', b: 'B-fr' } }],
        });
        expect(orphans).toEqual([{ locale: 'fr-FR', keyPath: 'b' }]);

        // Target-deleted side: reconciler with prior registry history.
        const targetHash = computeHash('A-fr');
        const { reconciled, workUnits } = reconcile({
            sourceLocale: 'en-GB',
            catalogId: 'main',
            sourceUnits: [unit('a', 'A')],
            targets: [{ locale: 'de-DE', entries: {} }],
            revisions: [
                {
                    id: 'tr-1',
                    catalogId: 'main',
                    keyPath: 'a',
                    sourceLocale: 'en-GB',
                    targetLocale: 'de-DE',
                    sourceHash: computeHash('A'),
                    targetHash,
                    origin: 'agent',
                    parentIds: [],
                    runId: 'run-1',
                    createdAt: '2026-01-01T00:00:00.000Z',
                },
            ],
        });
        expect(reconciled[0].status).toBe('TARGET_DELETED');
        // Different actions: TARGET_DELETED yields translation work; orphans never do.
        expect(workUnits.map((w) => w.reason)).toContain('target-deleted');
        expect(workUnits.some((w) => w.keyPath === 'b')).toBe(false);
    });
});

describe('coverage: check orphan section (K-T003/K-T004)', () => {
    function p6Fixture() {
        return {
            sourceLocale: 'en-GB',
            sourceUnits: [unit('checkout.payNow', 'Pay now'), unit('auth.login', 'Log in')],
            targets: [
                { locale: 'fr-FR', entries: { 'checkout.payNow': 'Payer', 'auth.login': 'Se connecter', 'auth.logout': 'Se déconnecter' } },
                { locale: 'de-DE', entries: { 'checkout.payNow': 'Zahlen', 'auth.logout': 'Abmelden' } },
                { locale: 'ja-JP', entries: { 'auth.logout': 'ログアウト' } },
            ],
        };
    }

    it('P6 golden: orphan block byte-shape with dynamic source-locale line', () => {
        const result = runCheck(p6Fixture());
        expect(result.failed).toBe(true);
        const report = formatCheckReport(result, ['de-DE', 'fr-FR', 'ja-JP']);
        expect(report).toContain('Orphaned translation keys detected');
        expect(report).toContain('auth.logout');
        expect(report).toContain('fr-FR   ORPHANED');
        expect(report).toContain('Source key no longer exists in en-GB.');
        expect(report).toContain('translatronx sync');
        // Missing-key section coexists (checkout.payNow missing in ja-JP, auth.login missing in de-DE/ja-JP).
        expect(report).toContain('MISSING');
    });

    it('excepted keys vanish; warn severity reports without failing', () => {
        const cleared = runCheck({ ...p6Fixture(), targetOnly: ['auth.logout'] });
        expect(cleared.issues.some((i) => i.kind === 'orphan')).toBe(false);

        const warned = runCheck({ ...p6Fixture(), orphanSeverity: 'warn' });
        expect(warned.failed).toBe(true); // missing keys still fail
        expect(warned.warnings.some((w) => w.kind === 'orphan')).toBe(true);

        const warnedOnly = runCheck({
            sourceLocale: 'en-GB',
            sourceUnits: [unit('a', 'A')],
            targets: [{ locale: 'fr-FR', entries: { a: 'A-fr', ghost: 'G' } }],
            orphanSeverity: 'warn',
        });
        expect(warnedOnly.failed).toBe(false);
        expect(warnedOnly.warnings).toEqual([{ keyPath: 'ghost', locale: 'fr-FR', kind: 'orphan', message: 'ORPHANED' }]);
        expect(formatCheckReport(warnedOnly, ['fr-FR'])).toContain('(warnings, not failing)');
    });

    it('--catalogs-only is output-identical until registry sections land', () => {
        const base = p6Fixture();
        const full = formatCheckReport(runCheck(base), ['de-DE', 'fr-FR', 'ja-JP']);
        const gated = formatCheckReport(runCheck({ ...base, catalogsOnly: true }), ['de-DE', 'fr-FR', 'ja-JP']);
        expect(gated).toBe(full);
    });

    it('clean projects are byte-identical to pre-orphan behavior', () => {
        const result = runCheck({
            sourceLocale: 'en-GB',
            sourceUnits: [unit('a', 'Hello {name}')],
            targets: [{ locale: 'fr-FR', entries: { a: 'Bonjour {name}' } }],
        });
        expect(result).toEqual({
            sourceLocale: 'en-GB',
            issues: [],
            warnings: [],
            checkedKeys: 1,
            failed: false,
        });
        expect(formatCheckReport(result, ['fr-FR'])).toBe('All translations valid (1 keys × 1 locales)\n');
    });
});

describe('coverage: catalogs.targetOnly config (K-T004)', () => {
    function baseConfig() {
        return {
            sourceLanguage: 'en-GB',
            targetLanguages: [{ language: 'French', shortCode: 'fr' }],
            extractors: [{ type: 'json', pattern: './locales/en.json' }],
            providers: [{ name: 'main', type: 'openai', model: 'gpt-5' }],
        };
    }

    it('accepts targetOnly patterns and defaults to []', () => {
        const parsed = safeValidateConfig({
            ...baseConfig(),
            catalogs: { targetOnly: ['legal.countrySpecific.*'] },
        });
        expect(parsed.success).toBe(true);
        if (parsed.success) {
            expect(parsed.data.catalogs).toEqual({ targetOnly: ['legal.countrySpecific.*'] });
        }
    });

    it('legacy configs without catalogs still parse with undefined', () => {
        const parsed = safeValidateConfig(baseConfig());
        expect(parsed.success).toBe(true);
        if (parsed.success) {
            expect(parsed.data.catalogs).toBeUndefined();
        }
    });
});

describe('coverage: registry-backed stale check', () => {
    it('reports source, skill, and context staleness; catalogs-only skips them', () => {
        const sources: SourceUnit[] = [
            unit('source', 'New source'),
            unit('skill', 'Skill guided'),
            { ...unit('context'), context: 'Current context' },
        ];
        const locale = 'fr-FR';
        const texts: Record<string, string> = { source: 'Traduction', skill: 'Texte', context: 'Texte' };
        const targets = [{ locale, entries: texts }];
        const revision = (keyPath: string, sourceHash: string, extra: Partial<TranslationRevision> = {}): TranslationRevision => ({
            catalogId: 'main', keyPath, sourceLocale: 'en-GB', targetLocale: locale,
            id: `rev-${keyPath}`, sourceHash, targetHash: computeHash(texts[keyPath]),
            origin: 'agent', parentIds: [], skillFingerprints: [], runId: 'run-1',
            createdAt: '2026-01-01T00:00:00.000Z', ...extra,
        });
        const revisions = [
            revision('source', computeHash('Old source')),
            revision('skill', computeHash('Skill guided'), { skillFingerprints: [{ id: 'org:policy:global', scope: 'global', fingerprint: 'old-fingerprint' }] }),
            revision('context', computeHash('text'), {
                skillFingerprints: [{ id: 'org:policy:global', scope: 'global', fingerprint: 'new-fingerprint' }],
                contextFingerprint: computeHash('Old context'),
            }),
        ];
        const currentSkills = new Map([[locale, new Map([['org:policy:global', 'new-fingerprint']])]]);
        const result = runCheck({ sourceLocale: 'en-GB', sourceUnits: sources, targets, revisions, currentSkills });
        expect(result.issues.map((issue) => issue.kind)).toEqual(['source-stale', 'skill-stale', 'context-stale']);
        expect(runCheck({ sourceLocale: 'en-GB', sourceUnits: sources, targets, revisions, currentSkills, catalogsOnly: true }).issues).toEqual([]);
    });
});
