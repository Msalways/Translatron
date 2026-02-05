import { Command } from 'commander';
import { loadConfig } from '../../config/loader';
import { translatronxLedger } from '../../ledger/index';
import { TranslationImporter } from '../../utils/importer';
import { resolve } from 'path';
import { existsSync } from 'fs';
import chalk from 'chalk';
import ora from 'ora';

/**
 * Import command - Initialize ledger from existing translation files
 */
export const importCommand = new Command('import')
    .description('Import existing translations into the ledger')
    .option('--source <path>', 'Source language file path (overrides config)')
    .option('--targets <paths>', 'Target language files (comma-separated)')
    .option('--lang-map <json>', 'JSON mapping of file paths to language codes')
    .option('--dry-run', 'Show what would be imported without making changes')
    .option('--force', 'Overwrite existing ledger entries')
    .action(async (options) => {
        const spinner = ora('Loading configuration...').start();

        try {
            // Load configuration
            const config = await loadConfig();
            spinner.succeed('Configuration loaded');

            // Determine source file
            const sourcePath = options.source || config.extractors[0]?.pattern;
            if (!sourcePath) {
                spinner.fail('No source file specified. Use --source or configure extractors.');
                process.exit(1);
            }

            const resolvedSourcePath = resolve(process.cwd(), sourcePath);
            if (!existsSync(resolvedSourcePath)) {
                spinner.fail(`Source file not found: ${resolvedSourcePath}`);
                process.exit(1);
            }

            // Parse target files
            let targetFiles: Array<{ path: string; langCode: string }> = [];

            if (options.langMap) {
                // Use explicit language mapping
                try {
                    const langMap = JSON.parse(options.langMap) as Record<string, string>;
                    targetFiles = Object.entries(langMap).map(([path, langCode]) => ({
                        path: resolve(process.cwd(), path),
                        langCode,
                    }));
                } catch (error) {
                    spinner.fail('Invalid JSON in --lang-map option');
                    process.exit(1);
                }
            } else if (options.targets) {
                // Use comma-separated target files with auto-detection
                const targetPaths = options.targets.split(',').map((p: string) => p.trim());

                // Try to infer language codes from filenames or use config
                targetFiles = targetPaths.map((path: string) => {
                    const resolvedPath = resolve(process.cwd(), path);

                    // Try to extract language code from filename (e.g., fr.json -> fr)
                    const match = path.match(/([a-z]{2}(-[A-Z][a-z]+)?)\.json$/);
                    const langCode = match ? match[1] : '';

                    if (!langCode) {
                        spinner.warn(`Could not infer language code from ${path}. Use --lang-map for explicit mapping.`);
                    }

                    return { path: resolvedPath, langCode };
                }).filter((t: { path: string; langCode: string }) => t.langCode); // Filter out files without language codes
            } else {
                // Use config to determine target files
                const outputDir = config.output.dir;
                const fileNaming = config.output.fileNaming;

                targetFiles = config.targetLanguages.map(lang => ({
                    path: resolve(
                        process.cwd(),
                        outputDir,
                        fileNaming.replace('{shortCode}', lang.shortCode).replace('{language}', lang.language)
                    ),
                    langCode: lang.shortCode,
                }));
            }

            // Filter to only existing files
            const existingTargetFiles = targetFiles.filter(t => {
                if (!existsSync(t.path)) {
                    spinner.warn(`Target file not found, skipping: ${t.path}`);
                    return false;
                }
                return true;
            });

            if (existingTargetFiles.length === 0) {
                spinner.fail('No target translation files found');
                process.exit(1);
            }

            spinner.text = `Found ${existingTargetFiles.length} target file(s)`;
            spinner.succeed();

            // Analyze coverage first
            console.log(chalk.bold('\n📊 Analyzing coverage...\n'));

            for (const target of existingTargetFiles) {
                const coverage = TranslationImporter.analyzeCoverage(
                    resolvedSourcePath,
                    target.path
                );

                console.log(chalk.cyan(`  ${target.langCode}:`));
                console.log(`    Total keys: ${coverage.totalKeys}`);
                console.log(`    Matched keys: ${coverage.matchedKeys}`);
                console.log(`    Missing keys: ${coverage.missingKeys.length}`);
                console.log(`    Coverage: ${chalk.green(coverage.coverage.toFixed(1) + '%')}`);

                if (coverage.missingKeys.length > 0 && coverage.missingKeys.length <= 10) {
                    console.log(`    Missing: ${chalk.yellow(coverage.missingKeys.join(', '))}`);
                }
                console.log();
            }

            // Import translations
            spinner.start('Importing translations...');

            const importRecords = await TranslationImporter.importFromMultipleFiles(
                resolvedSourcePath,
                existingTargetFiles
            );

            if (options.dryRun) {
                spinner.succeed(`Dry run: Would import ${importRecords.length} translation(s)`);
                console.log(chalk.dim('\nSample records:'));
                importRecords.slice(0, 5).forEach(record => {
                    console.log(chalk.dim(`  ${record.keyPath} (${record.langCode})`));
                });
                if (importRecords.length > 5) {
                    console.log(chalk.dim(`  ... and ${importRecords.length - 5} more`));
                }
                return;
            }

            // Initialize ledger
            const ledgerPath = config.advanced?.ledgerPath || './.translatronx/ledger.sqlite';
            const ledger = new translatronxLedger(resolve(process.cwd(), ledgerPath));

            // Start a run for tracking
            const runId = ledger.startRun('import', 'manual-import');

            // Bulk import
            const stats = ledger.bulkImportTranslations(importRecords, runId);

            // Complete the run
            ledger.completeRun(runId, 0, 0, 0);
            ledger.close();

            spinner.succeed('Import complete!');

            // Display statistics
            console.log(chalk.bold('\n✅ Import Statistics:\n'));
            console.log(`  Total records: ${stats.totalRecords}`);
            console.log(`  Imported: ${chalk.green(stats.imported)}`);
            console.log(`  Skipped: ${chalk.yellow(stats.skipped)}`);
            console.log(`  Errors: ${stats.errors > 0 ? chalk.red(stats.errors) : stats.errors}`);
            console.log(`  Languages: ${stats.languages.join(', ')}`);
            console.log(`  Duration: ${stats.duration}ms`);

            console.log(chalk.dim('\n💡 Tip: Run "translatronx status" to verify the import\n'));

        } catch (error) {
            spinner.fail('Import failed');
            console.error(chalk.red('\nError:'), error instanceof Error ? error.message : error);
            process.exit(1);
        }
    });
