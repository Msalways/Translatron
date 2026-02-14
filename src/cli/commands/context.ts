import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../../config/index';
import { ContextGenerator } from '../../utils/context-generator';
import { existsSync } from 'fs';
import { resolve } from 'path';

export const contextCommand = new Command('context')
    .description('Manage context files for better translation quality');

contextCommand
    .command('generate')
    .description('Generate context file template from source file')
    .option('--source <path>', 'Source file path (overrides config)')
    .option('--output <path>', 'Context file output path')
    .option('--merge', 'Merge with existing context file', false)
    .option('--dry-run', 'Preview changes without writing', false)
    .action(async (options) => {
        try {
            console.log(chalk.blue('📝 Generating context file template...\\n'));

            const config = await loadConfig();
            const extractorConfig = config.extractors[0];

            // Determine source file path
            const sourceFilePath = options.source ||
                (typeof extractorConfig.pattern === 'string' ? extractorConfig.pattern : extractorConfig.pattern[0]);

            if (!sourceFilePath) {
                throw new Error('Source file path not specified. Use --source option or configure extractors in config file.');
            }

            const resolvedSourcePath = resolve(sourceFilePath);

            if (!existsSync(resolvedSourcePath)) {
                throw new Error(`Source file not found: ${resolvedSourcePath}`);
            }

            // Determine output path
            const outputPath = options.output ||
                extractorConfig.contextFile?.pattern ||
                resolvedSourcePath.replace(/\.json$/, '.context.json');

            const resolvedOutputPath = resolve(outputPath);

            console.log(chalk.gray(`  Source: ${resolvedSourcePath}`));
            console.log(chalk.gray(`  Output: ${resolvedOutputPath}`));
            console.log(chalk.gray(`  Merge:  ${options.merge ? 'Yes' : 'No'}\\n`));

            if (options.dryRun) {
                console.log(chalk.yellow('⚠️  Dry-run mode - no files will be written\\n'));
                console.log(chalk.green('✅ Context file would be generated at:'));
                console.log(chalk.gray(`  ${resolvedOutputPath}\\n`));
                process.exit(0);
                return;
            }

            // Generate context file
            await ContextGenerator.generateContextTemplate(
                resolvedSourcePath,
                resolvedOutputPath,
                options.merge
            );

            console.log(chalk.green('✅ Context file generated successfully!'));
            console.log(chalk.gray(`\\n💡 Tip: Edit ${outputPath} to add context for each translation key\\n`));

            process.exit(0);
        } catch (error: unknown) {
            console.error(chalk.red('❌ Generate failed:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

contextCommand
    .command('validate')
    .description('Validate context file matches source file')
    .option('--source <path>', 'Source file path (overrides config)')
    .option('--context <path>', 'Context file path (overrides config)')
    .action(async (options) => {
        try {
            console.log(chalk.blue('🔍 Validating context file...\\n'));

            const config = await loadConfig();
            const extractorConfig = config.extractors[0];

            // Determine source file path
            const sourceFilePath = options.source ||
                (typeof extractorConfig.pattern === 'string' ? extractorConfig.pattern : extractorConfig.pattern[0]);

            // Determine context file path
            const contextFilePath = options.context ||
                extractorConfig.contextFile?.pattern ||
                sourceFilePath.replace(/\.json$/, '.context.json');

            const resolvedSourcePath = resolve(sourceFilePath);
            const resolvedContextPath = resolve(contextFilePath);

            if (!existsSync(resolvedSourcePath)) {
                throw new Error(`Source file not found: ${resolvedSourcePath}`);
            }

            if (!existsSync(resolvedContextPath)) {
                throw new Error(`Context file not found: ${resolvedContextPath}`);
            }

            console.log(chalk.gray(`  Source:  ${resolvedSourcePath}`));
            console.log(chalk.gray(`  Context: ${resolvedContextPath}\\n`));

            // Validate context file
            const result = ContextGenerator.validateContextFile(resolvedSourcePath, resolvedContextPath);

            if (result.errors.length === 0 && result.warnings.length === 0) {
                console.log(chalk.green('✅ Context file is valid!\\n'));
                process.exit(0);
                return;
            }

            if (result.errors.length > 0) {
                console.log(chalk.red('❌ Errors found:\\n'));
                result.errors.forEach(error => {
                    console.log(chalk.red(`  • ${error}`));
                });
                console.log();
            }

            if (result.warnings.length > 0) {
                console.log(chalk.yellow('⚠️  Warnings:\\n'));
                result.warnings.forEach(warning => {
                    console.log(chalk.yellow(`  • ${warning}`));
                });
                console.log();
            }

            process.exit(result.errors.length > 0 ? 1 : 0);
        } catch (error: unknown) {
            console.error(chalk.red('❌ Validation failed:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

contextCommand
    .command('sync')
    .description('Sync context file with source file (add new keys, remove deleted keys)')
    .option('--source <path>', 'Source file path (overrides config)')
    .option('--context <path>', 'Context file path (overrides config)')
    .option('--dry-run', 'Preview changes without writing', false)
    .action(async (options) => {
        try {
            console.log(chalk.blue('🔄 Syncing context file with source...\\n'));

            const config = await loadConfig();
            const extractorConfig = config.extractors[0];

            // Determine source file path
            const sourceFilePath = options.source ||
                (typeof extractorConfig.pattern === 'string' ? extractorConfig.pattern : extractorConfig.pattern[0]);

            // Determine context file path
            const contextFilePath = options.context ||
                extractorConfig.contextFile?.pattern ||
                sourceFilePath.replace(/\.json$/, '.context.json');

            const resolvedSourcePath = resolve(sourceFilePath);
            const resolvedContextPath = resolve(contextFilePath);

            if (!existsSync(resolvedSourcePath)) {
                throw new Error(`Source file not found: ${resolvedSourcePath}`);
            }

            console.log(chalk.gray(`  Source:  ${resolvedSourcePath}`));
            console.log(chalk.gray(`  Context: ${resolvedContextPath}\\n`));

            // Check if context file exists
            const contextExists = existsSync(resolvedContextPath);

            if (!contextExists) {
                console.log(chalk.yellow('⚠️  Context file does not exist. Creating new one...\\n'));
            }

            if (options.dryRun) {
                console.log(chalk.yellow('⚠️  Dry-run mode - no files will be written\\n'));

                if (contextExists) {
                    console.log(chalk.green('✅ Context file would be synced:'));
                    console.log(chalk.gray('  • New keys from source would be added'));
                    console.log(chalk.gray('  • Deleted keys would be removed'));
                    console.log(chalk.gray('  • Existing context would be preserved\\n'));
                } else {
                    console.log(chalk.green('✅ New context file would be created\\n'));
                }

                process.exit(0);
                return;
            }

            // Sync context file (merge mode if exists, create if not)
            await ContextGenerator.generateContextTemplate(
                resolvedSourcePath,
                resolvedContextPath,
                contextExists  // Merge if exists
            );

            if (contextExists) {
                console.log(chalk.green('✅ Context file synced successfully!'));
                console.log(chalk.gray('  • New keys added'));
                console.log(chalk.gray('  • Deleted keys removed'));
                console.log(chalk.gray('  • Existing context preserved\\n'));
            } else {
                console.log(chalk.green('✅ Context file created successfully!'));
                console.log(chalk.gray(`\\n💡 Tip: Edit ${contextFilePath} to add context for each translation key\\n`));
            }

            process.exit(0);
        } catch (error: unknown) {
            console.error(chalk.red('❌ Sync failed:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

contextCommand
    .command('import')
    .description('Import/generate context file from source JSON (preserves existing translations)')
    .option('--source <path>', 'Source JSON file to generate context from')
    .option('--output <path>', 'Output context file path')
    .option('--merge', 'Merge with existing context file (default: true)', true)
    .option('--dry-run', 'Preview changes without writing', false)
    .action(async (options) => {
        try {
            console.log(chalk.blue('📥 Importing context from source...\\n'));

            const config = await loadConfig();
            const extractorConfig = config.extractors[0];

            // Determine source file path
            const sourceFilePath = options.source ||
                (typeof extractorConfig.pattern === 'string' ? extractorConfig.pattern : extractorConfig.pattern[0]);

            if (!sourceFilePath) {
                throw new Error('Source file path required. Use --source option or configure extractors in config file.');
            }

            // Determine output context file path
            const outputPath = options.output ||
                extractorConfig.contextFile?.pattern ||
                sourceFilePath.replace(/\.json$/, '.context.json');

            const resolvedSourcePath = resolve(sourceFilePath);
            const resolvedOutputPath = resolve(outputPath);

            if (!existsSync(resolvedSourcePath)) {
                throw new Error(`Source file not found: ${resolvedSourcePath}`);
            }

            console.log(chalk.gray(`  Source:  ${resolvedSourcePath}`));
            console.log(chalk.gray(`  Output:  ${resolvedOutputPath}`));
            console.log(chalk.gray(`  Merge:   ${options.merge ? 'Yes' : 'No'}\\n`));

            // Check if context file already exists
            const contextExists = existsSync(resolvedOutputPath);

            if (options.dryRun) {
                console.log(chalk.yellow('⚠️  Dry-run mode - no files will be written\\n'));
                console.log(chalk.green('✅ Context would be imported from source'));

                if (contextExists && options.merge) {
                    console.log(chalk.gray('  • Existing context would be preserved'));
                    console.log(chalk.gray('  • New keys from source would be added'));
                    console.log(chalk.gray('  • Source values would be updated to match current source'));
                    console.log(chalk.gray('  • Existing translations remain unaffected\\n'));
                } else if (contextExists) {
                    console.log(chalk.gray('  • Context file would be overwritten\\n'));
                } else {
                    console.log(chalk.gray('  • New context file would be created\\n'));
                }

                process.exit(0);
                return;
            }

            // Generate context from source
            await ContextGenerator.generateContextTemplate(
                resolvedSourcePath,
                resolvedOutputPath,
                contextExists && options.merge  // Merge if exists and merge flag is true
            );

            console.log(chalk.green('✅ Context imported from source successfully!'));

            if (contextExists && options.merge) {
                console.log(chalk.gray('  • Existing context preserved'));
                console.log(chalk.gray('  • New keys from source added'));
                console.log(chalk.gray('  • Source values updated to match current source'));
                console.log(chalk.gray('  • Your existing translations are safe\\n'));
            } else if (contextExists) {
                console.log(chalk.gray('  • Context file overwritten\\n'));
            } else {
                console.log(chalk.gray('  • New context file created'));
                console.log(chalk.gray(`  • Edit ${outputPath} to add context for each key\\n`));
            }

            console.log(chalk.blue('💡 Tip: Your existing translations will NOT be affected.'));
            console.log(chalk.gray('   Context files only improve future translations.\\n'));

            process.exit(0);
        } catch (error: unknown) {
            console.error(chalk.red('❌ Import failed:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

// Alias 'update' to 'sync' for backward compatibility
contextCommand
    .command('update')
    .description('Alias for sync - update context file with new/removed keys from source')
    .option('--source <path>', 'Source file path (overrides config)')
    .option('--context <path>', 'Context file path (overrides config)')
    .option('--dry-run', 'Preview changes without writing', false)
    .action(async (options) => {
        // Just call sync with the same options by reconstructing the command
        const args = ['node', 'cli', 'context', 'sync'];
        if (options.source) args.push('--source', options.source);
        if (options.context) args.push('--context', options.context);
        if (options.dryRun) args.push('--dry-run');

        const syncCmd = contextCommand.commands.find(cmd => cmd.name() === 'sync');
        if (syncCmd) {
            await syncCmd.parseAsync(args);
        }
    });
