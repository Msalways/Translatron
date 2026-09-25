/**
 * Revision assembly for the v3 sync engine (Epic 014, K1/K4/K6).
 *
 * Pure builders: deterministic IDs, full provenance, parent chaining, and
 * the already-recorded guard that makes repeat runs publish nothing.
 * Git HEAD is captured best-effort (null outside repos).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { AppliedSkill, TranslationRevision } from '../core/domain.js';
import { latestRevision } from '../core/reconciler.js';

export interface RevisionBase {
    catalogId: string;
    keyPath: string;
    sourceLocale: string;
    targetLocale: string;
    sourceHash: string;
    targetHash: string;
    runId: string;
    createdAt: string;
    gitCommit?: string | null;
}

/**
 * Deterministic revision ID: identical inputs always yield the identical ID,
 * distinct runs never collide (runId is part of the hash).
 */
export function revisionId(runId: string, locale: string, keyPath: string, sourceHash: string, targetHash: string): string {
    return `tr_${createHash('sha256')
        .update([runId, locale, keyPath, sourceHash, targetHash].join('|'), 'utf8')
        .digest('hex')
        .substring(0, 16)}`;
}

export interface AgentRevisionInput extends RevisionBase {
    model: string;
    provider: string;
    corePolicyFingerprint: string;
    skillFingerprints: AppliedSkill[];
    glossaryFingerprint: string;
    contextFingerprint?: string;
    /** Latest identity revision, if any (becomes the parent). */
    previous?: TranslationRevision;
}

/** Agent revision for a newly accepted translation (model output or TM restore). */
export function buildAgentRevision(input: AgentRevisionInput): TranslationRevision {
    return {
        id: revisionId(input.runId, input.targetLocale, input.keyPath, input.sourceHash, input.targetHash),
        catalogId: input.catalogId,
        keyPath: input.keyPath,
        sourceLocale: input.sourceLocale,
        targetLocale: input.targetLocale,
        sourceHash: input.sourceHash,
        targetHash: input.targetHash,
        origin: 'agent',
        parentIds: input.previous !== undefined ? [input.previous.id] : [],
        model: input.model,
        provider: input.provider,
        corePolicyFingerprint: input.corePolicyFingerprint,
        skillFingerprints: input.skillFingerprints,
        glossaryFingerprint: input.glossaryFingerprint,
        ...(input.contextFingerprint !== undefined ? { contextFingerprint: input.contextFingerprint } : {}),
        runId: input.runId,
        createdAt: input.createdAt,
        ...(input.gitCommit !== undefined ? { gitCommit: input.gitCommit } : {}),
    };
}

export interface HumanRevisionInput extends RevisionBase {
    /** Previous generated revision (becomes the parent). */
    previousGeneratedId: string;
}

/** Human revision for an observed manual edit. Never touches files. */
export function buildHumanRevision(input: HumanRevisionInput): TranslationRevision {
    return {
        id: revisionId(input.runId, input.targetLocale, input.keyPath, input.sourceHash, input.targetHash),
        catalogId: input.catalogId,
        keyPath: input.keyPath,
        sourceLocale: input.sourceLocale,
        targetLocale: input.targetLocale,
        sourceHash: input.sourceHash,
        targetHash: input.targetHash,
        origin: 'human',
        parentIds: [input.previousGeneratedId],
        runId: input.runId,
        createdAt: input.createdAt,
        ...(input.gitCommit !== undefined ? { gitCommit: input.gitCommit } : {}),
    };
}

export interface AdoptionInput extends RevisionBase {
    previous?: TranslationRevision;
}

/**
 * Imported revision adopting an UNTRACKED target (lineage starts here).
 * Restore path reuses buildAgentRevision with the historical origin instead.
 */
export function buildAdoptionRevision(input: AdoptionInput): TranslationRevision {
    return {
        id: revisionId(input.runId, input.targetLocale, input.keyPath, input.sourceHash, input.targetHash),
        catalogId: input.catalogId,
        keyPath: input.keyPath,
        sourceLocale: input.sourceLocale,
        targetLocale: input.targetLocale,
        sourceHash: input.sourceHash,
        targetHash: input.targetHash,
        origin: 'imported',
        parentIds: input.previous !== undefined ? [input.previous.id] : [],
        runId: input.runId,
        createdAt: input.createdAt,
        ...(input.gitCommit !== undefined ? { gitCommit: input.gitCommit } : {}),
    };
}

/**
 * Already-recorded guard (idempotence): the latest identity revision already
 * carries the current target hash, so publishing would mint a duplicate.
 */
export function isAlreadyRecorded(revisionsForIdentity: TranslationRevision[], currentTargetHash: string): boolean {
    const latest = latestRevision(revisionsForIdentity);
    return latest !== undefined && latest.targetHash === currentTargetHash;
}

/** Best-effort HEAD sha for revision provenance; null outside git repos. */
export function currentGitCommit(cwd: string): string | null {
    try {
        const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, stdio: 'pipe', encoding: 'utf-8' }) as string;
        const trimmed = sha.trim();
        return /^[0-9a-f]{40}$/.test(trimmed) ? trimmed : null;
    } catch {
        return null;
    }
}
