/**
 * Exact translation memory (Epic 007).
 *
 * Index over accepted registry revisions keyed by
 * (source fingerprint, target locale, context compatibility).
 * A TM hit reuses a prior translation with zero model calls after the
 * compiler re-validates it — fuzzy/vector matching is explicitly out of
 * scope for v3.0.
 *
 * Only stored revisions are indexed; FAILED attempts are never revisions,
 * so they can never become candidates. Origin priority on ties:
 * human > agent > imported.
 */
import type { TranslationRevision } from '../core/domain.js';

export interface TmCandidate {
    revision: TranslationRevision;
    /** Why this candidate won (for explain/tracing). */
    reason: 'human-accepted' | 'agent-accepted' | 'imported';
}

const ORIGIN_RANK: Record<TranslationRevision['origin'], number> = {
    human: 0,
    agent: 1,
    imported: 2,
};

function reasonFor(origin: TranslationRevision['origin']): TmCandidate['reason'] {
    if (origin === 'human') return 'human-accepted';
    if (origin === 'agent') return 'agent-accepted';
    return 'imported';
}

/** Context compatibility: both absent counts as compatible. */
export function contextCompatible(revisionContext: string | undefined, queryContext: string | undefined): boolean {
    if (queryContext === undefined) return true;
    return revisionContext === queryContext;
}

export interface TmLookup {
    sourceHash: string;
    locale: string;
    contextFingerprint?: string;
}

export class TranslationMemory {
    private readonly byKey = new Map<string, TranslationRevision[]>();
    private readonly byLocale: TranslationRevision[] = [];

    constructor(revisions: TranslationRevision[]) {
        for (const revision of revisions) {
            const key = `${revision.sourceHash}${revision.targetLocale}`;
            const list = this.byKey.get(key);
            if (list === undefined) this.byKey.set(key, [revision]);
            else list.push(revision);
            this.byLocale.push(revision);
        }
        for (const list of this.byKey.values()) {
            list.sort(compareCandidates);
        }
        this.byLocale.sort(
            (a, b) => (a.createdAt === b.createdAt ? (a.id < b.id ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1)
        );
    }

    /** Exact hit: same source fingerprint + locale + compatible context. */
    lookup(query: TmLookup): TmCandidate | null {
        const candidates = this.byKey.get(`${query.sourceHash}${query.locale}`) ?? [];
        for (const revision of candidates) {
            if (!contextCompatible(revision.contextFingerprint, query.contextFingerprint)) continue;
            return { revision, reason: reasonFor(revision.origin) };
        }
        return null;
    }

    /**
     * Bounded compatible example set for worker context: newest accepted
     * revisions for the locale, optionally excluding one key. Never the
     * whole registry — capped, newest-first.
     */
    getExamples(locale: string, limit = 5, excludeKeyPath?: string): TmCandidate[] {
        const out: TmCandidate[] = [];
        for (const revision of this.byLocale) {
            if (revision.targetLocale !== locale) continue;
            if (excludeKeyPath !== undefined && revision.keyPath === excludeKeyPath) continue;
            out.push({ revision, reason: reasonFor(revision.origin) });
            if (out.length >= limit) break;
        }
        return out;
    }

    get size(): number {
        return this.byLocale.length;
    }
}

function compareCandidates(a: TranslationRevision, b: TranslationRevision): number {
    const rank = ORIGIN_RANK[a.origin] - ORIGIN_RANK[b.origin];
    if (rank !== 0) return rank;
    if (a.createdAt === b.createdAt) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    return a.createdAt < b.createdAt ? 1 : -1;
}
