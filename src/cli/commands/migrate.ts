import { Command } from 'commander';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../../config/loader.js';
import { GenericJsonAdapter } from '../../catalogs/generic-json.js';
import { AtomicFileWriter } from '../../file-writer/index.js';
import { V2LedgerReader } from '../../migration/v2-ledger.js';
import { applyMigration, dryRunMigration, type MigrateInput } from '../../migration/migrate.js';
import type { TargetFile } from '../../migration/classifier.js';

function flatEntries(units: Array<{ keyPath: string; sourceText: string }>): Record<string, string> {
    return Object.fromEntries(units.map((u) => [u.keyPath, u.sourceText]));
}

/**
 * Migrate command — v2 SQLite → v3 Git registry.
 * Dry run by default. `--apply` writes one registry segment.
 */
export const migrateCommand = new Command('migrate')
    .description('Migrate a Translatron v2 project (SQLite) to the v3 Git registry')
    .option('--apply', 'Write the registry segment (default is a dry run)')
    .option('--ledger <path>', 'v2 SQLite ledger path (overrides config)')
    .option('--registry-dir <path>', 'Machine-owned registry home', './.translatron')
    .action(async (options) => {
        const spinner = ora('Loading configuration...').start();
        try {
            const config = await loadConfig();
            const ledgerPath = resolve(process.cwd(), options.ledger ?? config.advanced?.ledgerPath ?? './.translatronx/ledger.sqlite');
            if (!existsSync(ledgerPath)) {
                spinner.fail(`v2 ledger not found: ${ledgerPath}`);
                process.exit(1);
            }

            spinner.text = 'Reading source catalog...';
            const adapter = new GenericJsonAdapter();
            const pattern = config.extractors[0]?.pattern ?? './locales/en.json';
            const sourceFiles = await adapter.discover(pattern);
            const sourceCatalogs = await adapter.read(sourceFiles, { locale: config.sourceLanguage });
            const sourceUnits = sourceCatalogs.flatMap((c) => c.units);
            spinner.succeed(`Source: ${sourceUnits.length} keys (${config.sourceLanguage})`);

            spinner.start('Reading target catalogs...');
            const targets: TargetFile[] = [];
            for (const lang of config.targetLanguages) {
                const file = resolve(process.cwd(), AtomicFileWriter.getOutputPath(lang, config.output));
                if (!existsSync(file)) continue;
                const [catalog] = await adapter.read([file], { locale: lang.shortCode });
                targets.push({ locale: lang.shortCode, entries: flatEntries(catalog.units) });
            }
            spinner.succeed(`Targets: ${targets.map((t) => t.locale).join(', ') || '(none found)'}`);

            spinner.start('Classifying v2 ledger...');
            const reader = new V2LedgerReader(ledgerPath);
            const sourceHashes = new Map(reader.readSourceHashes().map((r) => [r.keyPath, r.valueHash]));
            const syncRows = reader.readSyncStatuses();
            reader.close();
            spinner.succeed(`Ledger: ${sourceHashes.size} source hashes, ${syncRows.length} sync rows`);

            const migrationRunId = `migrate_${Date.now()}`;
            const migratedAt = new Date().toISOString();
            const input: MigrateInput = {
                catalogId: 'main',
                sourceLocale: config.sourceLanguage,
                sourceUnits,
                sourceHashes,
                syncRows,
                targets,
                registryDir: resolve(process.cwd(), options.registryDir),
                migrationRunId,
                migratedAt,
            };

            if (options.apply !== true) {
                const report = dryRunMigration(input);
                console.log(chalk.blue('\nTranslatron 2 → 3 migration (dry run)\n'));
                console.log(chalk.white(`  Source keys              ${report.sourceKeys}`));
                console.log(chalk.white(`  Translations             ${report.translations}`));
                console.log(chalk.gray(`  Agent/LLM tracked        ${report.agent}`));
                console.log(chalk.gray(`  Manual                   ${report.human}`));
                console.log(chalk.gray(`  Imported/unknown         ${report.imported}`));
                console.log(chalk.red(`  Failed                   ${report.failed}`));
                console.log(chalk.yellow(`  Missing                  ${report.missing}`));
                console.log(chalk.yellow(`  Database/file mismatch   ${report.mismatches.length}`));
                for (const m of report.mismatches.slice(0, 10)) {
                    console.log(chalk.gray(`    ${m.locale} ${m.keyPath}: ${m.detail}`));
                }
                console.log(chalk.gray('\n  No changes made. Re-run with --apply to migrate.\n'));
                process.exit(0);
            }

            spinner.start('Applying migration...');
            const report = applyMigration(input);
            spinner.succeed('Migration applied');
            console.log(chalk.green('\nMigration complete\n'));
            console.log(chalk.white(`  Segment written          ${report.segmentFile}`));
            console.log(chalk.white(`  Registry revisions       ${report.registryRevisions}`));
            console.log(chalk.gray('  v2 SQLite retained as backup (never deleted automatically).\n'));
            process.exit(0);
        } catch (error: unknown) {
            ora().fail(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
            process.exit(1);
        }
    });
