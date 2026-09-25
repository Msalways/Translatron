/**
 * Offline fake runtime (Epic 005).
 *
 * Drives the compiler end-to-end in tests with zero model calls, zero keys,
 * zero network. Scripted per-locale behavior: translate (echo/prefix), fail
 * batches, or fail languages — so orchestration, validation, and partial
 * success are testable without the framework.
 */
import type { RunPlan } from '../core/domain.js';
import type { BatchTranslation, RuntimeContext, RuntimeEvent, TranslationRuntime } from './runtime.js';

export type StubBehavior =
    | { kind: 'translate'; textFor?: (unitId: string, sourceText: string, locale: string) => string }
    | { kind: 'fail-batch'; batchIndexes: number[]; error?: string }
    | { kind: 'fail-language'; error?: string };

/** Default: prefix the source text (guaranteed non-empty, non-leaking). */
export function defaultStubText(_unitId: string, sourceText: string, locale: string): string {
    return `[${locale}] ${sourceText}`;
}

export class StubRuntime implements TranslationRuntime {
    constructor(private readonly behaviors: Record<string, StubBehavior> = {}) {}

    async *execute(plan: RunPlan, context: RuntimeContext): AsyncIterable<RuntimeEvent> {
        yield { type: 'run-started', runId: plan.runId, languages: plan.languages.map((l) => l.locale) };
        for (const language of plan.languages) {
            const behavior = this.behaviors[language.locale] ?? { kind: 'translate' };
            yield { type: 'language-started', locale: language.locale };
            if (behavior.kind === 'fail-language') {
                const failed = language.batches.flat().length;
                yield { type: 'language-failed', locale: language.locale, failed, error: behavior.error ?? 'stub language failure' };
                continue;
            }
            let translated = 0;
            let failed = 0;
            let languageError: string | null = null;
            for (let batchIndex = 0; batchIndex < language.batches.length; batchIndex++) {
                const batch = language.batches[batchIndex];
                const unitIds = batch.map((u) => u.unitId);
                yield { type: 'batch-started', locale: language.locale, batchIndex, unitIds };
                if (behavior.kind === 'fail-batch' && behavior.batchIndexes.includes(batchIndex)) {
                    failed += batch.length;
                    languageError = behavior.error ?? 'stub batch failure';
                    continue;
                }
                const textFor =
                    behavior.kind === 'translate' ? (behavior.textFor ?? defaultStubText) : defaultStubText;
                const translations: BatchTranslation[] = batch.map((u) => ({
                    unitId: u.unitId,
                    text: textFor(u.unitId, u.sourceText, language.locale),
                }));
                translated += translations.length;
                yield { type: 'batch-completed', locale: language.locale, batchIndex, translations };
            }
            if (languageError !== null && translated === 0) {
                yield { type: 'language-failed', locale: language.locale, failed, error: languageError };
            } else {
                void context;
                yield { type: 'language-completed', locale: language.locale, translated };
            }
        }
        yield { type: 'run-completed', runId: plan.runId };
    }
}
