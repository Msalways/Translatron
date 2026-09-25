/**
 * Translatron vNext canonical domain model (Epic 001).
 *
 * Single source of truth for v3 concepts: identity, revision lineage,
 * reconciled views, and immutable run plans.
 *
 * CONSTITUTION GATES (Sections II + III):
 * This module MUST NOT import `deepagents`, `@langchain/*`, `better-sqlite3`,
 * or any LLM provider SDK. Only `zod` (schema validation) is allowed.
 * Enforced by `tests/unit/domain.test.ts` boundary test.
 */
import { z } from 'zod';

/** Schema version for persisted TranslationRevision records. */
export const REVISION_SCHEMA_VERSION = 1;

/**
 * Derived translation states (R&D §17). `status` is always derived by the
 * reconciler from source + target + registry — never stored.
 */
export const TRANSLATION_STATUSES = [
    'NEW',
    'UNTRACKED',
    'CLEAN',
    'MANUAL',
    'SOURCE_STALE',
    'SKILL_STALE',
    'CONTEXT_STALE',
    'TARGET_DELETED',
    'ORPHANED',
    'CONFLICT',
    'FAILED',
    'NEEDS_REVIEW',
] as const;

export type TranslationStatus = (typeof TRANSLATION_STATUSES)[number];

export const TranslationStatusSchema = z.enum(TRANSLATION_STATUSES);

/** Provenance origin of a revision. Closed union — storage rejects unknowns. */
export const REVISION_ORIGINS = ['agent', 'human', 'imported'] as const;

export type RevisionOrigin = (typeof REVISION_ORIGINS)[number];

export const RevisionOriginSchema = z.enum(REVISION_ORIGINS);

/** A skill applied to a translation, identified by content fingerprint. */
export interface AppliedSkill {
    id: string;
    scope: string;
    fingerprint: string;
}

export const AppliedSkillSchema = z.object({
    id: z.string().min(1),
    scope: z.string().min(1),
    fingerprint: z.string().min(1),
});

/** Unique address of one key × locale translation. */
export interface TranslationIdentity {
    catalogId: string;
    keyPath: string;
    sourceLocale: string;
    targetLocale: string;
}

export const TranslationIdentitySchema = z.object({
    catalogId: z.string().min(1),
    keyPath: z.string().min(1),
    sourceLocale: z.string().min(2),
    targetLocale: z.string().min(2),
});

/**
 * Durable translation lineage record (R&D §16). Serialized into `.trn`
 * registry segments; retries/tool events are NOT stored here.
 */
export interface TranslationRevision extends TranslationIdentity {
    id: string;
    sourceHash: string;
    targetHash: string;
    origin: RevisionOrigin;
    parentIds: string[];
    model?: string;
    provider?: string;
    corePolicyFingerprint?: string;
    skillFingerprints?: AppliedSkill[];
    glossaryFingerprint?: string;
    contextFingerprint?: string;
    runId: string;
    createdAt: string;
    /** Current HEAD at publish time; null outside git repos (Epic 014, additive). */
    gitCommit?: string | null;
}

export const TranslationRevisionSchema = TranslationIdentitySchema.extend({
    id: z.string().min(1),
    sourceHash: z.string().min(1),
    targetHash: z.string().min(1),
    origin: RevisionOriginSchema,
    parentIds: z.array(z.string()),
    model: z.string().optional(),
    provider: z.string().optional(),
    corePolicyFingerprint: z.string().optional(),
    skillFingerprints: z.array(AppliedSkillSchema).optional(),
    glossaryFingerprint: z.string().optional(),
    contextFingerprint: z.string().optional(),
    runId: z.string().min(1),
    createdAt: z.string().datetime(),
    gitCommit: z.string().nullable().optional(),
}).strict();

/**
 * A single translatable string. Shape-compatible with the existing
 * `SourceUnit` in `src/types/index.ts` (structural compat asserted in tests).
 */
export interface SourceUnit {
    unitId: string;
    keyPath: string;
    sourceText: string;
    sourceHash: string;
    context?: string;
    placeholders: string[];
    sourceFile: string;
    schemaVersion: number;
}

export const SourceUnitSchema = z.object({
    unitId: z.string().min(1),
    keyPath: z.string().min(1),
    sourceText: z.string(),
    sourceHash: z.string().min(1),
    context: z.string().optional(),
    placeholders: z.array(z.string()),
    sourceFile: z.string(),
    schemaVersion: z.number().int(),
});

/** Point-in-time view of one target catalog: key → current text + hash. */
export interface TargetSnapshot {
    locale: string;
    entries: Record<string, { text: string; targetHash: string }>;
}

/**
 * Derived per-key × locale view joining source, target snapshot, and registry
 * revisions. Produced by the reconciler (Epic 002); never persisted directly.
 */
export interface ReconciledTranslation {
    identity: TranslationIdentity;
    status: TranslationStatus;
    sourceHash: string;
    currentTargetHash?: string;
    /** Newest revision of any origin, if the key was ever tracked. */
    latestRevisionId?: string;
    /** Newest agent-owned revision (baseline for MANUAL detection). */
    latestAgentRevisionId?: string;
}

/** Reason a unit entered the run plan (for reporting, not behavior). */
export type WorkUnitReason =
    | 'new'
    | 'source-changed'
    | 'skill-stale'
    | 'context-stale'
    | 'target-deleted'
    | 'retry-failed'
    | 'needs-review'
    | 'forced';

/** Smallest schedulable translation atom. */
export interface TranslationWorkUnit {
    unitId: string;
    keyPath: string;
    sourceText: string;
    placeholders: string[];
    contextFingerprint?: string;
    skillFingerprint?: string;
    reason: WorkUnitReason;
}

/** All work for one target locale. Batches are token-budgeted unit groups. */
export interface LanguagePlan {
    locale: string;
    skills: AppliedSkill[];
    batches: TranslationWorkUnit[][];
}

/** Concurrency caps enforced by code, never by the model (R&D §8). */
export interface ExecutionLimits {
    maxLanguages: number;
    maxBatchesPerLanguage: number;
    maxGlobalModelCalls: number;
    providerCaps?: Record<string, number>;
}

export const ExecutionLimitsSchema = z.object({
    maxLanguages: z.number().int().min(1).default(4),
    maxBatchesPerLanguage: z.number().int().min(1).default(2),
    maxGlobalModelCalls: z.number().int().min(1).default(8),
    providerCaps: z.record(z.string(), z.number().int().min(1)).optional(),
});

export const DEFAULT_EXECUTION_LIMITS: ExecutionLimits = {
    maxLanguages: 4,
    maxBatchesPerLanguage: 2,
    maxGlobalModelCalls: 8,
};

/** Run-level policy knobs (budgets live in the repair flow, Epic 006). */
export interface RunPolicy {
    forceRegenerate?: boolean;
    affectedBySkill?: string;
    requireReviewFor?: string[];
    dryRun?: boolean;
}

/**
 * Immutable execution input for `TranslationRuntime.execute`.
 * The planner deep-freezes the plan before handoff (Epic 002).
 */
export interface RunPlan {
    runId: string;
    languages: LanguagePlan[];
    totalUnits: number;
    limits: ExecutionLimits;
    policy: RunPolicy;
}

/**
 * Import patterns forbidden under `src/core/` (Constitution II + III).
 * Consumed by the boundary test; keep in sync with the test scanner.
 */
export const FORBIDDEN_CORE_IMPORT_PATTERNS = [
    'deepagents',
    '@langchain',
    'better-sqlite3',
    'openai',
    '@anthropic-ai/sdk',
    'groq-sdk',
] as const;
