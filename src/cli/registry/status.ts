/**
 * Registry status (Epic 017, O5).
 *
 * Read-only health counts: segments, snapshots, revisions, removals,
 * quarantined files, bootstrap presence. No network, instant.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readRegistry } from '../../registry/reader.js';
import { QUARANTINE_DIR, SEGMENTS_DIR, SNAPSHOTS_DIR } from '../../registry/schema.js';

export interface RegistryStatus {
    registryDir: string;
    present: boolean;
    segments: number;
    snapshots: number;
    revisions: number;
    removals: number;
    quarantined: number;
}

/** Count everything about a registry home. Never throws on absence. */
export function registryStatus(registryDir: string): RegistryStatus {
    if (!existsSync(registryDir)) {
        return { registryDir, present: false, segments: 0, snapshots: 0, revisions: 0, removals: 0, quarantined: 0 };
    }
    const count = (subdir: string, suffix: string): number => {
        const dir = join(registryDir, subdir);
        if (!existsSync(dir)) return 0;
        return readdirSync(dir).filter((f) => f.endsWith(suffix)).length;
    };
    const loaded = readRegistry({ registryDir });
    return {
        registryDir,
        present: true,
        segments: count(SEGMENTS_DIR, '.trn'),
        snapshots: count(SNAPSHOTS_DIR, '.trnsnapshot'),
        revisions: loaded.revisions.length,
        removals: loaded.removals.length,
        quarantined: count(QUARANTINE_DIR, '.corrupt'),
    };
}

/** Render the status block. */
export function formatRegistryStatus(status: RegistryStatus): string {
    if (!status.present) {
        return 'No v3 registry found. Run `translatronx migrate` for v2 projects.\n';
    }
    return [
        'Registry',
        '',
        `  Segments      ${status.segments}`,
        `  Snapshots     ${status.snapshots}`,
        `  Revisions     ${status.revisions}`,
        `  Removals      ${status.removals}`,
        `  Quarantined   ${status.quarantined}`,
        '',
    ].join('\n');
}
