/**
 * Snapshot / compaction (Epic 003).
 *
 * A snapshot records the latest revision per identity plus the segment files
 * it covers, so fresh clones can index without replaying full history.
 * Snapshots never replace segments; compaction only *adds* a snapshot file.
 * Verification recomputes heads — a snapshot that disagrees is rejected.
 */
import { mkdirSync, renameSync, unlinkSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TranslationRevision } from '../core/domain.js';
import type { RevisionIndex } from './reader.js';
import {
    SNAPSHOT_FORMAT,
    SNAPSHOT_VERSION,
    SNAPSHOTS_DIR,
    checksumPayload,
    identityKey,
    SnapshotFileSchema,
    type SnapshotFile,
} from './schema.js';

export interface BuildSnapshotInput {
    registryDir: string;
    /** Segment file names covered by this snapshot. */
    baseSegments: string[];
    index: RevisionIndex;
    createdAt?: string;
}

export interface BuiltSnapshot {
    fileName: string;
    filePath: string;
    identityCount: number;
}

/** Latest revision per identity (index lists are newest-first). */
export function snapshotRevisions(index: RevisionIndex): TranslationRevision[] {
    const out: TranslationRevision[] = [];
    for (const list of index.values()) {
        const head = list[0];
        if (head !== undefined) out.push(head);
    }
    return out.sort((a, b) =>
        identityKey(a.catalogId, a.sourceLocale, a.targetLocale, a.keyPath) <
        identityKey(b.catalogId, b.sourceLocale, b.targetLocale, b.keyPath)
            ? -1
            : 1
    );
}

export function writeSnapshot(input: BuildSnapshotInput): BuiltSnapshot {
    const createdAt = input.createdAt ?? new Date().toISOString();
    const revisions = snapshotRevisions(input.index);
    if (revisions.length === 0) {
        throw new Error('Refusing to write an empty registry snapshot');
    }
    const heads: Record<string, string> = {};
    for (const rev of revisions) {
        heads[identityKey(rev.catalogId, rev.sourceLocale, rev.targetLocale, rev.keyPath)] = rev.id;
    }
    const payload = {
        format: SNAPSHOT_FORMAT,
        version: SNAPSHOT_VERSION,
        createdAt,
        baseSegments: [...input.baseSegments].sort(),
        heads,
        revisions,
    };
    const file: SnapshotFile = { ...payload, checksum: checksumPayload(payload) };
    const dir = join(input.registryDir, SNAPSHOTS_DIR);
    mkdirSync(dir, { recursive: true });
    // Content-hash name, same scheme as segments.
    const fileName = `${file.checksum}.trnsnapshot`;
    const filePath = join(dir, fileName);
    const tmpPath = `${filePath}.tmp`;
    try {
        writeFileSync(tmpPath, JSON.stringify(file, null, 2), 'utf-8');
        renameSync(tmpPath, filePath);
    } catch (error) {
        if (existsSync(tmpPath)) unlinkSync(tmpPath);
        throw error;
    }
    return { fileName, filePath, identityCount: revisions.length };
}

/** Parse + verify a snapshot file; throws on any disagreement. */
export function readSnapshotFile(filePath: string): SnapshotFile {
    const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf-8'));
    const file = SnapshotFileSchema.parse(parsed);
    const { checksum, ...payload } = file;
    if (checksumPayload(payload) !== checksum) {
        throw new Error(`Snapshot checksum mismatch: ${filePath}`);
    }
    const recomputed: Record<string, string> = {};
    for (const rev of file.revisions) {
        recomputed[identityKey(rev.catalogId, rev.sourceLocale, rev.targetLocale, rev.keyPath)] = rev.id;
    }
    const expected = Object.keys(file.heads).sort();
    const actual = Object.keys(recomputed).sort();
    if (JSON.stringify(expected) !== JSON.stringify(actual) ||
        expected.some((k) => file.heads[k] !== recomputed[k])) {
        throw new Error(`Snapshot heads disagree with revisions: ${filePath}`);
    }
    return file;
}
