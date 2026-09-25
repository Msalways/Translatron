/**
 * `translatronx registry` command group (Epic 017, §17).
 *
 * Allowed: status, verify, repair. Not allowed: edit, sync.
 * (`sync` is normal git flow under the committed-folder model.)
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { resolve } from 'node:path';
import { loadConfig } from '../../config/loader.js';
import { registryStatus, formatRegistryStatus } from './status.js';
import { verifyRegistry, formatVerifyReport } from './verify.js';
import { repairRegistry, formatRepairOutcome } from './repair.js';

function registryDirFromConfig(): Promise<string> {
    return loadConfig().then((config) => resolve(process.cwd(), config.registry?.dir ?? './.translatron'));
}

const statusCommand = new Command('status')
    .description('Show registry health counts (read-only)')
    .action(async () => {
        try {
            const status = registryStatus(await registryDirFromConfig());
            console.log(formatRegistryStatus(status));
            process.exit(0);
        } catch (error: unknown) {
            console.error(chalk.red('Registry status failed:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

const verifyCommand = new Command('verify')
    .description('Verify registry integrity (checksums, names, ancestry; read-only)')
    .action(async () => {
        try {
            const report = verifyRegistry(await registryDirFromConfig());
            if (report.ok) {
                console.log(chalk.green(formatVerifyReport(report)));
                process.exit(0);
            }
            console.log(chalk.red(formatVerifyReport(report)));
            process.exit(1);
        } catch (error: unknown) {
            console.error(chalk.red('Registry verify failed:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

const repairCommand = new Command('repair')
    .description('Quarantine corrupt segments (never rewrites history)')
    .action(async () => {
        try {
            const outcome = repairRegistry(await registryDirFromConfig());
            console.log(formatRepairOutcome(outcome));
            process.exit(0);
        } catch (error: unknown) {
            console.error(chalk.red('Registry repair failed:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

export const registryCommand = new Command('registry')
    .description('Inspect and maintain the machine-owned registry (never edit)')
    .addCommand(statusCommand)
    .addCommand(verifyCommand)
    .addCommand(repairCommand);
