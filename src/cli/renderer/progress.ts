/**
 * Per-language progress renderer (Epic 010, H2/UX-01).
 *
 * Consumes the normalized `TranslatronEvent` bus — never LangGraph events.
 * TTY mode draws live bars via cli-progress; non-TTY mode (CI, tests)
 * emits stable `locale done/total status` lines. Verbose mode adds
 * batch-level detail. The completion table follows R&D §29.
 */
import { MultiBar, Presets } from 'cli-progress';
import type { TranslatronEvent } from '../../core/events.js';
import type { LanguageSummary } from '../../runtime/runtime.js';

export interface ProgressRendererOptions {
    write: (line: string) => void;
    tty: boolean;
    verbose?: boolean;
}

interface LanguageProgress {
    total: number;
    done: number;
    failed: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bar?: any;
}

export class ProgressRenderer {
    private readonly languages = new Map<string, LanguageProgress>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private multiBar?: any;
    private stopped = false;

    constructor(private readonly options: ProgressRendererOptions) {
        if (options.tty) {
            this.multiBar = new MultiBar(
                {
                    format: '{locale}  {bar}  {value}/{total}  {status}',
                    hideCursor: true,
                    clearOnComplete: false,
                },
                Presets.shades_classic
            );
        }
    }

    handle(event: TranslatronEvent): void {
        switch (event.kind) {
            case 'language-started':
                this.ensure(event.locale);
                if (!this.options.tty) this.options.write(`${event.locale}  started`);
                break;
            case 'batch-started':
                this.ensure(event.locale).total += event.unitIds.length;
                this.syncBar(event.locale);
                if (this.options.verbose === true) {
                    this.options.write(`${event.locale}  batch ${event.batchIndex} started (${event.unitIds.length} units)`);
                }
                break;
            case 'batch-completed': {
                const progress = this.ensure(event.locale);
                progress.done += event.translated;
                this.syncBar(event.locale);
                if (this.options.verbose === true) {
                    this.options.write(`${event.locale}  batch ${event.batchIndex} done (${event.translated} translated)`);
                }
                break;
            }
            case 'language-completed': {
                const progress = this.ensure(event.locale);
                progress.done = Math.max(progress.done, event.translated);
                if (!this.options.tty) {
                    this.options.write(`${event.locale}  ${progress.done}/${progress.total}  ✓`);
                } else {
                    this.syncBar(event.locale, '✓');
                }
                break;
            }
            case 'language-failed': {
                this.ensure(event.locale).failed = true;
                if (!this.options.tty) {
                    this.options.write(`${event.locale}  ✗  ${event.error}`);
                } else {
                    this.syncBar(event.locale, '✗');
                }
                break;
            }
            case 'run-completed':
                this.stop();
                break;
            default:
                break;
        }
    }

    /**
     * Completion table (R&D §29). Counts come from fan-in summaries;
     * TM reuse and written files come from the compiler.
     */
    summary(summaries: LanguageSummary[], extra: { tmReused: number; filesUpdated: string[] }): void {
        this.stop();
        const lines: string[] = ['', 'Completed', ''];
        for (const summary of summaries) {
            const icon = summary.status === 'complete' ? '✓' : '✗';
            const repairNote = summary.repairs > 0 ? ` (${summary.repairs} repaired)` : '';
            const failedNote = summary.status === 'failed' ? ` (${summary.failed} failed)` : '';
            lines.push(`${summary.locale}  ${icon} ${summary.translated}${repairNote}${failedNote}`);
        }
        lines.push('');
        const translated = summaries.reduce((sum, summary) => sum + summary.translated, 0);
        const repairs = summaries.reduce((sum, summary) => sum + summary.repairs, 0);
        const failed = summaries.reduce((sum, summary) => sum + summary.failed, 0);
        lines.push(`TM reused        ${extra.tmReused}`);
        lines.push(`LLM translated   ${translated}`);
        lines.push(`Repairs           ${repairs}`);
        lines.push(`Failed            ${failed}`);
        lines.push('');
        lines.push('Files updated');
        for (const file of extra.filesUpdated) lines.push(`  ${file}`);
        if (extra.filesUpdated.length === 0) lines.push('  (none)');
        lines.push('');
        for (const line of lines) this.options.write(line);
    }

    private ensure(locale: string): LanguageProgress {
        let progress = this.languages.get(locale);
        if (progress === undefined) {
            progress = { total: 0, done: 0, failed: false };
            this.languages.set(locale, progress);
        }
        return progress;
    }

    private syncBar(locale: string, status = ''): void {
        if (this.multiBar === undefined) return;
        const progress = this.ensure(locale);
        if (progress.bar === undefined) {
            progress.bar = this.multiBar.create(Math.max(progress.total, 1), progress.done, { locale, status });
        } else {
            progress.bar.setTotal(Math.max(progress.total, 1));
            progress.bar.update(progress.done, { locale, status });
        }
    }

    private stop(): void {
        if (!this.stopped) {
            this.stopped = true;
            this.multiBar?.stop();
        }
    }
}
