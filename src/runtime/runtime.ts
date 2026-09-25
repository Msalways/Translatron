/**
 * Agent runtime seam (Epic 005).
 *
 * The SOLE boundary between the deterministic compiler and agentic execution.
 * Everything outside `src/runtime/deepagents/` programs against these types —
 * never against framework message/channel/middleware internals.
 */
import type { RunPlan } from '../core/domain.js';
import type { ProviderConfig } from '../config/schema.js';

/** One translated unit returned by the runtime (validated by the compiler). */
export interface BatchTranslation {
    unitId: string;
    text: string;
}

/** Per-locale skill + glossary material handed to workers. */
export interface LocaleMaterial {
    locale: string;
    /** Rendered skill texts in resolution order (Epic 009 produces these). */
    skills: Array<{ id: string; content: string }>;
    glossary: Record<string, string>;
    /** Compatible translation-memory examples (Epic 007 produces these). */
    examples: Array<{ keyPath: string; text: string }>;
}

export interface RuntimeContext {
    runId: string;
    sourceLocale: string;
    /** Runtime model string, e.g. "openai:gpt-5". */
    model: string;
    /** Full selected provider settings, including explicit base URL/credentials. */
    provider?: ProviderConfig;
    fallbackModels: string[];
    materials: LocaleMaterial[];
    /** Max repair attempts per batch before FAILED (Epic 006 owns the flow). */
    maxRepairAttempts: number;
    /**
     * Engine-assembled worker tool backend (Epic 014). When present, the
     * supervisor default worker path uses it instead of the empty backend.
     */
    toolBackend?: TranslationToolBackend;
}

/**
 * Backing data providers for language-worker tools (moved from
 * `deepagents/tools.ts` in Epic 014 so the deterministic compiler in
 * `src/core/` can assemble engine-owned backends without importing the
 * framework-isolated deepagents tree; re-exported there for compat).
 */
export interface TranslationToolBackend {
    lookupMemory(sourceHash: string, locale: string): Array<{ text: string; origin: string }>;
    lookupGlossaryTerm(term: string, locale: string): string | null;
    getKeyContext(keyPath: string): string | null;
    getRelatedTranslations(keyPath: string, locale: string): Array<{ keyPath: string; text: string }>;
    getSkillResource(skillId: string, resourcePath: string): string | null;
}

export type RuntimeEvent =
    | { type: 'run-started'; runId: string; languages: string[] }
    | { type: 'language-started'; locale: string }
    | { type: 'batch-started'; locale: string; batchIndex: number; unitIds: string[] }
    | { type: 'batch-completed'; locale: string; batchIndex: number; translations: BatchTranslation[] }
    | { type: 'language-completed'; locale: string; translated: number }
    | { type: 'language-failed'; locale: string; failed: number; error: string }
    | { type: 'run-completed'; runId: string };

/** Per-language outcome: a summary, never every translation (E6). */
export interface LanguageSummary {
    locale: string;
    status: 'complete' | 'failed';
    translated: number;
    failed: number;
    batches: number;
    repairs: number;
    reviews: number;
    error?: string;
}

export type RunStatus = 'complete' | 'partial_success' | 'failed';

export interface RunResult {
    runId: string;
    status: RunStatus;
    summaries: LanguageSummary[];
    translated: number;
    failed: number;
}

export interface TranslationRuntime {
    execute(plan: RunPlan, context: RuntimeContext): AsyncIterable<RuntimeEvent>;
}
