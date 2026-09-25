import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reconcile } from '../../src/core/reconciler.js';
import { readRegistry } from '../../src/registry/reader.js';
import { writeSegment } from '../../src/registry/writer.js';
import { buildResolutionRevision, detectConflicts } from '../../src/cli/conflicts.js';
import type { SourceUnit, TargetSnapshot, TranslationRevision } from '../../src/core/domain.js';
import { computeHash } from '../../src/utils/hash.js';

let dir: string;
beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'trn-risk-'));
});
afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});

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

function humanRev(id: string, keyPath: string, text: string, createdAt: string): TranslationRevision {
    return {
        id,
        catalogId: 'main',
        keyPath,
        sourceLocale: 'en-GB',
        targetLocale: 'fr-FR',
        sourceHash: computeHash('Log in'),
        targetHash: computeHash(text),
        origin: 'human',
        parentIds: [],
        runId: 'run_human',
        createdAt,
    };
}

describe('risk: divergent human edits resolve end-to-end (K-T001)', () => {
    it('detect → CONFLICT → resolve → write → clear, with full parentage', () => {
        const units = [unit('auth.login', 'Log in')];
        const targets = [snapshot('fr-FR', { 'auth.login': 'Se connecter' })];
        const contenders = [
            humanRev('tr_a', 'auth.login', 'Se connecter', '2026-01-01T00:00:00.000Z'),
            humanRev('tr_b', 'auth.login', 'Connexion au compte', '2026-02-01T00:00:00.000Z'),
        ];
        writeSegment({ registryDir: dir, runId: 'run_human', revisions: contenders });

        // Two humans disagree: detection fires…
        const before = readRegistry({ registryDir: dir });
        const conflicts = detectConflicts(before.revisions);
        expect(conflicts).toHaveLength(1);

        // …the reconciler reports CONFLICT (never silently picks)…
        const { reconciled } = reconcile({
            sourceLocale: 'en-GB',
            catalogId: 'main',
            sourceUnits: units,
            targets,
            revisions: before.revisions,
            conflictKeys: new Set(conflicts.map((c) => `${c.locale}${c.keyPath}`)),
        });
        expect(reconciled[0].status).toBe('CONFLICT');

        // …resolution parents both contenders…
        const resolution = buildResolutionRevision({
            view: conflicts[0],
            keepIndex: 0,
            sourceLocale: 'en-GB',
            catalogId: 'main',
            runId: 'run_resolve',
            createdAt: '2026-03-01T00:00:00.000Z',
        });
        expect(resolution.parentIds).toEqual(['tr_a', 'tr_b']);
        writeSegment({ registryDir: dir, runId: 'run_resolve', revisions: [resolution] });

        // …and re-reading clears the conflict with no revision lost.
        const after = readRegistry({ registryDir: dir });
        expect(detectConflicts(after.revisions)).toEqual([]);
        expect(after.revisions.map((r) => r.id).sort()).toEqual([resolution.id, 'tr_a', 'tr_b'].sort());
    });
});

describe('risk: concurrent segment writers (K-T001)', () => {
    function rev(id: string, keyPath: string, runId: string): TranslationRevision {
        return {
            id,
            catalogId: 'main',
            keyPath,
            sourceLocale: 'en-GB',
            targetLocale: 'fr-FR',
            sourceHash: 'src-1',
            targetHash: `tgt-${id}`,
            origin: 'agent',
            parentIds: [],
            runId,
            createdAt: '2026-01-01T00:00:00.000Z',
        };
    }

    it('interleaved runs persist every revision', async () => {
        const writes = Array.from({ length: 5 }, (_, run) =>
            Promise.resolve().then(() =>
                writeSegment({
                    registryDir: dir,
                    runId: `run-${run}`,
                    revisions: [rev(`tr-${run}-a`, `k.${run}.a`, `run-${run}`), rev(`tr-${run}-b`, `k.${run}.b`, `run-${run}`)],
                })
            )
        );
        const written = await Promise.all(writes);
        expect(new Set(written.map((w) => w.fileName)).size).toBe(5);
        const { revisions, quarantined } = readRegistry({ registryDir: dir });
        expect(quarantined).toEqual([]);
        expect(revisions).toHaveLength(10);
    });

    it('identical republishes collapse; distinct content never collides', () => {
        const at = '2026-01-01T00:00:00.000Z';
        const first = writeSegment({
            registryDir: dir,
            runId: 'run-dup',
            revisions: [rev('tr-1', 'k', 'run-dup')],
            createdAt: at,
        });
        const second = writeSegment({
            registryDir: dir,
            runId: 'run-dup',
            revisions: [rev('tr-1', 'k', 'run-dup')],
            createdAt: at,
        });
        expect(second.fileName).toBe(first.fileName);
        // Different content always yields a different name (no clobber path):
        // same-name-different-content requires a sha256 collision.
        const third = writeSegment({
            registryDir: dir,
            runId: 'run-dup',
            revisions: [rev('tr-2', 'k', 'run-dup')],
            createdAt: at,
        });
        expect(third.fileName).not.toBe(first.fileName);
        expect(readRegistry({ registryDir: dir }).revisions).toHaveLength(2);
    });
});

describe('risk: source change after manual override (K-T002)', () => {
    it('human ownership wins over staleness (MANUAL, never auto-touch)', () => {
        const units = [unit('cta.buy', 'Buy now, today')];
        const targets = [snapshot('fr-FR', { 'cta.buy': 'human-touched-text' })];
        const revisions: TranslationRevision[] = [
            {
                id: 'tr_agent',
                catalogId: 'main',
                keyPath: 'cta.buy',
                sourceLocale: 'en-GB',
                targetLocale: 'fr-FR',
                sourceHash: computeHash('Buy now'),
                targetHash: computeHash('Achetez'),
                origin: 'agent',
                parentIds: [],
                runId: 'run_1',
                createdAt: '2026-01-01T00:00:00.000Z',
            },
        ];
        const { reconciled, workUnits } = reconcile({
            sourceLocale: 'en-GB',
            catalogId: 'main',
            sourceUnits: units,
            targets,
            revisions,
        });
        // Source changed AND target diverges from the agent baseline: MANUAL dominates.
        expect(reconciled[0].status).toBe('MANUAL');
        expect(workUnits).toEqual([]);
    });
});
