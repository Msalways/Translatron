/**
 * v2 → v3 migration runner (Epic 004).
 *
 * Dry run by default (zero writes). `--apply` writes exactly one registry
 * segment, re-reads it for validation, and only then reports success. The v2
 * SQLite file is never modified or deleted — it stays as the backup.
 */
import type { TranslationRevision } from '../core/domain.js';
import { readRegistry } from '../registry/reader.js';
import { writeSegment } from '../registry/writer.js';
import { classifyLegacy, type ClassifyInput } from './classifier.js';

export interface MigrationReport {
    migrationRunId: string;
    sourceKeys: number;
    translations: number;
    agent: number;
    human: number;
    imported: number;
    failed: number;
    missing: number;
    mismatches: Array<{ keyPath: string; locale: string; detail: string }>;
    applied: boolean;
    segmentFile?: string;
    registryRevisions?: number;
}

export interface MigrateInput extends Omit<ClassifyInput, 'migrationRunId' | 'migratedAt'> {
    registryDir: string;
    migrationRunId: string;
    migratedAt: string;
}

/** Dry run: classify everything, change nothing. */
export function dryRunMigration(input: MigrateInput): MigrationReport {
    const result = classifyLegacy(input);
    const withRevisions = result.items.filter((i) => i.revision !== undefined).length;
    return {
        migrationRunId: input.migrationRunId,
        sourceKeys: input.sourceUnits.length,
        translations: withRevisions,
        agent: result.counts.agent,
        human: result.counts.human,
        imported: result.counts.imported,
        failed: result.counts.failed,
        missing: result.counts.missing,
        mismatches: result.mismatches,
        applied: false,
    };
}

/** Apply: write one segment, validate by re-reading, then report. */
export function applyMigration(input: MigrateInput): MigrationReport {
    const report = dryRunMigration(input);
    const revisions: TranslationRevision[] = [];
    const seen = new Set<string>();
    for (const item of classifyLegacy(input).items) {
        if (item.revision === undefined) continue;
        const scope = `${item.locale}${item.keyPath}`;
        if (seen.has(scope)) continue;
        seen.add(scope);
        revisions.push(item.revision);
    }
    if (revisions.length === 0) {
        throw new Error('Migration produced zero revisions — nothing to write');
    }
    const written = writeSegment({
        registryDir: input.registryDir,
        runId: input.migrationRunId,
        revisions,
        createdAt: input.migratedAt,
    });
    // Validate before marking complete: re-read and confirm the segment.
    const reloaded = readRegistry({ registryDir: input.registryDir });
    const found = reloaded.revisions.filter((r) => r.runId === input.migrationRunId).length;
    if (found !== revisions.length) {
        throw new Error(
            `Migration validation failed: wrote ${revisions.length} revisions but re-read ${found}`
        );
    }
    return {
        ...report,
        applied: true,
        segmentFile: written.fileName,
        registryRevisions: reloaded.revisions.length,
    };
}
