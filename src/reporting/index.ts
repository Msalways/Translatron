import { TranslatronLedger } from '../ledger/index';
import { type TargetLanguage } from '../types/index';
import chalk from 'chalk';

export interface RunSummary {
    runId: string;
    startedAt: string;
    finishedAt: string | null;
    modelUsed: string;
    tokensIn: number;
    tokensOut: number;
    costEstimateUsd: number;
    configHash: string;
}

export interface StatsSummary {
    totalStrings: number;
    translatedStrings: number;
    failedStrings: number;
    manualOverrides: number;
    languageCoverage: Record<string, number>;
}

/**
 * Audit and Reporting System
 * Generates summaries and audit trails from the SQLite ledger
 */
export class ReportingSystem {
    constructor(private ledger: TranslatronLedger) { }

    /**
     * Get a summary of the latest run
     */
    async getLatestRunSummary(): Promise<RunSummary | null> {
        const run = this.ledger.getLatestRun();
        if (!run) return null;

        return {
            runId: run.run_id,
            startedAt: run.started_at,
            finishedAt: run.finished_at,
            modelUsed: run.model_used,
            tokensIn: run.tokens_in || 0,
            tokensOut: run.tokens_out || 0,
            costEstimateUsd: run.cost_estimate_usd || 0,
            configHash: run.config_hash,
        };
    }

    /**
     * Get overall statistics for the project
     */
    async getProjectStats(targetLanguages: TargetLanguage[]): Promise<StatsSummary> {
        const baseStats = this.ledger.getProjectStats();
        const coverage: Record<string, number> = {};
        let translatedCount = 0;
        let failedTotal = 0;

        for (const lang of targetLanguages) {
            const langStats = this.ledger.getLanguageStats(lang.shortCode);
            const label = `${lang.language} (${lang.shortCode})`;
            coverage[label] = langStats.translated;
            translatedCount += langStats.translated;
            failedTotal += langStats.failed;
        }

        return {
            totalStrings: baseStats.total_keys,
            translatedStrings: translatedCount,
            failedStrings: failedTotal,
            manualOverrides: baseStats.manual_count,
            languageCoverage: coverage,
        };
    }

    /**
     * Format a report as a string for CLI output
     */
    formatReport(stats: StatsSummary): string {
        let output = chalk.bold('\n📊 Project Translation Status\n');
        output += chalk.gray('-----------------------------------\n');
        output += `Total unique keys: ${stats.totalStrings}\n`;
        output += `Translated:       ${chalk.green(stats.translatedStrings)}\n`;
        output += `Failed/Dirty:     ${chalk.red(stats.failedStrings)}\n`;
        output += `Manual Overrides: ${chalk.yellow(stats.manualOverrides)}\n\n`;

        output += chalk.bold('Language Coverage:\n');
        for (const [lang, count] of Object.entries(stats.languageCoverage)) {
            const percentage = stats.totalStrings > 0
                ? ((count / stats.totalStrings) * 100).toFixed(1)
                : '0.0';
            const color = count === stats.totalStrings ? chalk.green : chalk.yellow;
            output += `  ${lang.padEnd(5)}: ${color(`${count}/${stats.totalStrings}`)} (${percentage}%)\n`;
        }

        return output;
    }
}
