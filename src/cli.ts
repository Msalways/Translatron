#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, getDefaultConfig } from './config/index';
import { TranslationCompiler } from './compiler/index';
import { ReportingSystem } from './reporting/index';
import { translatronxLedger } from './ledger/index';
import { writeFileSync } from 'fs';
import { createInterface } from 'node:readline';
import { execFileSync } from 'node:child_process';
import { importCommand } from './cli/commands/import';
import { runReportFromPerLanguage } from './cli/renderer/json';
import { runCheck, formatCheckReport, CHECK_EXIT_ISSUES } from './cli/commands/check';
import { buildProvenanceStatus, mergeProvenanceStatuses, formatProvenanceStatus } from './cli/commands/status';
import { runDoctor, formatDoctorReport } from './cli/commands/doctor';
import { explainKey, formatExplain } from './cli/commands/explain';
import { detectConflicts, renderConflict, buildResolutionRevision } from './cli/conflicts';
import { loadProjectState } from './cli/project';
import { runV3Sync } from './cli/sync-v3';
import { buildV2Scaffold, buildV3Scaffold } from './cli/init';
import { currentSkillMap, matchesKeyPattern } from './skills/resolver';
import { scopedKey } from './core/reconciler';
import { writeSegment } from './registry/writer';
import { isProviderInstalled, PROVIDER_BY_ID, providerForConfigType, type LangChainProviderId } from './providers/catalog';

const program = new Command();

program
    .name('translatronx')
    .description('Deterministic, incremental, build-time translation compiler using LLMs')

program
    .command('sync')
    .description('Synchronize translations (incremental processing)')
    .option('-f, --force', 'Force regeneration of manual overrides')
    .option('-v, --verbose', 'Enable verbose output with streaming')
    .option('--json', 'Machine-readable report (R&D §31 schema)')
    .option('--v2', 'Use the legacy v2 sync engine (compatibility mode)')
    .option('--dry-run', 'Plan only; change nothing (v3 only)')
    .option('--affected-by-skill <id>', 'Only retranslate skill-stale units (v3 only)')
    .action(async (options) => {
        try {
            if (options.v2 !== true) {
                await runV3Sync(options);
                return;
            }
            if (options.json !== true) {
                console.log(chalk.blue('🔄 Syncing translations...\n'));
            }

            // Load configuration
            const config = await loadConfig();

            // Run compilation
            const compiler = new TranslationCompiler(config);
            const stats = await compiler.sync(options);
            compiler.close();

            if (options.json === true) {
                console.log(JSON.stringify(runReportFromPerLanguage(stats.runId, stats.perLanguage ?? {}), null, 2));
                process.exit(stats.failedUnits > 0 ? 3 : 0);
            }

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
    .option('--v2', 'Scaffold the legacy v2 TypeScript template')
    .option('--provider <id>', 'v3 provider profile (default: openai)')
    .action(async (options: { v2?: boolean; provider?: string }) => {
        try {
            console.log(chalk.blue('🚀 Initializing translatronx...\n'));

            // Create default configuration
            const config = getDefaultConfig();
            const providerId = (options.provider ?? 'openai') as LangChainProviderId;
            const scaffold = options.v2 === true ? buildV2Scaffold(config) : buildV3Scaffold(providerId);

            // Write configuration file
            writeFileSync(scaffold.file, scaffold.content, 'utf-8');

            if (options.v2 !== true) {
                const provider = PROVIDER_BY_ID.get(providerId);
                if (provider !== undefined && !isProviderInstalled(provider)) {
                    const installCommand = `npm install ${provider.package}`;
                    const shouldInstall = process.stdin.isTTY === true
                        ? await promptYesNo(`Install ${provider.package} now?`)
                        : false;
                    if (shouldInstall) {
                        execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', provider.package], { stdio: 'inherit' });
                    } else {
                        console.log(chalk.yellow(`Provider package is not installed. Run: ${installCommand}`));
                    }
                }
            }

            const selectedProvider = options.v2 === true ? undefined : PROVIDER_BY_ID.get(providerId);
            const credentialHint = selectedProvider?.apiKeyEnv ?? (selectedProvider?.auth === 'no-key' ? 'no API key required' : 'configure provider credentials');
            console.log(chalk.green(`✅ Created ${scaffold.file}`));
            console.log(chalk.gray('\nNext steps:'));
            console.log(chalk.gray(`  1. Edit ${scaffold.file} to configure your project`));
            console.log(chalk.gray(`  2. Configure credentials: ${credentialHint}`));
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

            // v3 provenance section when a registry is present.
            try {
                const state = await loadProjectState();
                if (state.registryReadable && state.revisions.length > 0) {
                    const conflicts = detectConflicts(state.revisions);
                    const perLocale = state.targets.map((target) =>
                        buildProvenanceStatus({
                            sourceLocale: state.config.sourceLanguage,
                            catalogId: 'main',
                            sourceUnits: state.sourceUnits,
                            targets: [target],
                            revisions: state.revisions,
                            currentSkills: currentSkillMap(state.skills, target.locale),
                            conflicts: conflicts.filter((conflict) => conflict.locale === target.locale),
                        })
                    );
                    console.log(chalk.bold('Provenance (v3 registry):\n'));
                    console.log(formatProvenanceStatus(mergeProvenanceStatuses(perLocale)));
                } else {
                    console.log(chalk.gray('No v3 registry found. Run `translatronx migrate` for v2 projects.\n'));
                }
            } catch (error: unknown) {
                console.log(chalk.yellow(`Provenance section unavailable: ${error instanceof Error ? error.message : String(error)}\n`));
            }

            process.exit(0);
        } catch (error: unknown) {
            console.error(chalk.red('❌ Status check failed:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

program
    .command('check')
    .description('Validate target files without making changes (deterministic, CI-safe)')
    .option('--catalogs-only', 'Skip registry-dependent sections (none exist yet; file gate only)')
    .action(async (options: { catalogsOnly?: boolean }) => {
        try {
            const state = await loadProjectState();
            const targets = state.targets.map((snapshot) => ({
                locale: snapshot.locale,
                entries: Object.fromEntries(
                    Object.entries(snapshot.entries).map(([key, entry]) => [key, entry.text])
                ),
            }));
            const result = runCheck({
                sourceLocale: state.config.sourceLanguage,
                sourceUnits: state.sourceUnits,
                targets,
                targetOnly: state.config.catalogs?.targetOnly ?? [],
                ...(options.catalogsOnly === true ? { catalogsOnly: true as const } : {}),
            });
            const locales = state.config.targetLanguages.map((language) => language.shortCode);
            if (result.failed) {
                console.log(chalk.red(formatCheckReport(result, locales)));
                process.exit(CHECK_EXIT_ISSUES);
            }
            console.log(chalk.green(formatCheckReport(result, locales)));
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

// Register migrate command
import { migrateCommand } from './cli/commands/migrate';
program.addCommand(migrateCommand);
import { registryCommand } from './cli/registry/index';
program.addCommand(registryCommand);

// Register context command
import { contextCommand } from './cli/commands/context';
program.addCommand(contextCommand);

const CREDENTIAL_HINTS: Record<string, string> = {
    'openai': 'set OPENAI_API_KEY',
    'anthropic': 'set ANTHROPIC_API_KEY',
    'azure-openai': 'set AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT',
    'azure_openai': 'set AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT',
    'openrouter': 'set OPENROUTER_API_KEY',
    'local': 'configure baseUrl',
    'ollama': 'configure OLLAMA_BASE_URL or baseUrl',
    'google': 'set GOOGLE_API_KEY',
    'google-genai': 'set GOOGLE_GENERATIVE_AI_API_KEY',
    'google-vertexai': 'configure Google Application Default Credentials, project, and location',
    'google-vertexai-web': 'set GOOGLE_API_KEY',
    'bedrock': 'configure AWS credentials and AWS_REGION',
    'aws': 'configure AWS credentials and AWS_REGION',
};

program
    .command('doctor')
    .description('Check project readiness (catalogs, credentials, registry, skills)')
    .action(async () => {
        try {
            const state = await loadProjectState();
            const credentials = state.config.providers.map((provider) => {
                const descriptor = providerForConfigType(provider.type);
                const requiredEnv = descriptor?.requiredEnv ?? [];
                const apiKeyEnv = descriptor?.apiKeyEnv;
                const baseUrlEnv = descriptor?.baseUrlEnv;
                const envPresent = (name: string | undefined): boolean =>
                    name !== undefined && process.env[name] !== undefined && process.env[name] !== '';
                const present =
                    (provider.apiKey !== undefined && provider.apiKey.length > 0) ||
                    (envPresent(apiKeyEnv)) ||
                    (requiredEnv.length > 0 && requiredEnv.every(envPresent)) ||
                    (baseUrlEnv !== undefined && envPresent(baseUrlEnv)) ||
                    (provider.baseUrl !== undefined && provider.baseUrl.length > 0);
                return {
                    provider: provider.name,
                    present,
                    hint: CREDENTIAL_HINTS[provider.type] ?? descriptor?.apiKeyEnv ?? 'configure credentials',
                };
            });
            const result = runDoctor({
                configValid: true,
                sourceFiles: state.sourceFiles,
                targets: state.targetFiles,
                credentials,
                registryPresent: state.registryPresent,
                registryReadable: state.registryReadable,
                registryDetail: state.registryDetail,
                skills: state.skills.map((skill) => ({ id: skill.id, scope: skill.scope, locales: skill.locales })),
                skillWarnings: state.skillWarnings,
                targetLocales: state.config.targetLanguages.map((language) => language.shortCode),
                sourceKeys: state.sourceUnits.map((unit) => unit.keyPath),
                reviewGlobs: state.config.policies?.reviewKeys,
                targetOnlyGlobs: state.config.catalogs?.targetOnly,
            });
            // Fill source files note from discovery.
            console.log(formatDoctorReport(result));
            process.exit(result.ready ? 0 : 1);
        } catch (error: unknown) {
            const result = runDoctor({
                configValid: false,
                configError: error instanceof Error ? error.message : String(error),
                sourceFiles: [],
                targets: [],
                credentials: [],
                registryPresent: false,
                registryReadable: false,
                registryDetail: '',
                skills: [],
                skillWarnings: [],
                targetLocales: [],
            });
            console.log(formatDoctorReport(result));
            process.exit(1);
        }
    });

program
    .command('explain <key>')
    .description('Trace provenance for one translation key')
    .option('--lang <code>', 'Target locale')
    .action(async (key: string, options: { lang?: string }) => {
        try {
            if (options.lang === undefined) {
                console.error(chalk.red('❌ --lang is required (e.g. --lang ja-JP)'));
                process.exit(1);
            }
            const state = await loadProjectState();
            const locale: string = options.lang;
            const result = explainKey({
                keyPath: key,
                locale,
                sourceLocale: state.config.sourceLanguage,
                catalogId: 'main',
                sourceUnits: state.sourceUnits,
                targets: state.targets,
                revisions: state.revisions,
                currentSkills: currentSkillMap(state.skills, locale),
                ...(state.config.policies?.reviewKeys !== undefined && state.config.policies.reviewKeys.length > 0
                    ? {
                        needsReviewKeys: new Set(
                            state.sourceUnits
                                .filter((unit) => (state.config.policies?.reviewKeys ?? []).some((pattern) => matchesKeyPattern(pattern, unit.keyPath)))
                                .map((unit) => scopedKey(locale, unit.keyPath))
                        ),
                    }
                    : {}),
            });
            if (result === null) {
                console.error(chalk.red(`❌ Unknown key: ${key} (no source, target, or history)`));
                process.exit(1);
            }
            console.log(formatExplain(result));
            process.exit(0);
        } catch (error: unknown) {
            console.error(chalk.red('❌ Explain failed:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

program
    .command('resolve <key>')
    .description('Resolve a translation conflict (semantic, never raw git)')
    .option('--lang <code>', 'Target locale')
    .option('--keep <n>', 'Keep option number (skips the prompt)')
    .action(async (key: string, options: { lang?: string; keep?: string }) => {
        try {
            if (options.lang === undefined) {
                console.error(chalk.red('❌ --lang is required (e.g. --lang fr-FR)'));
                process.exit(1);
            }
            const state = await loadProjectState();
            const conflicts = detectConflicts(
                state.revisions.filter((revision) => revision.keyPath === key && revision.targetLocale === options.lang)
            );
            if (conflicts.length === 0) {
                console.log(chalk.green(`No conflict for ${key} / ${options.lang}.`));
                process.exit(0);
            }
            const view = conflicts[0];
            const target = state.targets.find((snapshot) => snapshot.locale === options.lang);
            const currentText = target?.entries[key]?.text;
            console.log(renderConflict(view, currentText));

            let keepIndex: number | undefined;
            if (options.keep !== undefined) {
                const parsed = Number.parseInt(options.keep, 10) - 1;
                if (!Number.isInteger(parsed) || parsed < 0 || parsed >= view.options.length) {
                    console.error(chalk.red(`❌ --keep must be 1..${view.options.length}`));
                    process.exit(1);
                }
                keepIndex = parsed;
            } else {
                const choice = await promptConflictChoice(view.options.length, currentText !== undefined);
                if (choice === null) {
                    console.log(chalk.gray('Cancelled. No changes made.'));
                    process.exit(0);
                }
                keepIndex = choice;
            }

            const runId = `resolve_${Date.now()}`;
            const revision = buildResolutionRevision({
                view,
                ...(keepIndex !== undefined ? { keepIndex } : {}),
                ...(currentText !== undefined && keepIndex === undefined ? { currentText } : {}),
                sourceLocale: state.config.sourceLanguage,
                catalogId: 'main',
                runId,
                createdAt: new Date().toISOString(),
            });
            const written = writeSegment({ registryDir: state.registryDir, runId, revisions: [revision] });
            console.log(chalk.green(`\nResolution recorded: ${written.fileName}`));
            process.exit(0);
        } catch (error: unknown) {
            console.error(chalk.red('❌ Resolve failed:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

function promptYesNo(question: string): Promise<boolean> {
    return new Promise((resolvePrompt) => {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        rl.question(`${question} [y/N] `, (answer: string) => {
            rl.close();
            resolvePrompt(/^y(es)?$/i.test(answer.trim()));
        });
    });
}

function promptConflictChoice(optionCount: number, hasCurrentFile: boolean): Promise<number | undefined | null> {
    return new Promise((resolvePrompt) => {
        const prompt = hasCurrentFile
            ? `Choose 1..${optionCount}, Y to use the current file, or n to cancel: `
            : `Choose 1..${optionCount} or n to cancel: `;
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        rl.question(prompt, (answer: string) => {
            rl.close();
            const normalized = answer.trim().toLowerCase();
            if (normalized === 'n' || normalized === '') {
                resolvePrompt(null);
                return;
            }
            if ((normalized === 'y' || normalized === 'yes') && hasCurrentFile) {
                resolvePrompt(undefined);
                return;
            }
            const choice = Number.parseInt(normalized, 10) - 1;
            if (!Number.isInteger(choice) || choice < 0 || choice >= optionCount) {
                resolvePrompt(null);
                return;
            }
            resolvePrompt(choice);
        });
    });
}

program.parse();
