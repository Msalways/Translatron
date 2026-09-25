import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSegment } from '../../src/registry/writer.js';
import { readRegistry, buildIndex } from '../../src/registry/reader.js';
import { writeSnapshot } from '../../src/registry/snapshot.js';
import { checksumPayload } from '../../src/registry/schema.js';
import { verifyRegistry } from '../../src/cli/registry/verify.js';
import { repairRegistry } from '../../src/cli/registry/repair.js';
import { registryStatus } from '../../src/cli/registry/status.js';
import { registryCommand } from '../../src/cli/registry/index.js';
import type { TranslationRevision } from '../../src/core/domain.js';

let dir: string;
beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'trn-maint-'));
});
afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});

function rev(id: string, keyPath: string, targetHash = `tgt-${id}`): TranslationRevision {
    return {
        id,
        catalogId: 'main',
        keyPath,
        sourceLocale: 'en-GB',
        targetLocale: 'fr-FR',
        sourceHash: 'src-1',
        targetHash,
        origin: 'agent',
        parentIds: [],
        runId: 'run_1',
        createdAt: '2026-01-01T00:00:00.000Z',
    };
}

function segFiles(): string[] {
    const d = join(dir, 'segments');
    if (!existsSync(d)) return [];
    return readdirSync(d).filter((f) => f.endsWith('.trn')).sort();
}

describe('registry-maintenance: verify matrix (M-T001)', () => {
    it('clean registry verifies with counts', () => {
        writeSegment({ registryDir: dir, runId: 'run-1', revisions: [rev('tr-1', 'a')] });
        const report = verifyRegistry(dir);
        expect(report.present).toBe(true);
        expect(report.ok).toBe(true);
        expect(report.segmentCount).toBe(1);
        expect(report.verdicts).toEqual([{ file: expect.stringMatching(/^[0-9a-f]{64}\.trn$/), kind: 'segment', ok: true, errors: [] }]);
    });

    it('absent home is a verdict, not a crash', () => {
        const report = verifyRegistry(join(dir, 'nowhere'));
        expect(report.present).toBe(false);
        expect(report.ok).toBe(false);
    });

    it('tampered content fails checksum; renamed file fails name-hash', () => {
        const written = writeSegment({ registryDir: dir, runId: 'run-1', revisions: [rev('tr-1', 'a')] });
        const raw = readFileSync(written.filePath, 'utf-8');
        // Tamper inside the body (trailing whitespace would still parse).
        writeFileSync(written.filePath, raw.replace('tgt-tr-1', 'tgt-tr-X'), 'utf-8');
        const other = writeSegment({ registryDir: dir, runId: 'run-2', revisions: [rev('tr-2', 'b')] });
        const wrongName = join(dir, 'segments', `${'0'.repeat(64)}.trn`);
        writeFileSync(wrongName, readFileSync(other.filePath, 'utf-8'));
        rmSync(other.filePath);
        const report = verifyRegistry(dir);
        expect(report.ok).toBe(false);
        const byFile = new Map(report.verdicts.map((v) => [v.file, v]));
        expect(byFile.get(written.fileName)?.ok).toBe(false);
        expect(byFile.get(written.fileName)?.errors.join(' ')).toMatch(/checksum/i);
        expect(byFile.get(`${'0'.repeat(64)}.trn`)?.ok).toBe(false);
        expect(byFile.get(`${'0'.repeat(64)}.trn`)?.errors.join(' ')).toMatch(/filename|payload hash/i);
    });

    it('conflicting revision IDs fail naming both files', () => {
        writeSegment({ registryDir: dir, runId: 'run-1', revisions: [rev('tr-dup', 'a', 'hash-A')] });
        writeSegment({ registryDir: dir, runId: 'run-2', revisions: [rev('tr-dup', 'a', 'hash-B')] });
        const report = verifyRegistry(dir);
        expect(report.ok).toBe(false);
        expect(report.idConflicts).toHaveLength(1);
        expect(report.idConflicts[0].revisionId).toBe('tr-dup');
        expect(report.idConflicts[0].files).toHaveLength(2);
    });

    it('legacy timestamp names verify checksum-only', () => {
        const written = writeSegment({ registryDir: dir, runId: 'run-1', revisions: [rev('tr-1', 'a')] });
        const legacyName = join(dir, 'segments', '20200101T000000Z-run-1.trn');
        writeFileSync(legacyName, readFileSync(written.filePath, 'utf-8'));
        rmSync(written.filePath);
        const report = verifyRegistry(dir);
        expect(report.ok).toBe(true);
    });

    it('disagreeing snapshot heads fail verification', () => {
        const s1 = writeSegment({ registryDir: dir, runId: 'run-1', revisions: [rev('tr-1', 'a')] });
        const { index } = readRegistry({ registryDir: dir });
        const built = writeSnapshot({ registryDir: dir, baseSegments: [s1.fileName], index });
        const parsed = JSON.parse(readFileSync(built.filePath, 'utf-8')) as Record<string, unknown>;
        (parsed['heads'] as Record<string, string>)[Object.keys(parsed['heads'] as object)[0]] = 'tr_other';
        const { checksum: _dropped, ...payload } = parsed;
        void _dropped;
        (parsed as Record<string, unknown>)['checksum'] = checksumPayload(payload);
        writeFileSync(built.filePath, JSON.stringify(parsed), 'utf-8');
        const report = verifyRegistry(dir);
        expect(report.ok).toBe(false);
        expect(report.verdicts.find((v) => v.kind === 'snapshot')?.ok).toBe(false);
    });
});

describe('registry-maintenance: repair E2E (M-T002)', () => {
    it('quarantines corrupt files, preserves queryable history', () => {
        const good = writeSegment({ registryDir: dir, runId: 'run-1', revisions: [rev('tr-1', 'a')] });
        const raw = readFileSync(good.filePath, 'utf-8');
        writeFileSync(good.filePath, raw.replace('tgt-tr-1', 'tgt-tr-X'), 'utf-8');
        writeSegment({ registryDir: dir, runId: 'run-2', revisions: [rev('tr-2', 'b')] });
        const outcome = repairRegistry(dir);
        expect(outcome.quarantined).toHaveLength(1);
        expect(outcome.cleanAfter).toBe(true);
        expect(outcome.validRevisions).toBe(1);
        expect(existsSync(join(dir, 'quarantine', `${outcome.quarantined[0]}.corrupt`))).toBe(true);
        // History preserved: the valid revision is still queryable.
        expect(readRegistry({ registryDir: dir }).revisions.map((r) => r.id)).toEqual(['tr-2']);
        expect(verifyRegistry(dir).ok).toBe(true);
    });

    it('clean registry repairs nothing and changes nothing', () => {
        writeSegment({ registryDir: dir, runId: 'run-1', revisions: [rev('tr-1', 'a')] });
        const before = segFiles();
        const outcome = repairRegistry(dir);
        expect(outcome.quarantined).toEqual([]);
        expect(outcome.cleanAfter).toBe(true);
        expect(segFiles()).toEqual(before);
    });
});

describe('registry-maintenance: status + command surface (M-T003)', () => {
    it('status counts match the reader exactly', () => {
        expect(registryStatus(join(dir, 'nowhere')).present).toBe(false);
        writeSegment({ registryDir: dir, runId: 'run-1', revisions: [rev('tr-1', 'a')] });
        const loaded = readRegistry({ registryDir: dir });
        const status = registryStatus(dir);
        expect(status.present).toBe(true);
        expect(status.segments).toBe(1);
        expect(status.revisions).toBe(loaded.revisions.length);
        expect(status.removals).toBe(loaded.removals.length);
    });

    it('command group exposes exactly status/verify/repair (no edit, no sync)', () => {
        const names = (registryCommand.commands ?? []).map((c) => c.name()).sort();
        expect(names).toEqual(['repair', 'status', 'verify']);
    });
});
