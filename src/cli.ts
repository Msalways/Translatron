#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, getDefaultConfig } from './config/index';
import { TranslationCompiler } from './compiler/index';
import { ReportingSystem } from './reporting/index';
import { translatronxLedger } from './ledger/index';
import { writeFileSync } from 'fs';
import { importCommand } from './cli/commands/import';

const program = new Command();

program
    .name('translatronx')
    .description('Deterministic, incremental, build-time translation compiler using LLMs')

program
    .command('sync')
    .description('Synchronize translations (incremental processing)')
    .option('-f, --force', 'Force regeneration of manual overrides')
    .option('-v, --verbose', 'Enable verbose output with streaming')
    .action(async (options) => {
        try {
            console.log(chalk.blue('🔄 Syncing translations...\n'));

            // Load configuration
            const config = await loadConfig();

            // Run compilation
            const compiler = new TranslationCompiler(config);
            const stats = await compiler.sync(options);
            compiler.close();

            // Display results
            console.log(chalk.green('\n✅ Translation sync complete!\n'));
            console.log(chalk.white('Statistics:'));
            console.log(chalk.gray(`  Total strings: ${stats.totalUnits}`));
            console.log(chalk.green(`  Translated: ${stats.translatedUnits}`));
            console.log(chalk.red(`  Failed: ${stats.failedUnits}`));
            console.log(chalk.yellow(`  Skipped: ${stats.skippedUnits}`));
            console.log(chalk.gray(`  Tokens used: ${stats.tokensIn} (input) + ${stats.tokensOut} (output)`));
            console.log(chalk.gray(`  Duration: ${((stats.finishedAt!.getTime() - stats.startedAt.getTime()) / 1000).toFixed(2)}s\n`));

            process.exit(0);
        } catch (error: unknown) {
            console.error(chalk.red('❌ Sync failed:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

program
    .command('init')
    .description('Initialize translatronx configuration')
    .action(async () => {
        try {
            console.log(chalk.blue('🚀 Initializing translatronx...\n'));

            // Create default configuration
            const config = getDefaultConfig();
            const configContent = `import { defineConfig } from 'translatronx';
                export default defineConfig(${JSON.stringify(config, null, 2)});
                `;

            // Write configuration file
            writeFileSync('translatronx.config.ts', configContent, 'utf-8');

            console.log(chalk.green('✅ Created translatronx.config.ts'));
            console.log(chalk.gray('\nNext steps:'));
            console.log(chalk.gray('  1. Edit translatronx.config.ts to configure your project'));
            console.log(chalk.gray('  2. Set API key: export OPENAI_API_KEY=your-key'));
            console.log(chalk.gray('  3. Run: translatronx sync\n'));

            process.exit(0);
        } catch (error: unknown) {
            console.error(chalk.red('❌ Init failed:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

program
    .command('status')
    .description('Display coverage statistics and system state')
    .action(async () => {
        try {
            console.log(chalk.blue('📊 Checking status...\n'));

            const config = await loadConfig();
            const ledgerPath = config.advanced?.ledgerPath || './.translatronx/ledger.sqlite';
            const ledger = new translatronxLedger(ledgerPath);
            const reporting = new ReportingSystem(ledger);

            const stats = await reporting.getProjectStats(config.targetLanguages);
            const latestRun = await reporting.getLatestRunSummary();

            console.log(reporting.formatReport(stats));

            if (latestRun) {
                console.log(chalk.bold('Latest Run:'));
                console.log(chalk.gray(`  Run ID:    ${latestRun.runId}`));
                console.log(chalk.gray(`  Model:     ${latestRun.modelUsed}`));
                console.log(chalk.gray(`  Cost:      $${latestRun.costEstimateUsd.toFixed(4)}`));
                console.log(chalk.gray(`  Duration:  ${latestRun.finishedAt ? 'Completed' : 'Interrupted'}\n`));
            }

            ledger.close();
            process.exit(0);
        } catch (error: unknown) {
            console.error(chalk.red('❌ Status check failed:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

program
    .command('check')
    .description('Validate target files without making changes')
    .action(async () => {
        try {
            console.log(chalk.blue('✓ Checking translations...\n'));
            console.log(chalk.yellow('⚠️  Check command not fully implemented yet'));
            console.log(chalk.gray('  This would validate all target files without making changes\n'));

            process.exit(0);
        } catch (error: unknown) {
            console.error(chalk.red('❌ Check failed:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

program
    .command('retry')
    .description('Retry failed translation batches')
    .option('--batch <id>', 'Specific batch ID to retry')
    .option('--lang <code>', 'Specific language to retry')
    .option('--dry-run', 'Show what would be retried without making changes')
    .action(async (options) => {
        try {
            console.log(chalk.blue('🔄 Retrying failed translations...\n'));

            const config = await loadConfig();
            const compiler = new TranslationCompiler(config);
            const stats = await compiler.retryFailed(options);
            compiler.close();

            console.log(chalk.green('\n✅ Retry operation complete!\n'));
            console.log(chalk.white('Retry Statistics:'));
            console.log(chalk.green(`  Successfully retried: ${stats.recoveredUnits}`));
            console.log(chalk.red(`  Still failed: ${stats.remainingFailed}`));
            console.log(chalk.gray(`  Tokens used: ${stats.tokensIn} (input) + ${stats.tokensOut} (output)\n`));

            process.exit(0);
        } catch (error: unknown) {
            console.error(chalk.red('❌ Retry failed:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

// Register import command
program.addCommand(importCommand);

program.parse();
