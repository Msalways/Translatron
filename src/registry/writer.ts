/**
 * Immutable revision writer (Epic 012 — committed machine-owned folder).
 *
 * One `.trn` segment per successful/partial run, published under the sha256
 * of its canonical payload (identical to the stored checksum). Files are
 * never modified after creation — correction means a new segment with new
 * revisions. Republishing identical content is a no-op success (crash-safe
 * retries); same-name-different-content is impossible without a hash
 * collision and is refused as a backstop.
 */
import { mkdirSync, renameSync, unlinkSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TranslationRevision } from '../core/domain.js';
import {
    SEGMENT_FORMAT,
    SEGMENT_VERSION,
    SEGMENTS_DIR,
    checksumPayload,
    type RemovalRecord,
    type SegmentFile,
} from './schema.js';

export interface WriteSegmentInput {
    /** Machine-owned registry home (`.translatron/`); created if missing. */
    registryDir: string;
    runId: string;
    revisions: TranslationRevision[];
    /** Lineage tombstones for removed source keys (Epic 014, K5). */
    removals?: RemovalRecord[];
    createdAt?: string;
}

export interface WrittenSegment {
    fileName: string;
    filePath: string;
    revisionCount: number;
}

export function writeSegment(input: WriteSegmentInput): WrittenSegment {
    const createdAt = input.createdAt ?? new Date().toISOString();
    const payload = {
        format: SEGMENT_FORMAT,
        version: SEGMENT_VERSION,
        runId: input.runId,
        createdAt,
        revisions: input.revisions,
        ...(input.removals !== undefined && input.removals.length > 0 ? { removals: input.removals } : {}),
    };
    const file: SegmentFile = {
        ...payload,
        checksum: checksumPayload(payload),
    };
    // Validate before touching disk: a segment must record something.
    if (file.revisions.length === 0 && (file.removals ?? []).length === 0) {
        throw new Error('Refusing to write an empty registry segment');
    }
    const segmentsDir = join(input.registryDir, SEGMENTS_DIR);
    mkdirSync(segmentsDir, { recursive: true });
    // Content-hash name: identical content always yields the identical file.
    const fileName = `${file.checksum}.trn`;
    const filePath = join(segmentsDir, fileName);
    const serialized = JSON.stringify(file, null, 2);
    if (existsSync(filePath)) {
        const existing = readFileSync(filePath, 'utf-8');
        if (existing === serialized) {
            return { fileName, filePath, revisionCount: file.revisions.length };
        }
        throw new Error(
            `Segment hash collision with different content (possible tampering): ${fileName}`
        );
    }
    const tmpPath = `${filePath}.tmp`;
    try {
        writeFileSync(tmpPath, serialized, 'utf-8');
        renameSync(tmpPath, filePath);
    } catch (error) {
        if (existsSync(tmpPath)) unlinkSync(tmpPath);
        throw error;
    }
    return { fileName, filePath, revisionCount: file.revisions.length };
}
