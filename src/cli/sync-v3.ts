/**
 * v3 sync wiring (Epic 015).
 *
 * Pure assembly (`assembleEngineInput`, independently testable with
 * StubRuntime, no keys) plus the thin `sync --v3` handler. The handler is
 * the ONLY place outside `src/runtime/deepagents/` that names the concrete
 * runtime class — via relative path, which the Epic 005 boundary test
 * (bare-specifier regex) permits; the test passing unchanged pins this.
 */
import chalk from 'chalk';
import { loadRawConfig } from '../config/loader.js';
import { normalizeConfig, toLegacyConfig, type NormalizedV3Config } from '../config/normalize.js';
import { loadProjectState, type ProjectState } from '../cli/project.js';
import { runSyncEngine, type EngineInput } from '../core/compiler.js';
import type { TranslationRuntime } from '../runtime/runtime.js';
import { DeepAgentRuntime } from '../runtime/deepagents/runtime.js';
import { detectConflicts } from '../cli/conflicts.js';
import { scopedKey } from '../core/reconciler.js';
import { ProgressRenderer } from './renderer/progress.js';
import { buildRunReport } from './renderer/json.js';
import { configuredCatalogAdapter } from '../catalogs/configured.js';

export interface V3SyncFlags {
    force?: boolean;
    verbose?: boolean;
    json?: boolean;
    dryRun?: boolean;
    affectedBySkill?: string;
}

/** Pure assembly of engine input from project state (testable, no I/O). */
export function assembleEngineInput(
    state: ProjectState,
    normalized: NormalizedV3Config,
    flags: V3SyncFlags,
    runtime: TranslationRuntime
): EngineInput {
    const targetFiles: Record<string, string> = {};
    for (const target of state.targetFiles) targetFiles[target.locale] = target.path;
    const prompts = state.config.prompts as
        | {
            systemPrompt?: string;
            userPrompt?: string[];
            customContext?: string;
            formatting?: string;
            brandVoice?: string;
            glossary?: Record<string, string>;
        }
        | undefined;
    const hasLegacyPrompts =
        prompts !== undefined &&
        (prompts.systemPrompt !== undefined ||
            prompts.userPrompt !== undefined ||
            prompts.customContext !== undefined ||
            prompts.formatting !== undefined ||
            prompts.brandVoice !== undefined ||
            (prompts.glossary !== undefined && Object.keys(prompts.glossary).length > 0));
    const conflictKeys = new Set(
        detectConflicts(state.revisions).map((view) => scopedKey(view.locale, view.keyPath))
    );
    return {
        catalogId: 'main',
        sourceLocale: state.config.sourceLanguage,
        sourceUnits: state.sourceUnits,
        targets: state.targets,
        targetFiles,
        revisions: state.revisions,
        skills: state.skills,
        ...(hasLegacyPrompts && prompts !== undefined ? { legacyPrompts: prompts } : {}),
        providers: normalized.providers,
        targetOnly: state.config.catalogs?.targetOnly ?? [],
        policies: state.config.policies,
        ...(flags.force === true ? { forceRegenerate: true } : {}),
        ...(flags.affectedBySkill !== undefined ? { affectedBySkill: flags.affectedBySkill } : {}),
        ...(flags.dryRun === true ? { dryRun: true } : {}),
        conflictKeys,
        ...(state.config.policies?.reviewKeys !== undefined && state.config.policies.reviewKeys.length > 0
            ? { requireReviewFor: [...state.config.policies.reviewKeys] }
            : {}),
        registryDir: state.registryDir,
        projectDir: process.cwd(),
        runtime,
        limits: normalized.limits,
        maxUnitsPerBatch: normalized.maxUnitsPerBatch,
    };
}

function isDryRunResult(result: unknown): result is { runId: string; plannedTranslations: number; plannedRemovals: number; tmReuses: number } {
    return (
        typeof result === 'object' &&
        result !== null &&
        'plannedTranslations' in result &&
        !('status' in result)
    );
}

/** Default v3 sync handler. Exit 3 means any locale remains incomplete. */
export async function runV3Sync(flags: V3SyncFlags): Promise<void> {
    if (flags.json !== true) {
        console.log(chalk.blue('Syncing translations (v3 engine)...\n'));
    }
    const raw = await loadRawConfig();
    const normalized = normalizeConfig(raw);
    for (const warning of normalized.warnings) {
        console.log(chalk.yellow(`  warning: ${warning}`));
    }
    const config = toLegacyConfig(raw, normalized);
    const state = await loadProjectState(config);
    const { adapter } = await configuredCatalogAdapter(config.extractors);
    const input = { ...assembleEngineInput(state, normalized, flags, new DeepAgentRuntime()), adapter };
    const result = await runSyncEngine(input);

    if (isDryRunResult(result)) {
        if (flags.json === true) {
            console.log(JSON.stringify(result, null, 2));
        } else {
            console.log(chalk.white('Dry run — no changes made.\n'));
            console.log(chalk.gray(`  Planned translations: ${result.plannedTranslations}`));
            console.log(chalk.gray(`  Planned removals:     ${result.plannedRemovals}`));
            console.log(chalk.gray(`  TM reuses:            ${result.tmReuses}\n`));
        }
        process.exit(0);
    }

    if (flags.json === true) {
        console.log(JSON.stringify(buildRunReport(result.runId, result.summaries), null, 2));
        process.exit(result.status === 'complete' ? 0 : 3);
    }
    const renderer = new ProgressRenderer({
        write: (line: string) => console.log(line),
        tty: process.stdout.isTTY ?? false,
        ...(flags.verbose === true ? { verbose: true } : {}),
    });
    for (const event of result.events) renderer.handle(event);
    renderer.summary(result.summaries, { tmReused: result.tmReused, filesUpdated: result.filesUpdated });
    const skippedParts: string[] = [];
    if (result.skipped.conflicts > 0) skippedParts.push(`conflicts: ${result.skipped.conflicts}`);
    if (result.skipped.needsReview > 0) skippedParts.push(`needs review: ${result.skipped.needsReview}`);
    if (result.skipped.preserved > 0) skippedParts.push(`preserved: ${result.skipped.preserved}`);
    if (skippedParts.length > 0) console.log(chalk.gray(`  Skipped (${skippedParts.join(', ')})\n`));
    process.exit(result.status === 'complete' ? 0 : 3);
}
