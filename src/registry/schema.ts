/**
 * Registry format schemas (Epic 012 — committed machine-owned folder).
 *
 * Canonical v3 state lives in `.translatron/` (committed, machine-owned):
 *   segments/<sha256>.trn            — one immutable file per run (append-only)
 *   snapshots/<sha256>.trnsnapshot   — periodic compaction (latest revision per identity)
 *   meta.json                        — static bootstrap facts (never updated)
 *   cache/                           — disposable local index (git-ignored, never truth)
 *   quarantine/*                     — corrupt segments moved aside, never deleted silently
 *
 * File names ARE the sha256 of the canonical payload (identical to the stored
 * checksum): same content always yields the same file, so branch merges can
 * never conflict. Every file carries a sha256 checksum over its canonical payload.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { TranslationRevisionSchema } from '../core/domain.js';

export const SEGMENTS_DIR = 'segments';
export const SNAPSHOTS_DIR = 'snapshots';
export const QUARANTINE_DIR = 'quarantine';

export const SEGMENT_FORMAT = 'translatron-registry-segment' as const;
export const SNAPSHOT_FORMAT = 'translatron-registry-snapshot' as const;
export const SEGMENT_VERSION = 1 as const;
export const SNAPSHOT_VERSION = 1 as const;

/** Per-key lineage tombstone (Epic 014, K5): no target hash to record, so this
 * rides in the segment payload rather than the revisions list. */
export const RemovalRecordSchema = z.object({
    catalogId: z.string().min(1),
    keyPath: z.string().min(1),
    sourceLocale: z.string().min(2),
    previousSourceHash: z.string().min(1),
    runId: z.string().min(1),
    createdAt: z.string().datetime(),
});

export type RemovalRecord = z.infer<typeof RemovalRecordSchema>;

/** Canonical payload of one run segment (checksum computed over this). */
export const SegmentPayloadSchema = z.object({
    format: z.literal(SEGMENT_FORMAT),
    version: z.literal(SEGMENT_VERSION),
    runId: z.string().min(1),
    createdAt: z.string().datetime(),
    revisions: z.array(TranslationRevisionSchema),
    removals: z.array(RemovalRecordSchema).optional(),
});

export type SegmentPayload = z.infer<typeof SegmentPayloadSchema>;

/** On-disk segment = payload + checksum. */
export const SegmentFileSchema = SegmentPayloadSchema.extend({
    checksum: z.string().length(64),
});

export type SegmentFile = z.infer<typeof SegmentFileSchema>;

/** Compacted snapshot: latest revision per identity + covered segments. */
export const SnapshotPayloadSchema = z.object({
    format: z.literal(SNAPSHOT_FORMAT),
    version: z.literal(SNAPSHOT_VERSION),
    createdAt: z.string().datetime(),
    baseSegments: z.array(z.string()),
    heads: z.record(z.string(), z.string()),
    revisions: z.array(TranslationRevisionSchema),
});

export type SnapshotPayload = z.infer<typeof SnapshotPayloadSchema>;

export const SnapshotFileSchema = SnapshotPayloadSchema.extend({
    checksum: z.string().length(64),
});

export type SnapshotFile = z.infer<typeof SnapshotFileSchema>;

/**
 * Deterministic JSON: object keys sorted recursively, arrays keep order.
 * Checksums MUST use this — plain stringify is key-order fragile (zod
 * `.extend()` reorders keys on parse, which would break verification).
 */
export function stableStringify(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(',')}]`;
    }
    if (value !== null && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
        return `{${entries.join(',')}}`;
    }
    return JSON.stringify(value) ?? 'null';
}

/**
 * sha256 over canonical JSON. Key order is fixed because payloads are
 * constructed literally in schema order — do not reorder fields.
 */
export function checksumPayload(payload: Record<string, unknown>): string {
    return createHash('sha256').update(stableStringify(payload), 'utf8').digest('hex');
}

/** Stable identity key: catalog + locales + key path. */
export function identityKey(catalogId: string, sourceLocale: string, targetLocale: string, keyPath: string): string {
    return `${catalogId}${sourceLocale}${targetLocale}${keyPath}`;
}

/** Content-hash file stems are 64 lowercase hex chars (extension excluded). */
export function isContentHashStem(stem: string): boolean {
    return /^[0-9a-f]{64}$/.test(stem);
}
