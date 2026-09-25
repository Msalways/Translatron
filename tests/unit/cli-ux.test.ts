import { describe, it, expect } from 'vitest';
import { adaptRuntimeEvent } from '../../src/core/events.js';
import type { RuntimeEvent } from '../../src/runtime/runtime.js';
import { ProgressRenderer } from '../../src/cli/renderer/progress.js';
import { buildRunReport, parseRunReport, runReportFromPerLanguage } from '../../src/cli/renderer/json.js';
import { runCheck, formatCheckReport } from '../../src/cli/commands/check.js';
import { buildProvenanceStatus, mergeProvenanceStatuses, formatProvenanceStatus } from '../../src/cli/commands/status.js';
import { runDoctor, formatDoctorReport } from '../../src/cli/commands/doctor.js';
import { explainKey, formatExplain } from '../../src/cli/commands/explain.js';
import { detectConflicts, renderConflict, buildResolutionRevision } from '../../src/cli/conflicts.js';
import { safeValidateConfig } from '../../src/config/schema.js';
import type { SourceUnit, TargetSnapshot, TranslationRevision } from '../../src/core/domain.js';
import { computeHash } from '../../src/utils/hash.js';

function unit(keyPath: string, sourceText: string): SourceUnit {
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

function snapshot(locale: string, entries: Record<string, string>): TargetSnapshot {
    const mapped: TargetSnapshot['entries'] = {};
    for (const [key, text] of Object.entries(entries)) {
        mapped[key] = { text, targetHash: computeHash(text) };
    }
    return { locale, entries: mapped };
}

function revision(keyPath: string, locale: string, text: string, overrides: Partial<TranslationRevision> = {}): TranslationRevision {
    return {
        id: `tr-${locale}-${keyPath}`,
        catalogId: 'main',
        keyPath,
        sourceLocale: 'en-GB',
        targetLocale: locale,
        sourceHash: computeHash('SOURCE'),
        targetHash: computeHash(text),
        origin: 'agent',
        parentIds: [],
        runId: 'run_1',
        createdAt: '2026-01-01T00:00:00.000Z',
        ...overrides,
    };
}

function sourceUnits(): SourceUnit[] {
    return [unit('checkout.payNow', 'Pay now'), unit('auth.login', 'Log in')];
}

describe('cli-ux: progress renderer (U-T002/FR-002)', () => {
    function scriptedStream(): RuntimeEvent[] {
        const events: RuntimeEvent[] = [{ type: 'run-started', runId: 'run_1', languages: ['fr-FR', 'de-DE', 'ja-JP', 'es-ES'] }];
        for (const locale of ['fr-FR', 'de-DE', 'ja-JP', 'es-ES']) {
            events.push({ type: 'language-started', locale });
            for (let batch = 0; batch < 2; batch++) {
                const unitIds = [`u-${locale}-${batch}a`, `u-${locale}-${batch}b`];
                events.push({ type: 'batch-started', locale, batchIndex: batch, unitIds });
                events.push({
                    type: 'batch-completed',
                    locale,
                    batchIndex: batch,
                    translations: unitIds.map((unitId) => ({ unitId, text: 'T' })),
                });
            }
            events.push({ type: 'language-completed', locale, translated: 4 });
        }
        events.push({ type: 'run-completed', runId: 'run_1' });
        return events;
    }

    it('renders §29-shaped progress and completion table', () => {
        const lines: string[] = [];
        const renderer = new ProgressRenderer({ write: (line) => lines.push(line), tty: false });
        for (const event of scriptedStream()) renderer.handle(adaptRuntimeEvent(event));
        renderer.summary(
            ['fr-FR', 'de-DE', 'ja-JP', 'es-ES'].map((locale, index) => ({
                locale,
                status: 'complete' as const,
                translated: 4,
                failed: 0,
                batches: 2,
                repairs: index === 2 ? 1 : 0,
                reviews: 0,
            })),
            { tmReused: 11, filesUpdated: ['locales/fr-FR.json', 'locales/de-DE.json'] }
        );
        const output = lines.join('\n');
        // Per-language completion lines.
        for (const locale of ['fr-FR', 'de-DE', 'ja-JP', 'es-ES']) {
            expect(output).toContain(`${locale}  4/4  ✓`);
        }
        // §29 summary shape.
        expect(output).toContain('Completed');
        expect(output).toContain('ja-JP  ✓ 4 (1 repaired)');
        expect(output).toContain('TM reused        11');
        expect(output).toContain('LLM translated   16');
        expect(output).toContain('Repairs           1');
        expect(output).toContain('Failed            0');
        expect(output).toContain('Files updated');
        expect(output).toContain('  locales/fr-FR.json');
    });

    it('verbose mode adds batch detail; failures render distinctly', () => {
        const lines: string[] = [];
        const renderer = new ProgressRenderer({ write: (line) => lines.push(line), tty: false, verbose: true });
        renderer.handle(adaptRuntimeEvent({ type: 'language-started', locale: 'ja-JP' }));
        renderer.handle(adaptRuntimeEvent({ type: 'batch-started', locale: 'ja-JP', batchIndex: 0, unitIds: ['u-1'] }));
        renderer.handle(adaptRuntimeEvent({ type: 'language-failed', locale: 'ja-JP', failed: 1, error: 'boom' }));
        const output = lines.join('\n');
        expect(output).toContain('batch 0 started');
        expect(output).toContain('ja-JP  ✗  boom');
        renderer.summary(
            [{ locale: 'ja-JP', status: 'failed', translated: 0, failed: 1, batches: 1, repairs: 0, reviews: 0, error: 'boom' }],
            { tmReused: 0, filesUpdated: [] }
        );
        expect(lines.join('\n')).toContain('ja-JP  ✗ 0 (1 failed)');
    });
});

describe('cli-ux: --json report (U-T005/FR-003/SC-002)', () => {
    it('partial run validates against the §31 schema', () => {
        const report = buildRunReport('run_abc', [
            { locale: 'fr-FR', status: 'complete', translated: 18, failed: 0, batches: 1, repairs: 0, reviews: 0 },
            { locale: 'ja-JP', status: 'failed', translated: 14, failed: 4, batches: 1, repairs: 1, reviews: 0 },
        ]);
        expect(report).toEqual({
            runId: 'run_abc',
            status: 'partial_success',
            languages: {
                'fr-FR': { status: 'complete', translated: 18 },
                'ja-JP': { status: 'failed', translated: 14, failed: 4 },
            },
        });
        // Round-trips through the schema (machine consumers validate this).
        expect(parseRunReport(JSON.parse(JSON.stringify(report)))).toEqual(report);
    });

    it('v2 per-language stats produce the same shape', () => {
        const report = runReportFromPerLanguage('run_v2', {
            'fr': { translated: 3, failed: 0 },
            'de': { translated: 1, failed: 2 },
        });
        expect(report.status).toBe('partial_success');
        expect(parseRunReport(report)).toEqual(report);
    });

    it('rejects malformed reports', () => {
        expect(() => parseRunReport({ runId: 'x' })).toThrow();
        expect(() => parseRunReport({ runId: 'x', status: 'banana', languages: {} })).toThrow();
    });
});

describe('cli-ux: deterministic check (U-T005/U-T007/FR-006)', () => {
    it('clean fixture passes with zero issues', () => {
        const result = runCheck({
            sourceLocale: 'en-GB',
            sourceUnits: [unit('a', 'Hello {name}'), unit('b', 'Bye')],
            targets: [{ locale: 'fr-FR', entries: { a: 'Bonjour {name}', b: 'Au revoir' } }],
        });
        expect(result.failed).toBe(false);
        expect(result.issues).toEqual([]);
        expect(formatCheckReport(result, ['fr-FR'])).toContain('All translations valid');
    });

    it('broken fixture reports key-level issues (§34 shape)', () => {
        const result = runCheck({
            sourceLocale: 'en-GB',
            sourceUnits: [
                unit('checkout.payNow', 'Pay now'),
                unit('account.delete.confirmation', 'Delete {name}?'),
                unit('plural.items', '{count, plural, one {# file} other {# files}}'),
                unit('rich.cta', 'Click <b>here</b>'),
            ],
            targets: [
                {
                    locale: 'ja-JP',
                    entries: {
                        'account.delete.confirmation': 'Supprimer ?',
                        'plural.items': '{count, plural, one {# fichier}}',
                        'rich.cta': 'Cliquez ici',
                    },
                },
            ],
        });
        expect(result.failed).toBe(true);
        const kinds = new Map(result.issues.map((issue) => [`${issue.keyPath}:${issue.kind}`, issue.message]));
        expect(kinds.has('checkout.payNow:missing')).toBe(true);
        expect(kinds.get('account.delete.confirmation:placeholder')).toContain('{name}');
        expect(kinds.get('plural.items:icu')).toContain('other');
        expect(kinds.get('rich.cta:markup')).toContain('<b>');
        const report = formatCheckReport(result, ['ja-JP']);
        expect(report).toContain('Translation validation failed');
        expect(report).toContain('checkout.payNow');
        expect(report).toContain('MISSING');
        expect(report).toContain(`${result.issues.length} issues`);
    });
});

describe('cli-ux: provenance status (U-T007/FR-007)', () => {
    function fixture() {
        const units = [unit('clean.key', 'Clean'), unit('manual.key', 'Manual'), unit('new.key', 'New')];
        const targets = [
            snapshot('fr-FR', { 'clean.key': 't-clean', 'manual.key': 'touched' }),
        ];
        const revisions = [
            revision('clean.key', 'fr-FR', 't-clean', { sourceHash: computeHash('Clean') }),
            revision('manual.key', 'fr-FR', 't-manual-old', { sourceHash: computeHash('Manual') }),
        ];
        return { units, targets, revisions };
    }

    it('counts states, origins, and action lists', () => {
        const { units, targets, revisions } = fixture();
        const status = buildProvenanceStatus({
            sourceLocale: 'en-GB',
            catalogId: 'main',
            sourceUnits: units,
            targets,
            revisions,
        });
        expect(status.totalKeys).toBe(3);
        expect(status.byState['CLEAN']).toBe(1);
        expect(status.byState['MANUAL']).toBe(1);
        expect(status.byState['NEW']).toBe(1);
        expect(status.byOrigin.agent).toBe(2);
        expect(status.manual).toEqual(['fr-FR manual.key']);
        expect(status.failed).toEqual([]);
    });

    it('merges per-locale views and renders the §35 shape', () => {
        const { units, targets, revisions } = fixture();
        const merged = mergeProvenanceStatuses([
            buildProvenanceStatus({ sourceLocale: 'en-GB', catalogId: 'main', sourceUnits: units, targets, revisions }),
        ]);
        const report = formatProvenanceStatus(merged);
        expect(report).toContain('Keys');
        expect(report).toContain('Translations');
        expect(report).toContain('Agent generated');
        expect(report).toContain('Human owned');
        expect(report).toContain('Clean');
        expect(report).toContain('Manual');
    });
});

describe('cli-ux: explain (U-T006/FR-005)', () => {
    it('traces state, origin, skills, model, TM, validation, revision', () => {
        const sourceText = 'Pay now';
        const units = [unit('checkout.payNow', sourceText)];
        const targets = [snapshot('ja-JP', { 'checkout.payNow': 'Payer' })];
        const revisions = [
            revision('checkout.payNow', 'ja-JP', 'Payer', {
                id: 'tr_01abc',
                origin: 'agent',
                model: 'openai:gpt-5',
                sourceHash: computeHash(sourceText),
                skillFingerprints: [
                    { id: 'global', scope: 'global', fingerprint: '73aa00'.padEnd(64, '0') },
                    { id: 'ja-JP', scope: 'language', fingerprint: '7fc100'.padEnd(64, '0') },
                ],
            }),
        ];
        const result = explainKey({
            keyPath: 'checkout.payNow',
            locale: 'ja-JP',
            sourceLocale: 'en-GB',
            catalogId: 'main',
            sourceUnits: units,
            targets,
            revisions,
        });
        expect(result?.state).toBe('CLEAN');
        expect(result?.origin).toBe('agent');
        expect(result?.model).toBe('openai:gpt-5');
        expect(result?.tmReused).toBe(true);
        expect(result?.validation.every((check) => check.pass)).toBe(true);
        const report = formatExplain(result!);
        expect(report).toContain('checkout.payNow');
        expect(report).toContain('Target: ja-JP');
        expect(report).toContain('CLEAN');
        expect(report).toContain('agent');
        expect(report).toContain('global@73aa');
        expect(report).toContain('ja-JP@7fc1');
        expect(report).toContain('openai:gpt-5');
        expect(report).toContain('exact reuse');
        expect(report).toContain('placeholders');
        expect(report).toContain('tr_01abc');
    });

    it('returns null for unknown keys', () => {
        expect(
            explainKey({
                keyPath: 'nope',
                locale: 'ja-JP',
                sourceLocale: 'en-GB',
                catalogId: 'main',
                sourceUnits: sourceUnits(),
                targets: [],
                revisions: [],
            })
        ).toBeNull();
    });
});

describe('cli-ux: doctor (U-T006/FR-004)', () => {
    function healthy() {
        return runDoctor({
            configValid: true,
            sourceFiles: ['locales/en-GB.json'],
            targets: [{ locale: 'fr-FR', found: true, path: 'locales/fr-FR.json' }],
            credentials: [{ provider: 'main', present: true, hint: '' }],
            registryPresent: true,
            registryReadable: true,
            registryDetail: '12 revisions indexed.',
            skills: [
                { id: 'global', scope: 'global', locales: [] },
                { id: 'ja-JP', scope: 'language', locales: ['ja-JP'] },
            ],
            skillWarnings: [],
            targetLocales: ['fr-FR'],
        });
    }

    it('healthy project is ready with skill notes', () => {
        const result = healthy();
        expect(result.ready).toBe(true);
        const report = formatDoctorReport(result);
        expect(report).toContain('✓ Source catalog detected');
        expect(report).toContain('✓ Provider credentials found');
        expect(report).toContain('✓ Registry readable');
        expect(report).toContain('ja-JP language skill');
        // fr-FR has no language skill: optional warning, still ready.
        expect(report).toContain('fr-FR has no language-specific skill');
        expect(report).toContain('Ready.');
    });

    it('missing credentials fail; missing skills only warn', () => {
        const noCreds = runDoctor({ ...healthyInput(), credentials: [{ provider: 'main', present: false, hint: 'set OPENAI_API_KEY' }] });
        expect(noCreds.ready).toBe(false);
        expect(formatDoctorReport(noCreds)).toContain('set OPENAI_API_KEY');

        const noSkills = runDoctor({ ...healthyInput(), skills: [] });
        expect(noSkills.ready).toBe(true);
        expect(formatDoctorReport(noSkills)).toContain('No project skills');

        const noConfig = runDoctor({
            configValid: false,
            configError: 'boom',
            sourceFiles: [],
            targets: [],
            credentials: [],
            registryPresent: false,
            registryReadable: false,
            registryDetail: '',
            skills: [],
            skillWarnings: [],
            targetLocales: [],
        });
        expect(noConfig.ready).toBe(false);
    });

    it('zero-match globs warn by name; matching globs stay silent (D-T005)', () => {
        const warned = runDoctor({
            ...healthyInput(),
            sourceKeys: ['auth.login', 'shop.buy'],
            reviewGlobs: ['legal.*'],
            targetOnlyGlobs: ['shop.*', 'nope.*'],
        });
        expect(warned.ready).toBe(true);
        const report = formatDoctorReport(warned);
        expect(report).toContain('legal.*');
        expect(report).toContain('nope.*');
        expect(report).not.toContain('shop.*');

        const silent = runDoctor({
            ...healthyInput(),
            sourceKeys: ['auth.login'],
            reviewGlobs: ['auth.*'],
            targetOnlyGlobs: [],
        });
        expect(formatDoctorReport(silent)).not.toContain('matches no source keys');

        const empty = runDoctor({ ...healthyInput(), sourceKeys: [], reviewGlobs: ['legal.*'] });
        expect(formatDoctorReport(empty)).not.toContain('matches no source keys');
    });

    function healthyInput() {
        return {
            configValid: true as const,
            sourceFiles: ['locales/en-GB.json'],
            targets: [{ locale: 'fr-FR', found: true, path: 'locales/fr-FR.json' }],
            credentials: [{ provider: 'main', present: true, hint: '' }],
            registryPresent: true,
            registryReadable: true,
            registryDetail: '12 revisions indexed.',
            skills: [
                { id: 'global', scope: 'global', locales: [] as string[] },
                { id: 'ja-JP', scope: 'language', locales: ['ja-JP'] },
            ],
            skillWarnings: [] as string[],
            targetLocales: ['fr-FR'],
        };
    }
});

describe('cli-ux: conflicts (U-T008)', () => {
    function contenders(): TranslationRevision[] {
        return [
            revision('auth.login', 'fr-FR', 'Se connecter', {
                id: 'tr_a',
                origin: 'human',
                sourceHash: 'src-1',
                createdAt: '2026-01-01T00:00:00.000Z',
            }),
            revision('auth.login', 'fr-FR', 'Connexion au compte', {
                id: 'tr_b',
                origin: 'human',
                sourceHash: 'src-1',
                targetHash: 'other-hash',
                createdAt: '2026-02-01T00:00:00.000Z',
            }),
        ];
    }

    it('detects competing human revisions, ignores agreement and agents', () => {
        const conflicts = detectConflicts(contenders());
        expect(conflicts).toHaveLength(1);
        expect(conflicts[0].keyPath).toBe('auth.login');
        expect(conflicts[0].options.map((option) => option.revisionId)).toEqual(['tr_a', 'tr_b']);

        const agreed = contenders().map((revision) => ({ ...revision, targetHash: 'same' }));
        expect(detectConflicts(agreed)).toEqual([]);
        expect(detectConflicts([revision('k', 'fr-FR', 't')])).toEqual([]);
    });

    it('renders semantically with a resolution prompt, never raw git', () => {
        const [view] = detectConflicts(contenders());
        const report = renderConflict(view, 'Se connecter');
        expect(report).toContain('Translation conflict');
        expect(report).toContain('auth.login / fr-FR');
        expect(report).toContain('Two human revisions exist');
        expect(report).toContain('Current file:');
        expect(report).toContain('Y confirm');
        expect(report).not.toMatch(/git|merge|HEAD|<<<<<<</i);
    });

    it('resolution parents both contenders as human origin', () => {
        const [view] = detectConflicts(contenders());
        const resolved = buildResolutionRevision({
            view,
            keepIndex: 0,
            sourceLocale: 'en-GB',
            catalogId: 'main',
            runId: 'run_r',
            createdAt: '2026-03-01T00:00:00.000Z',
        });
        expect(resolved.origin).toBe('human');
        expect(resolved.parentIds).toEqual(['tr_a', 'tr_b']);
        expect(resolved.targetHash).toBe(contenders()[0].targetHash);
    });
});

describe('cli-ux: v3 config schema', () => {
    function baseConfig() {
        return {
            sourceLanguage: 'en-GB',
            targetLanguages: [{ language: 'French', shortCode: 'fr' }],
            extractors: [{ type: 'json', pattern: './locales/en.json' }],
            providers: [{ name: 'main', type: 'openai', model: 'gpt-5' }],
        };
    }

    it('accepts skills/registry blocks and defaults them', () => {
        const parsed = safeValidateConfig({
            ...baseConfig(),
            skills: { dir: './mine/skills', paths: ['./docs/guide.md'] },
            registry: { dir: './mine/registry' },
        });
        expect(parsed.success).toBe(true);
        if (parsed.success) {
            expect(parsed.data.skills).toEqual({ dir: './mine/skills', paths: ['./docs/guide.md'] });
            expect(parsed.data.registry).toEqual({ dir: './mine/registry' });
        }
    });

    it('dropped registry keys (e.g. v3 remote) are stripped without error', () => {
        const parsed = safeValidateConfig({
            ...baseConfig(),
            registry: { dir: './mine/registry', remote: 'upstream' },
        });
        expect(parsed.success).toBe(true);
        if (parsed.success) {
            expect(parsed.data.registry).toEqual({ dir: './mine/registry' });
        }
    });

    it('legacy configs without v3 blocks still parse', () => {
        const parsed = safeValidateConfig(baseConfig());
        expect(parsed.success).toBe(true);
        if (parsed.success) {
            expect(parsed.data.skills).toBeUndefined();
            expect(parsed.data.registry).toBeUndefined();
        }
    });
});
