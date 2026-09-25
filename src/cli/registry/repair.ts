/**
 * Registry repair (Epic 017, L4).
 *
 * Quarantines corrupt segments via the existing mechanism, re-verifies, and
 * reports. Never rewrites, deletes, or regenerates history: moved-aside files
 * are tamper evidence preserved under `quarantine/`.
 */
import { defaultQuarantineDir, readRegistry } from '../../registry/reader.js';
import { verifyRegistry } from './verify.js';

export interface RepairOutcome {
    registryDir: string;
    quarantined: string[];
    validRevisions: number;
    cleanAfter: boolean;
    detail: string[];
}

/** Quarantine corrupt segments and re-verify. Moves files; changes nothing else. */
export function repairRegistry(registryDir: string): RepairOutcome {
    const first = readRegistry({ registryDir, quarantineDir: defaultQuarantineDir(registryDir) });
    const after = verifyRegistry(registryDir);
    const detail: string[] = [];
    if (first.quarantined.length === 0) {
        detail.push('Nothing to repair: all segments verified.');
    } else {
        detail.push(`Quarantined ${first.quarantined.length} segment(s):`);
        for (const file of first.quarantined) detail.push(`  ${file} -> quarantine/${file}.corrupt`);
    }
    detail.push(`Valid revisions still queryable: ${after.present ? first.revisions.length : 0}.`);
    return {
        registryDir,
        quarantined: first.quarantined,
        validRevisions: first.revisions.length,
        cleanAfter: after.ok,
        detail,
    };
}

/** Render the repair outcome. */
export function formatRepairOutcome(outcome: RepairOutcome): string {
    return `${outcome.detail.join('\n')}\n`;
}
