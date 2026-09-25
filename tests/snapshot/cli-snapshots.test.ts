import { describe, it, expect } from 'vitest';
import { adaptRuntimeEvent } from '../../src/core/events.js';
import type { RuntimeEvent } from '../../src/runtime/runtime.js';
import { ProgressRenderer } from '../../src/cli/renderer/progress.js';
import { buildRunReport } from '../../src/cli/renderer/json.js';
import { runCheck, formatCheckReport } from '../../src/cli/commands/check.js';
import { buildProvenanceStatus, formatProvenanceStatus } from '../../src/cli/commands/status.js';
import { runDoctor, formatDoctorReport } from '../../src/cli/commands/doctor.js';
import { explainKey, formatExplain } from '../../src/cli/commands/explain.js';
import { detectConflicts, renderConflict } from '../../src/cli/conflicts.js';
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

const UNITS = [unit('checkout.payNow', 'Pay now'), unit('auth.login', 'Log in')];
const TARGETS = [snapshot('fr-FR', { 'checkout.payNow': 'Payer', 'auth.login': 'Se connecter' })];
const REVISIONS: TranslationRevision[] = [
    {
        id: 'tr_01',
        catalogId: 'main',
        keyPath: 'checkout.payNow',
        sourceLocale: 'en-GB',
        targetLocale: 'fr-FR',
        sourceHash: computeHash('Pay now'),
        targetHash: computeHash('Payer'),
        origin: 'agent',
        parentIds: [],
        model: 'openai:gpt-5',
        skillFingerprints: [{ id: 'global', scope: 'global', fingerprint: '73aa000000000000000000000000000000000000000000000000000000000000' }],
        runId: 'run_1',
        createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
        id: 'tr_02',
        catalogId: 'main',
        keyPath: 'auth.login',
        sourceLocale: 'en-GB',
        targetLocale: 'fr-FR',
        sourceHash: computeHash('Log in'),
        targetHash: computeHash('Se connecter'),
        origin: 'human',
        parentIds: [],
        runId: 'run_1',
        createdAt: '2026-01-02T00:00:00.000Z',
    },
];

function renderProgress(): string {
    const lines: string[] = [];
    const renderer = new ProgressRenderer({ write: (line) => lines.push(line), tty: false });
    const stream: RuntimeEvent[] = [
        { type: 'run-started', runId: 'run_1', languages: ['fr-FR', 'de-DE'] },
        { type: 'language-started', locale: 'fr-FR' },
        { type: 'batch-started', locale: 'fr-FR', batchIndex: 0, unitIds: ['u-1', 'u-2'] },
        { type: 'batch-completed', locale: 'fr-FR', batchIndex: 0, translations: [{ unitId: 'u-1', text: 'Payer' }, { unitId: 'u-2', text: 'Se connecter' }] },
        { type: 'language-completed', locale: 'fr-FR', translated: 2 },
        { type: 'language-started', locale: 'de-DE' },
        { type: 'language-failed', locale: 'de-DE', failed: 2, error: 'worker exploded' },
        { type: 'run-completed', runId: 'run_1' },
    ];
    for (const event of stream) renderer.handle(adaptRuntimeEvent(event));
    renderer.summary(
        [
            { locale: 'fr-FR', status: 'complete', translated: 2, failed: 0, batches: 1, repairs: 0, reviews: 0 },
            { locale: 'de-DE', status: 'failed', translated: 0, failed: 2, batches: 1, repairs: 0, reviews: 0, error: 'worker exploded' },
        ],
        { tmReused: 3, filesUpdated: ['locales/fr-FR.json'] }
    );
    return lines.join('\n');
}

describe('snapshots: CLI golden outputs (K-T005)', () => {
    it('sync progress + completion table', () => {
        expect(renderProgress()).toMatchSnapshot();
    });

    it('check report (broken fixture)', () => {
        const result = runCheck({
            sourceLocale: 'en-GB',
            sourceUnits: UNITS,
            targets: [{ locale: 'fr-FR', entries: { 'auth.login': 'Se connecter' } }],
        });
        expect(formatCheckReport(result, ['fr-FR'])).toMatchSnapshot();
    });

    it('provenance status', () => {
        const status = buildProvenanceStatus({
            sourceLocale: 'en-GB',
            catalogId: 'main',
            sourceUnits: UNITS,
            targets: TARGETS,
            revisions: REVISIONS,
        });
        expect(formatProvenanceStatus(status)).toMatchSnapshot();
    });

    it('explain trace', () => {
        const result = explainKey({
            keyPath: 'checkout.payNow',
            locale: 'fr-FR',
            sourceLocale: 'en-GB',
            catalogId: 'main',
            sourceUnits: UNITS,
            targets: TARGETS,
            revisions: REVISIONS,
        });
        expect(result).not.toBeNull();
        expect(formatExplain(result!)).toMatchSnapshot();
    });

    it('doctor report', () => {
        const result = runDoctor({
            configValid: true,
            sourceFiles: ['locales/en-GB.json'],
            targets: [{ locale: 'fr-FR', found: true, path: 'locales/fr-FR.json' }],
            credentials: [{ provider: 'main', present: true, hint: '' }],
            registryPresent: true,
            registryReadable: true,
            registryDetail: '2 revisions indexed.',
            skills: [{ id: 'global', scope: 'global', locales: [] }],
            skillWarnings: [],
            targetLocales: ['fr-FR'],
        });
        expect(formatDoctorReport(result)).toMatchSnapshot();
    });

    it('conflict render', () => {
        const conflicts = detectConflicts([
            ...REVISIONS,
            {
                ...REVISIONS[1],
                id: 'tr_03',
                targetHash: computeHash('Connexion'),
                createdAt: '2026-03-01T00:00:00.000Z',
            },
        ]);
        expect(conflicts).toHaveLength(1);
        expect(renderConflict(conflicts[0], 'Se connecter')).toMatchSnapshot();
    });

    it('run report JSON', () => {
        const report = buildRunReport('run_1', [
            { locale: 'fr-FR', status: 'complete', translated: 2, failed: 0, batches: 1, repairs: 0, reviews: 0 },
            { locale: 'de-DE', status: 'failed', translated: 0, failed: 2, batches: 1, repairs: 0, reviews: 0, error: 'boom' },
        ]);
        expect(JSON.stringify(report, null, 2)).toMatchSnapshot();
    });
});
