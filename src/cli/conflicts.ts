/**
 * Semantic registry conflicts (Epic 010, U-T008 / R&D §37).
 *
 * Detects competing human revisions for the same source (two accepted human
 * translations with different target hashes on one source hash) and renders
 * them as a human decision — never raw git output. Resolution records a new
 * human revision parented on both contenders; the reconciler clears CONFLICT
 * once a single human revision supersedes them.
 */
import type { TranslationRevision } from '../core/domain.js';
import { computeHash } from '../utils/hash.js';

export interface ConflictOption {
    revisionId: string;
    origin: TranslationRevision['origin'];
    targetHash: string;
    createdAt: string;
    runId: string;
}

export interface ConflictView {
    keyPath: string;
    locale: string;
    sourceHash: string;
    options: ConflictOption[];
    currentText?: string;
}

/**
 * Find keys with ≥2 human revisions that disagree on the target for one
 * source. Deterministic; sorted by locale then key path.
 *
 * A group is *resolved* (excluded) when a human revision parents at least
 * one revision from every disagreeing camp — the resolution recorded by
 * `buildResolutionRevision` therefore clears the conflict on re-read.
 */
export function detectConflicts(revisions: TranslationRevision[]): ConflictView[] {
    const groups = new Map<string, TranslationRevision[]>();
    for (const revision of revisions) {
        if (revision.origin !== 'human') continue;
        const key = `${revision.targetLocale}${revision.keyPath}${revision.sourceHash}`;
        const list = groups.get(key) ?? [];
        list.push(revision);
        groups.set(key, list);
    }
    const conflicts: ConflictView[] = [];
    for (const list of groups.values()) {
        const camps = new Map<string, TranslationRevision[]>();
        for (const revision of list) {
            const camp = camps.get(revision.targetHash) ?? [];
            camp.push(revision);
            camps.set(revision.targetHash, camp);
        }
        if (camps.size < 2) continue;
        if (isSuperseded(list, camps)) continue;
        const first = list[0];
        conflicts.push({
            keyPath: first.keyPath,
            locale: first.targetLocale,
            sourceHash: first.sourceHash,
            options: [...list]
                .sort((a, b) => (a.createdAt === b.createdAt ? (a.id < b.id ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1))
                .map((revision) => ({
                    revisionId: revision.id,
                    origin: revision.origin,
                    targetHash: revision.targetHash,
                    createdAt: revision.createdAt,
                    runId: revision.runId,
                })),
        });
    }
    return conflicts.sort((a, b) =>
        a.locale === b.locale ? (a.keyPath < b.keyPath ? -1 : 1) : a.locale < b.locale ? -1 : 1
    );
}

/** True when one human revision parents a member of every camp (a recorded resolution). */
function isSuperseded(group: TranslationRevision[], camps: Map<string, TranslationRevision[]>): boolean {
    return group.some(
        (candidate) =>
            candidate.origin === 'human' &&
            [...camps.values()].every((camp) => camp.some((member) => candidate.parentIds.includes(member.id)))
    );
}

/** Render one conflict as a decision prompt (R&D §37). */
export function renderConflict(view: ConflictView, currentText?: string): string {
    const lines = ['Translation conflict', '', `${view.keyPath} / ${view.locale}`, '', 'Two human revisions exist for the same source:', ''];
    view.options.forEach((option, index) => {
        lines.push(`${index + 1}. revision ${option.revisionId} (${option.createdAt})`);
    });
    lines.push('');
    if (currentText !== undefined) {
        lines.push('Current file:', currentText, '');
        lines.push('Use current file as resolution?', '', '  Y confirm', '  n cancel', '');
    } else {
        lines.push('No current file content; choose a revision to keep.', '');
    }
    return lines.join('\n');
}

export interface ResolutionInput {
    view: ConflictView;
    /** Kept option index (0-based), or null when resolving from the current file. */
    keepIndex?: number;
    currentText?: string;
    sourceLocale: string;
    catalogId: string;
    runId: string;
    createdAt: string;
}

/**
 * Build the resolution revision: human origin, parented on every contender
 * so lineage stays complete. The caller persists it via the registry writer.
 */
export function buildResolutionRevision(input: ResolutionInput): TranslationRevision {
    const first = input.view.options[0];
    const targetHash =
        input.keepIndex !== undefined && input.view.options[input.keepIndex] !== undefined
            ? input.view.options[input.keepIndex].targetHash
            : input.currentText !== undefined
                ? computeHash(input.currentText)
                : first.targetHash;
    return {
        id: `resolve-${input.runId}-${input.view.locale}-${computeHash(input.view.keyPath).substring(0, 8)}`,
        catalogId: input.catalogId,
        keyPath: input.view.keyPath,
        sourceLocale: input.sourceLocale,
        targetLocale: input.view.locale,
        sourceHash: input.view.sourceHash,
        targetHash,
        origin: 'human',
        parentIds: input.view.options.map((option) => option.revisionId),
        runId: input.runId,
        createdAt: input.createdAt,
    };
}
