import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRegistry, buildIndex, defaultQuarantineDir, checkRevisionConflicts, trackRevisionIds } from '../../src/registry/reader.js';
import { writeSegment } from '../../src/registry/writer.js';
import { writeSnapshot, readSnapshotFile } from '../../src/registry/snapshot.js';
import type { TranslationRevision } from '../../src/core/domain.js';

function rev(id: string, keyPath: string, targetLocale = 'fr-FR', createdAt = '2026-01-01T00:00:00.000Z'): TranslationRevision {
    return {
        id,
        catalogId: 'main',
        keyPath,
        sourceLocale: 'en-GB',
        targetLocale,
        sourceHash: 'src-1',
        targetHash: `tgt-${id}`,
        origin: 'agent',
        parentIds: [],
        runId: 'run_1',
        createdAt,
    };
}

describe('registry: writer + reader round-trip (B-T002)', () => {
    let dir: string;
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'trn-reg-'));
    });
    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    it('writes one immutable segment per run and reads it back', () => {
        const written = writeSegment({ registryDir: dir, runId: 'run_abc', revisions: [rev('tr-1', 'a.b')] });
        expect(written.fileName).toMatch(/^[0-9a-f]{64}\.trn$/);
        expect(existsSync(written.filePath)).toBe(true);
        const { revisions, index, quarantined } = readRegistry({ registryDir: dir });
        expect(quarantined).toEqual([]);
        expect(revisions).toHaveLength(1);
        expect(index.get('mainen-GBfr-FRa.b')?.[0].id).toBe('tr-1');
    });

    it('refuses empty segments; identical republishes are idempotent', () => {
        expect(() => writeSegment({ registryDir: dir, runId: 'run_x', revisions: [] })).toThrow(/empty/);
        const first = writeSegment({
            registryDir: dir,
            runId: 'run_dup',
            revisions: [rev('tr-1', 'a')],
            createdAt: '2026-01-01T00:00:00.000Z',
        });
        const second = writeSegment({
            registryDir: dir,
            runId: 'run_dup',
            revisions: [rev('tr-1', 'a')],
            createdAt: '2026-01-01T00:00:00.000Z',
        });
        expect(second.fileName).toBe(first.fileName);
        expect(readRegistry({ registryDir: dir }).revisions).toHaveLength(1);
    });

    it('indexes newest-first across segments', () => {
        writeSegment({ registryDir: dir, runId: 'run-1', revisions: [rev('tr-old', 'a', 'fr-FR', '2026-01-01T00:00:00.000Z')], createdAt: '2026-01-01T00:00:00.000Z' });
        writeSegment({ registryDir: dir, runId: 'run-2', revisions: [rev('tr-new', 'a', 'fr-FR', '2026-02-01T00:00:00.000Z')], createdAt: '2026-02-01T00:00:00.000Z' });
        const { index } = readRegistry({ registryDir: dir });
        expect(index.get('mainen-GBfr-FRa')?.map((r) => r.id)).toEqual(['tr-new', 'tr-old']);
    });

    it('quarantines corrupt segments, keeps valid revisions (B-T008)', () => {
        writeSegment({ registryDir: dir, runId: 'run-good', revisions: [rev('tr-1', 'a')] });
        writeFileSync(join(dir, 'segments', 'bad.trn'), '{not json', 'utf-8');
        writeFileSync(join(dir, 'segments', 'tampered.trn'), JSON.stringify({ format: 'x' }), 'utf-8');
        const quarantine = defaultQuarantineDir(dir);
        const { revisions, quarantined } = readRegistry({ registryDir: dir, quarantineDir: quarantine });
        expect(quarantined.sort()).toEqual(['bad.trn', 'tampered.trn']);
        expect(revisions).toHaveLength(1);
        expect(readdirSync(quarantine).sort()).toEqual(['bad.trn.corrupt', 'tampered.trn.corrupt']);
    });

    it('returns empty index for a fresh dir', () => {
        const { revisions, quarantined } = readRegistry({ registryDir: dir });
        expect(revisions).toEqual([]);
        expect(quarantined).toEqual([]);
    });

    it('verifies content-hash names; legacy timestamp names use checksum-only', () => {
        const written = writeSegment({ registryDir: dir, runId: 'run-hash', revisions: [rev('tr-1', 'a')] });
        // Renamed to a wrong hash → integrity failure.
        const wrongName = join(dir, 'segments', `${'0'.repeat(64)}.trn`);
        writeFileSync(wrongName, readFileSync(written.filePath, 'utf-8'));
        rmSync(written.filePath);
        const renamed = readRegistry({ registryDir: dir });
        expect(renamed.quarantined).toEqual([`${'0'.repeat(64)}.trn`]);
        expect(renamed.revisions).toEqual([]);
    });

    it('dedupes identical revision IDs; conflicting IDs fail naming both', () => {
        const at = '2026-01-01T00:00:00.000Z';
        // Same revision published under two run IDs (e.g., both branches
        // synced the same key): two files, one revision after indexing.
        const first = writeSegment({ registryDir: dir, runId: 'run-1', revisions: [rev('tr-dup', 'a')], createdAt: at });
        const second = writeSegment({ registryDir: dir, runId: 'run-2', revisions: [rev('tr-dup', 'a')], createdAt: at });
        expect(second.fileName).not.toBe(first.fileName);
        expect(readRegistry({ registryDir: dir }).revisions).toHaveLength(1);

        // Same ID, different content in a second file → integrity error naming the ID.
        const seen = new Map();
        const base = [rev('tr-dup', 'a')];
        checkRevisionConflicts(base, first.fileName, seen);
        trackRevisionIds(base, first.fileName, seen);
        const other = [{ ...rev('tr-dup', 'a'), targetHash: 'tampered' }];
        expect(() => checkRevisionConflicts(other, 'other.trn', seen)).toThrow(/tr-dup.*other\.trn/);
    });
});

describe('registry: snapshot (B-T008)', () => {
    let dir: string;
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'trn-snap-'));
    });
    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    it('compacts to latest-per-identity and verifies', () => {
        const s1 = writeSegment({ registryDir: dir, runId: 'run-1', revisions: [rev('tr-old', 'a'), rev('tr-b', 'b')], createdAt: '2026-01-01T00:00:00.000Z' });
        const s2 = writeSegment({ registryDir: dir, runId: 'run-2', revisions: [rev('tr-new', 'a', 'fr-FR', '2026-02-01T00:00:00.000Z')], createdAt: '2026-02-01T00:00:00.000Z' });
        const { index } = readRegistry({ registryDir: dir });
        const built = writeSnapshot({ registryDir: dir, baseSegments: [s1.fileName, s2.fileName], index });
        expect(built.identityCount).toBe(2);
        const snap = readSnapshotFile(built.filePath);
        expect(Object.values(snap.heads).sort()).toEqual(['tr-b', 'tr-new']);
    });

    it('rejects tampered snapshots', () => {
        writeSegment({ registryDir: dir, runId: 'run-1', revisions: [rev('tr-1', 'a')], createdAt: '2026-01-01T00:00:00.000Z' });
        const { index } = readRegistry({ registryDir: dir });
        const built = writeSnapshot({ registryDir: dir, baseSegments: ['x.trn'], index });
        const tampered = { ...JSON.parse(readFileSync(built.filePath, 'utf-8')) };
        tampered.heads = {};
        writeFileSync(built.filePath, JSON.stringify(tampered), 'utf-8');
        expect(() => readSnapshotFile(built.filePath)).toThrow();
    });

    it('buildIndex sorts newest-first with id tiebreak', () => {
        const a = rev('tr-a', 'k', 'fr-FR', '2026-01-01T00:00:00.000Z');
        const b = rev('tr-b', 'k', 'fr-FR', '2026-01-01T00:00:00.000Z');
        expect(buildIndex([a, b]).get('mainen-GBfr-FRk')?.map((r) => r.id)).toEqual(['tr-b', 'tr-a']);
    });
});
