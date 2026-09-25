/**
 * Provenance trace for one key (Epic 010, H6/UX-02).
 *
 * Joins reconciled state, the latest registry revision, a re-run of the
 * deterministic validators against the current file content, and an exact
 * translation-memory lookup. Read-only.
 */
import type {
    AppliedSkill,
    SourceUnit,
    TargetSnapshot,
    TranslationRevision,
    TranslationStatus,
} from '../../core/domain.js';
import { reconcile, scopedKey } from '../../core/reconciler.js';
import { TranslationMemory } from '../../memory/translation-memory.js';
import { validateBatchOutput } from '../../validation/batch.js';
import { detectConflicts } from '../conflicts.js';

export interface ExplainInput {
    keyPath: string;
    locale: string;
    sourceLocale: string;
    catalogId: string;
    sourceUnits: SourceUnit[];
    targets: TargetSnapshot[];
    revisions: TranslationRevision[];
    currentSkills?: Map<string, string>;
    /** Routed review scopes (Epic 016); mirrors engine `requireReviewFor`. */
    needsReviewKeys?: Set<string>;
}

export interface ExplainResult {
    keyPath: string;
    locale: string;
    state: TranslationStatus;
    sourceText?: string;
    targetText?: string;
    origin?: TranslationRevision['origin'];
    model?: string;
    provider?: string;
    skills: AppliedSkill[];
    tmReused: boolean;
    tmReason?: string;
    validation: Array<{ name: string; pass: boolean }>;
    revisionId?: string;
    runId?: string;
    createdAt?: string;
}

/** Trace one key × locale. Returns null when the key is unknown everywhere. */
export function explainKey(input: ExplainInput): ExplainResult | null {
    const unit = input.sourceUnits.find((source) => source.keyPath === input.keyPath);
    const target = input.targets.find((snapshot) => snapshot.locale === input.locale);
    const entry = target?.entries[input.keyPath];
    const revisions = input.revisions.filter(
        (revision) => revision.keyPath === input.keyPath && revision.targetLocale === input.locale
    );
    if (unit === undefined && entry === undefined && revisions.length === 0) return null;

    const { reconciled } = reconcile({
        sourceLocale: input.sourceLocale,
        catalogId: input.catalogId,
        sourceUnits: unit !== undefined ? [unit] : [],
        targets: target !== undefined ? [target] : [],
        revisions,
        ...(input.currentSkills !== undefined ? { currentSkills: input.currentSkills } : {}),
        ...(input.needsReviewKeys !== undefined ? { needsReviewKeys: input.needsReviewKeys } : {}),
        ...(detectConflicts(revisions).length > 0
            ? { conflictKeys: new Set([scopedKey(input.locale, input.keyPath)]) }
            : {}),
    });
    // With no source unit the reconciler yields nothing; the key is orphaned by definition.
    const state: TranslationStatus = reconciled[0]?.status ?? 'ORPHANED';

    const latest = newest(revisions);
    const validation = runValidation(unit, entry?.text);
    const tm = new TranslationMemory(input.revisions);
    const hit =
        unit !== undefined
            ? tm.lookup({ sourceHash: unit.sourceHash, locale: input.locale })
            : null;

    return {
        keyPath: input.keyPath,
        locale: input.locale,
        state,
        ...(unit !== undefined ? { sourceText: unit.sourceText } : {}),
        ...(entry !== undefined ? { targetText: entry.text } : {}),
        ...(latest !== undefined
            ? {
                origin: latest.origin,
                ...(latest.model !== undefined ? { model: latest.model } : {}),
                ...(latest.provider !== undefined ? { provider: latest.provider } : {}),
                skills: latest.skillFingerprints ?? [],
                revisionId: latest.id,
                runId: latest.runId,
                createdAt: latest.createdAt,
            }
            : { skills: [] }),
        tmReused: hit !== null && latest !== undefined && hit.revision.id === latest.id,
        ...(hit !== null ? { tmReason: hit.reason } : {}),
        validation,
    };
}

function newest(revisions: TranslationRevision[]): TranslationRevision | undefined {
    let best: TranslationRevision | undefined;
    for (const revision of revisions) {
        if (
            best === undefined ||
            revision.createdAt > best.createdAt ||
            (revision.createdAt === best.createdAt && revision.id > best.id)
        ) {
            best = revision;
        }
    }
    return best;
}

/** Re-run deterministic validators against current file content. */
function runValidation(unit: SourceUnit | undefined, text: string | undefined): Array<{ name: string; pass: boolean }> {
    if (unit === undefined || text === undefined) {
        return [
            { name: 'structure', pass: false },
            { name: 'placeholders', pass: false },
        ];
    }
    const workUnit = {
        unitId: unit.unitId,
        keyPath: unit.keyPath,
        sourceText: unit.sourceText,
        placeholders: unit.placeholders,
        reason: 'new' as const,
    };
    const failures = validateBatchOutput([workUnit], [{ unitId: unit.unitId, text }]);
    const failedTypes = new Set(failures.flatMap((failure) => failure.errors.map((error) => error.type)));
    const has = (...types: string[]): boolean => types.some((type) => failedTypes.has(type));
    return [
        { name: 'structure', pass: !has('MISSING_ID', 'UNKNOWN_ID', 'DUPLICATE_ID', 'EMPTY_TRANSLATION') },
        { name: 'placeholders', pass: !has('PLACEHOLDER_MISMATCH') },
        { name: 'icu', pass: !has('ICU_MISMATCH') },
        { name: 'markup', pass: !has('MARKUP_MISMATCH') },
    ];
}

/** Render the R&D §36 trace. */
export function formatExplain(result: ExplainResult): string {
    const lines = [result.keyPath, `Target: ${result.locale}`, '', 'Current state', `  ${result.state}`, ''];
    lines.push('Source', `  ${result.sourceText ?? '(removed)'}`, '');
    if (result.targetText !== undefined) {
        lines.push('Current translation', `  ${result.targetText}`, '');
    }
    lines.push('Origin', `  ${result.origin ?? 'untracked'}`, '');
    lines.push('Applied skills');
    if (result.skills.length === 0) lines.push('  (none)');
    for (const skill of result.skills) lines.push(`  ${skill.id}@${skill.fingerprint.slice(0, 4)}`);
    lines.push('');
    lines.push('Model', `  ${result.model ?? '...'}`, '');
    lines.push('Translation memory', `  ${result.tmReused ? `exact reuse (${result.tmReason})` : 'no exact reuse'}`, '');
    lines.push('Validation');
    for (const check of result.validation) lines.push(`  ${check.name.padEnd(13)}${check.pass ? 'pass' : 'FAIL'}`);
    lines.push('');
    lines.push('Revision', `  ${result.revisionId ?? '(none)'}`, '');
    if (result.runId !== undefined) lines.push(`Run  ${result.runId}`);
    if (result.createdAt !== undefined) lines.push(`Date ${result.createdAt}`);
    lines.push('');
    return lines.join('\n');
}
