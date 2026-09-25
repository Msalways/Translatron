/**
 * Provenance-oriented status (Epic 010, H7/UX).
 *
 * Reconciles source + target snapshots + registry revisions into the R&D §35
 * shape: key/translation totals, per-origin counts, per-state distribution,
 * and actionable key lists (manual, stale, failed, conflicts, review).
 * Pure and read-only — safe to run at any time.
 */
import type {
    SourceUnit,
    TargetSnapshot,
    TranslationRevision,
    TranslationStatus,
} from '../../core/domain.js';
import { reconcile, scopedKey as reconcilerScopedKey } from '../../core/reconciler.js';
import type { ConflictView } from '../conflicts.js';

export interface ProvenanceStatusInput {
    sourceLocale: string;
    catalogId: string;
    sourceUnits: SourceUnit[];
    targets: TargetSnapshot[];
    revisions: TranslationRevision[];
    currentSkills?: Map<string, string>;
    /** Detected conflicts (from `detectConflicts`); surfaces CONFLICT states. */
    conflicts?: ConflictView[];
}

export interface ProvenanceStatus {
    totalKeys: number;
    totalTranslations: number;
    byOrigin: Record<'agent' | 'human' | 'imported', number>;
    byState: Partial<Record<TranslationStatus, number>>;
    manual: string[];
    stale: string[];
    failed: string[];
    conflicts: string[];
    needsReview: string[];
}

const STALE_STATES: TranslationStatus[] = ['SOURCE_STALE', 'SKILL_STALE', 'CONTEXT_STALE'];

function scopedKey(locale: string, keyPath: string): string {
    return `${locale} ${keyPath}`;
}

/** Build the §35 status from reconciled state. */
export function buildProvenanceStatus(input: ProvenanceStatusInput): ProvenanceStatus {
    const conflictKeys =
        input.conflicts !== undefined
            ? new Set(input.conflicts.map((conflict) => reconcilerScopedKey(conflict.locale, conflict.keyPath)))
            : undefined;
    const { reconciled } = reconcile({
        sourceLocale: input.sourceLocale,
        catalogId: input.catalogId,
        sourceUnits: input.sourceUnits,
        targets: input.targets,
        revisions: input.revisions,
        ...(input.currentSkills !== undefined ? { currentSkills: input.currentSkills } : {}),
        ...(conflictKeys !== undefined ? { conflictKeys } : {}),
    });
    const latestByIdentity = new Map<string, TranslationRevision>();
    for (const revision of input.revisions) {
        const key = `${revision.catalogId}${revision.sourceLocale}${revision.targetLocale}${revision.keyPath}`;
        const current = latestByIdentity.get(key);
        if (
            current === undefined ||
            revision.createdAt > current.createdAt ||
            (revision.createdAt === current.createdAt && revision.id > current.id)
        ) {
            latestByIdentity.set(key, revision);
        }
    }
    const status: ProvenanceStatus = {
        totalKeys: input.sourceUnits.length,
        totalTranslations: reconciled.length,
        byOrigin: { agent: 0, human: 0, imported: 0 },
        byState: {},
        manual: [],
        stale: [],
        failed: [],
        conflicts: [],
        needsReview: [],
    };
    for (const item of reconciled) {
        status.byState[item.status] = (status.byState[item.status] ?? 0) + 1;
        const latest = latestByIdentity.get(
            `${item.identity.catalogId}${item.identity.sourceLocale}${item.identity.targetLocale}${item.identity.keyPath}`
        );
        if (latest !== undefined) status.byOrigin[latest.origin] += 1;
        const scoped = scopedKey(item.identity.targetLocale, item.identity.keyPath);
        if (item.status === 'MANUAL') status.manual.push(scoped);
        else if (STALE_STATES.includes(item.status)) status.stale.push(scoped);
        else if (item.status === 'FAILED') status.failed.push(scoped);
        else if (item.status === 'CONFLICT') status.conflicts.push(scoped);
        else if (item.status === 'NEEDS_REVIEW') status.needsReview.push(scoped);
    }
    return status;
}

const STATE_LABELS: Record<TranslationStatus, string> = {
    NEW: 'New',
    UNTRACKED: 'Untracked',
    CLEAN: 'Clean',
    MANUAL: 'Manual',
    SOURCE_STALE: 'Source stale',
    SKILL_STALE: 'Skill stale',
    CONTEXT_STALE: 'Context stale',
    TARGET_DELETED: 'Target deleted',
    ORPHANED: 'Orphaned',
    CONFLICT: 'Conflict',
    FAILED: 'Failed',
    NEEDS_REVIEW: 'Needs review',
};

const STATE_ORDER: TranslationStatus[] = [
    'CLEAN',
    'MANUAL',
    'SOURCE_STALE',
    'SKILL_STALE',
    'CONTEXT_STALE',
    'NEW',
    'UNTRACKED',
    'TARGET_DELETED',
    'ORPHANED',
    'NEEDS_REVIEW',
    'FAILED',
    'CONFLICT',
];

/** Merge per-locale statuses into one project view (counts sum, lists concat). */
export function mergeProvenanceStatuses(statuses: ProvenanceStatus[]): ProvenanceStatus {
    const merged: ProvenanceStatus = {
        totalKeys: 0,
        totalTranslations: 0,
        byOrigin: { agent: 0, human: 0, imported: 0 },
        byState: {},
        manual: [],
        stale: [],
        failed: [],
        conflicts: [],
        needsReview: [],
    };
    for (const status of statuses) {
        merged.totalKeys = Math.max(merged.totalKeys, status.totalKeys);
        merged.totalTranslations += status.totalTranslations;
        merged.byOrigin.agent += status.byOrigin.agent;
        merged.byOrigin.human += status.byOrigin.human;
        merged.byOrigin.imported += status.byOrigin.imported;
        for (const [state, count] of Object.entries(status.byState)) {
            const key = state as TranslationStatus;
            merged.byState[key] = (merged.byState[key] ?? 0) + (count ?? 0);
        }
        merged.manual.push(...status.manual);
        merged.stale.push(...status.stale);
        merged.failed.push(...status.failed);
        merged.conflicts.push(...status.conflicts);
        merged.needsReview.push(...status.needsReview);
    }
    return merged;
}

/** Render the §35 report. Only nonzero rows are shown. */
export function formatProvenanceStatus(status: ProvenanceStatus): string {    const lines = [
        `Keys                         ${status.totalKeys.toLocaleString('en-US')}`,
        `Translations                 ${status.totalTranslations.toLocaleString('en-US')}`,
        '',
        `Agent generated              ${status.byOrigin.agent.toLocaleString('en-US')}`,
        `Imported                     ${status.byOrigin.imported.toLocaleString('en-US')}`,
        `Human owned                    ${status.byOrigin.human.toLocaleString('en-US')}`,
        '',
    ];
    for (const state of STATE_ORDER) {
        const count = status.byState[state] ?? 0;
        if (count > 0) lines.push(`${STATE_LABELS[state].padEnd(26)}${count.toLocaleString('en-US')}`);
    }
    lines.push('');
    return lines.join('\n');
}
