/**
 * Machine-readable run report (Epic 010, H4/CLI-02).
 *
 * Shape follows R&D §31. `failed` is present only when nonzero (matches the
 * spec example). The same builder serves the v3 compiler (from fan-in
 * summaries) and the v2 engine (from per-language stats) — one schema.
 */
import { z } from 'zod';
import { deriveRunStatus } from '../../core/events.js';
import type { LanguageSummary } from '../../runtime/runtime.js';

export const LanguageReportSchema = z.object({
    status: z.enum(['complete', 'failed']),
    translated: z.number().int().min(0),
    failed: z.number().int().min(0).optional(),
});

export const RunReportSchema = z.object({
    runId: z.string().min(1),
    status: z.enum(['complete', 'partial_success', 'failed']),
    languages: z.record(z.string(), LanguageReportSchema),
});

export type RunReport = z.infer<typeof RunReportSchema>;

/** Build a §31 report from fan-in summaries (v3 path). */
export function buildRunReport(runId: string, summaries: LanguageSummary[]): RunReport {
    const languages: RunReport['languages'] = {};
    for (const summary of summaries) {
        languages[summary.locale] = {
            status: summary.status,
            translated: summary.translated,
            ...(summary.failed > 0 ? { failed: summary.failed } : {}),
        };
    }
    return RunReportSchema.parse({
        runId,
        status: deriveRunStatus(summaries),
        languages,
    });
}

/** Build a §31 report from per-language engine stats (v2 compat path). */
export function runReportFromPerLanguage(
    runId: string,
    perLanguage: Record<string, { translated: number; failed: number }>
): RunReport {
    const summaries: LanguageSummary[] = Object.entries(perLanguage).map(([locale, counts]) => ({
        locale,
        status: counts.failed > 0 ? ('failed' as const) : ('complete' as const),
        translated: counts.translated,
        failed: counts.failed,
        batches: 0,
        repairs: 0,
        reviews: 0,
    }));
    return buildRunReport(runId, summaries);
}

/** Validate unknown input against the checked-in shape. Throws on mismatch. */
export function parseRunReport(json: unknown): RunReport {
    return RunReportSchema.parse(json);
}
