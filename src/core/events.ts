/**
 * Normalized Translatron event bus (Epic 008, H1).
 *
 * The Deep Agent / LangGraph stream feeds this adapter; the CLI only ever
 * consumes `TranslatronEvent`, never framework internals. Events the runtime
 * cannot produce (planning, catalog writes, registry updates) are emitted by
 * the deterministic compiler around runtime execution (Epic 010).
 */
import type { RuntimeEvent } from '../runtime/runtime.js';
import type { LanguageSummary, RunStatus } from '../runtime/runtime.js';

export type TranslatronEvent =
    | { kind: 'run-started'; runId: string; languages: string[] }
    | { kind: 'planning-completed'; runId: string; totalUnits: number; languages: string[] }
    | { kind: 'language-queued'; locale: string }
    | { kind: 'language-started'; locale: string }
    | { kind: 'batch-started'; locale: string; batchIndex: number; unitIds: string[] }
    | { kind: 'batch-completed'; locale: string; batchIndex: number; translated: number }
    | { kind: 'validation-failed'; locale: string; unitId: string; errors: string[] }
    | { kind: 'repair-started'; locale: string; unitId: string; attempt: number }
    | { kind: 'repair-completed'; locale: string; unitId: string; accepted: boolean }
    | { kind: 'language-completed'; locale: string; translated: number }
    | { kind: 'language-failed'; locale: string; failed: number; error: string }
    | { kind: 'catalog-written'; locale: string; file: string }
    | { kind: 'registry-updated'; segment: string; revisions: number }
    | { kind: 'run-completed'; runId: string; status: RunStatus };

/** Map one runtime event to its normalized form (1:1, no loss). */
export function adaptRuntimeEvent(event: RuntimeEvent): TranslatronEvent {
    switch (event.type) {
        case 'run-started':
            return { kind: 'run-started', runId: event.runId, languages: [...event.languages] };
        case 'language-started':
            return { kind: 'language-started', locale: event.locale };
        case 'batch-started':
            return { kind: 'batch-started', locale: event.locale, batchIndex: event.batchIndex, unitIds: [...event.unitIds] };
        case 'batch-completed':
            return { kind: 'batch-completed', locale: event.locale, batchIndex: event.batchIndex, translated: event.translations.length };
        case 'language-completed':
            return { kind: 'language-completed', locale: event.locale, translated: event.translated };
        case 'language-failed':
            return { kind: 'language-failed', locale: event.locale, failed: event.failed, error: event.error };
        case 'run-completed':
            // Status is resolved by the run owner via deriveRunStatus once
            // summaries are aggregated; default to complete for the seam.
            return { kind: 'run-completed', runId: event.runId, status: 'complete' };
    }
}

/** Resolve the final run status from fan-in summaries (E7 partial success). */
export function deriveRunStatus(summaries: LanguageSummary[]): RunStatus {
    const failed = summaries.filter((summary) => summary.status === 'failed').length;
    if (failed === 0) return 'complete';
    if (failed < summaries.length) return 'partial_success';
    return 'failed';
}
