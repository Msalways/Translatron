/**
 * Deterministic reconciliation engine (Epic 002).
 *
 * Derives the 12 v3 translation states (R&D §17) from:
 *   source units + target snapshots + registry revisions (+ policy inputs).
 *
 * Pure functions only: no I/O, no SQLite, no agents. Status is derived state —
 * nothing here persists anything.
 *
 * Precedence (first match wins, documented for stability):
 *   ORPHANED → CONFLICT → NEEDS_REVIEW → FAILED → TARGET_DELETED → NEW →
 *   UNTRACKED → MANUAL → SOURCE_STALE → SKILL_STALE → CONTEXT_STALE → CLEAN
 *
 * Rationale: source-gone dominates; explicit policy/review/failure signals
 * dominate missing-target distinctions; MANUAL dominates staleness because
 * human ownership is never auto-touched.
 */
import type {
    ReconciledTranslation,
    SourceUnit,
    TargetSnapshot,
    TranslationIdentity,
    TranslationRevision,
    TranslationStatus,
    TranslationWorkUnit,
    WorkUnitReason,
} from './domain.js';

/** Composite key helpers (locale-scoped). */
export function scopedKey(locale: string, keyPath: string): string {
    return `${locale}${keyPath}`;
}

/** Everything the reconciler needs; registry access is passed as data. */
export interface ReconcileInput {
    sourceLocale: string;
    catalogId: string;
    sourceUnits: SourceUnit[];
    /** One snapshot per target locale. */
    targets: TargetSnapshot[];
    /** All relevant registry revisions (any locale); filtered internally. */
    revisions: TranslationRevision[];
    /** Current skill fingerprints by skill id (Epic 009 produces these). */
    currentSkills?: Map<string, string>;
    /** Current context fingerprints by unitId (empty/absent = skip check). */
    contextFingerprints?: Map<string, string>;
    /** Keys with a recorded generation failure and no usable target. */
    failedKeys?: Set<string>;
    /** Keys with competing human revisions (registry detects, Epic 003). */
    conflictKeys?: Set<string>;
    /** Keys the project policy routes to human review. */
    needsReviewKeys?: Set<string>;
}

export interface ReconcileResult {
    reconciled: ReconciledTranslation[];
    /** Keys that need (re-)translation, in stable input order. */
    workUnits: TranslationWorkUnit[];
}

/** Newest revision by createdAt (ties broken by id for determinism). */
export function latestRevision(revisions: TranslationRevision[]): TranslationRevision | undefined {
    let best: TranslationRevision | undefined;
    for (const rev of revisions) {
        if (
            best === undefined ||
            rev.createdAt > best.createdAt ||
            (rev.createdAt === best.createdAt && rev.id > best.id)
        ) {
            best = rev;
        }
    }
    return best;
}

/** Newest agent-owned revision — the MANUAL-detection baseline. */
export function latestAgentRevision(revisions: TranslationRevision[]): TranslationRevision | undefined {
    return latestRevision(revisions.filter((r) => r.origin === 'agent'));
}

/**
 * Derive the state for one key × locale. All inputs are explicit so the
 * function stays pure and exhaustively testable.
 */
export function deriveState(args: {
    identity: TranslationIdentity;
    sourceUnit: SourceUnit | undefined;
    currentTargetHash: string | undefined;
    revisions: TranslationRevision[];
    currentSkills: Map<string, string>;
    currentContextFingerprint: string | undefined;
    isFailed: boolean;
    isConflict: boolean;
    needsReview: boolean;
}): TranslationStatus {
    const {
        sourceUnit,
        currentTargetHash,
        revisions,
        currentSkills,
        currentContextFingerprint,
        isFailed,
        isConflict,
        needsReview,
    } = args;

    // Source key no longer exists but a target/revision does.
    if (sourceUnit === undefined) return 'ORPHANED';
    if (isConflict) return 'CONFLICT';
    if (needsReview) return 'NEEDS_REVIEW';

    const hasTarget = currentTargetHash !== undefined;
    const latest = latestRevision(revisions);
    const latestAgent = latestAgentRevision(revisions);

    if (!hasTarget) {
        if (isFailed) return 'FAILED';
        // Tracked before (revision exists) but entry deleted from the file.
        if (latest !== undefined) return 'TARGET_DELETED';
        return 'NEW';
    }

    if (latest === undefined) return 'UNTRACKED';

    // Human ownership: target differs from the last agent-owned baseline.
    // With no agent revision, any deviation from the latest accepted revision
    // is manual.
    const baseline = latestAgent ?? latest;
    if (currentTargetHash !== baseline.targetHash) return 'MANUAL';

    // Source changed since the baseline was produced.
    if (sourceUnit.sourceHash !== baseline.sourceHash) return 'SOURCE_STALE';

    // Skill change since the baseline was produced.
    if (currentSkills.size > 0) {
        const applied = baseline.skillFingerprints ?? [];
        const appliedById = new Map(applied.map((s) => [s.id, s.fingerprint]));
        let stale = applied.length === 0;
        if (!stale) {
            for (const [id, fingerprint] of currentSkills) {
                if (appliedById.get(id) !== fingerprint) {
                    stale = true;
                    break;
                }
            }
        }
        if (stale) return 'SKILL_STALE';
    }

    // Context change since the baseline was produced.
    if (currentContextFingerprint !== undefined) {
        if (baseline.contextFingerprint !== currentContextFingerprint) return 'CONTEXT_STALE';
    }

    return 'CLEAN';
}

const WORK_REASONS: Record<string, WorkUnitReason> = {
    NEW: 'new',
    SOURCE_STALE: 'source-changed',
    SKILL_STALE: 'skill-stale',
    CONTEXT_STALE: 'context-stale',
    TARGET_DELETED: 'target-deleted',
    FAILED: 'retry-failed',
    NEEDS_REVIEW: 'needs-review',
};

/**
 * Reconcile every source key × target locale. Output order is stable:
 * targets in input order, keys in source order.
 */
export function reconcile(input: ReconcileInput): ReconcileResult {
    const byTarget = new Map<string, Map<string, TranslationRevision[]>>();
    for (const rev of input.revisions) {
        if (rev.sourceLocale !== input.sourceLocale) continue;
        let perLocale = byTarget.get(rev.targetLocale);
        if (perLocale === undefined) {
            perLocale = new Map();
            byTarget.set(rev.targetLocale, perLocale);
        }
        const list = perLocale.get(rev.keyPath);
        if (list === undefined) perLocale.set(rev.keyPath, [rev]);
        else list.push(rev);
    }

    const currentSkills = input.currentSkills ?? new Map<string, string>();
    const reconciled: ReconciledTranslation[] = [];
    const workUnits: TranslationWorkUnit[] = [];

    for (const target of input.targets) {
        const revisionsForLocale = byTarget.get(target.locale) ?? new Map<string, TranslationRevision[]>();
        for (const unit of input.sourceUnits) {
            const identity: TranslationIdentity = {
                catalogId: input.catalogId,
                keyPath: unit.keyPath,
                sourceLocale: input.sourceLocale,
                targetLocale: target.locale,
            };
            const entry = target.entries[unit.keyPath];
            const revisions = revisionsForLocale.get(unit.keyPath) ?? [];
            const scope = scopedKey(target.locale, unit.keyPath);
            const status = deriveState({
                identity,
                sourceUnit: unit,
                currentTargetHash: entry?.targetHash,
                revisions,
                currentSkills,
                currentContextFingerprint: input.contextFingerprints?.get(unit.unitId),
                isFailed: input.failedKeys?.has(scope) ?? false,
                isConflict: input.conflictKeys?.has(scope) ?? false,
                needsReview: input.needsReviewKeys?.has(scope) ?? false,
            });
            const latest = latestRevision(revisions);
            reconciled.push({
                identity,
                status,
                sourceHash: unit.sourceHash,
                currentTargetHash: entry?.targetHash,
                latestRevisionId: latest?.id,
                latestAgentRevisionId: latestAgentRevision(revisions)?.id,
            });
            const reason = WORK_REASONS[status];
            if (reason !== undefined) {
                workUnits.push({
                    unitId: unit.unitId,
                    keyPath: unit.keyPath,
                    sourceText: unit.sourceText,
                    placeholders: unit.placeholders,
                    contextFingerprint: input.contextFingerprints?.get(unit.unitId),
                    reason,
                });
            }
        }
    }

    return { reconciled, workUnits };
}
