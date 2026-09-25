/**
 * Registry reader + in-memory indexer (Epic 003).
 *
 * Builds identity → revision-graph from segment files. Local cache is
 * disposable: any parse/checksum failure quarantines the file (moved aside,
 * reported) and valid revisions stay queryable. Durable revisions are never
 * silently discarded.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import type { TranslationRevision } from '../core/domain.js';
import type { RemovalRecord } from './schema.js';
import {
    QUARANTINE_DIR,
    SEGMENTS_DIR,
    checksumPayload,
    identityKey,
    isContentHashStem,
    SegmentFileSchema,
} from './schema.js';

/** Newest-first revision list per identity. */
export type RevisionIndex = Map<string, TranslationRevision[]>;

export interface ReadRegistryInput {
    registryDir: string;
    /** When set, corrupt segments are moved here instead of only reported. */
    quarantineDir?: string;
}

export interface ReadRegistryResult {
    revisions: TranslationRevision[];
    index: RevisionIndex;
    /** Segment file names that failed verification. */
    quarantined: string[];
    /** Removal records aggregated across segments (replayed, never snapshotted). */
    removals: RemovalRecord[];
}

/** Sort newest-first (createdAt, id tiebreak — mirrors reconciler). */
export function sortNewestFirst(revisions: TranslationRevision[]): TranslationRevision[] {
    return [...revisions].sort((a, b) =>
        a.createdAt === b.createdAt
            ? (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
            : (a.createdAt < b.createdAt ? 1 : -1)
    );
}

export function buildIndex(revisions: TranslationRevision[]): RevisionIndex {
    const index: RevisionIndex = new Map();
    for (const rev of revisions) {
        const key = identityKey(rev.catalogId, rev.sourceLocale, rev.targetLocale, rev.keyPath);
        const list = index.get(key);
        if (list === undefined) index.set(key, [rev]);
        else list.push(rev);
    }
    for (const [key, list] of index) index.set(key, sortNewestFirst(list));
    return index;
}

/** Parse + verify one segment file. Returns revisions or throws. */
export function readSegmentFile(filePath: string): TranslationRevision[] {
    return readSegmentFileFull(filePath).revisions;
}

/** Parse + verify one segment file, including removal records. */
export function readSegmentFileFull(filePath: string): { revisions: TranslationRevision[]; removals: RemovalRecord[] } {
    const raw = readFileSync(filePath, 'utf-8');
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        throw new Error(`Segment is not valid JSON: ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const file = SegmentFileSchema.parse(parsed);
    const { checksum, ...payload } = file;
    const recomputed = checksumPayload(payload);
    if (recomputed !== checksum) {
        throw new Error(`Segment checksum mismatch: ${filePath}`);
    }
    // Content-hash names are tamper-evident: the name MUST equal the payload
    // hash. Legacy timestamp names fall back to checksum-only verification.
    const stem = filePath.split(/[\\/]/).pop()?.replace(/\.trn$/, '') ?? '';
    if (isContentHashStem(stem) && stem !== recomputed) {
        throw new Error(`Segment filename does not match payload hash (possible tampering): ${filePath}`);
    }
    return { revisions: file.revisions, removals: file.removals ?? [] };
}

export type SeenRevisionIds = Map<string, { hash: string; file: string }>;

/**
 * Identity policing across segments: identical IDs dedupe silently (same
 * content published twice collapses, e.g. after merges); conflicting IDs
 * throw naming the ID and both files — never silently merged.
 */
export function checkRevisionConflicts(
    revisions: TranslationRevision[],
    fileName: string,
    seenById: SeenRevisionIds
): void {
    for (const revision of revisions) {
        const seen = seenById.get(revision.id);
        if (seen !== undefined && seen.hash !== checksumPayload({ ...revision } as Record<string, unknown>)) {
            throw new Error(`Conflicting content for revision ${revision.id}: ${seen.file} vs ${fileName}`);
        }
    }
}

/** Record revisions known-good (call only after checkRevisionConflicts passes). */
export function trackRevisionIds(
    revisions: TranslationRevision[],
    fileName: string,
    seenById: SeenRevisionIds
): TranslationRevision[] {
    const fresh: TranslationRevision[] = [];
    for (const revision of revisions) {
        if (!seenById.has(revision.id)) {
            seenById.set(revision.id, {
                hash: checksumPayload({ ...revision } as Record<string, unknown>),
                file: fileName,
            });
            fresh.push(revision);
        }
    }
    return fresh;
}

export function readRegistry(input: ReadRegistryInput): ReadRegistryResult {
    const segmentsDir = join(input.registryDir, SEGMENTS_DIR);
    const revisions: TranslationRevision[] = [];
    const quarantined: string[] = [];
    const removals: RemovalRecord[] = [];
    if (!existsSync(segmentsDir)) {
        return { revisions, index: new Map(), quarantined, removals };
    }
    // Revision identity policing: identical IDs dedupe silently (same content
    // published twice collapses, e.g. after merges); conflicting IDs fail
    // closed naming both files — never silently merged.
    const seenById: SeenRevisionIds = new Map();
    const files = readdirSync(segmentsDir).filter((f) => f.endsWith('.trn')).sort();
    for (const fileName of files) {
        const filePath = join(segmentsDir, fileName);
        try {
            const parsed = readSegmentFileFull(filePath);
            checkRevisionConflicts(parsed.revisions, fileName, seenById);
            revisions.push(...trackRevisionIds(parsed.revisions, fileName, seenById));
            removals.push(...parsed.removals);
        } catch {
            quarantined.push(fileName);
            if (input.quarantineDir !== undefined) {
                mkdirSync(input.quarantineDir, { recursive: true });
                renameSync(filePath, join(input.quarantineDir, `${fileName}.corrupt`));
            }
        }
    }
    return { revisions, index: buildIndex(revisions), quarantined, removals };
}

/** Default quarantine location inside the registry dir. */
export function defaultQuarantineDir(registryDir: string): string {
    return join(registryDir, QUARANTINE_DIR);
}
