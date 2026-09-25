/**
 * Shared project-state loading for CLI commands (Epic 010).
 *
 * Reads config → source catalog → target snapshots → registry revisions →
 * skills. Every step degrades gracefully: missing registry means zero
 * revisions (v2 project), missing skills means an empty set. Commands stay
 * thin; all decisions live in testable modules.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { translatronxConfig } from '../config/schema.js';
import { loadConfig } from '../config/loader.js';
import { GenericJsonAdapter } from '../catalogs/generic-json.js';
import { AtomicFileWriter } from '../file-writer/index.js';
import type { SourceUnit, TargetSnapshot, TranslationRevision } from '../core/domain.js';
import { computeHash } from '../utils/hash.js';
import { readRegistry } from '../registry/reader.js';
import { loadSkills } from '../skills/loader.js';
import type { LoadedSkill } from '../skills/types.js';

export interface ProjectState {
    config: translatronxConfig;
    sourceFiles: string[];
    sourceUnits: SourceUnit[];
    targets: TargetSnapshot[];
    /** Target locales with their catalog file paths (found or expected). */
    targetFiles: Array<{ locale: string; path: string; found: boolean }>;
    revisions: TranslationRevision[];
    registryPresent: boolean;
    registryReadable: boolean;
    registryDetail: string;
    skills: LoadedSkill[];
    skillWarnings: string[];
    registryDir: string;
}

function snapshotEntries(units: Array<{ keyPath: string; sourceText: string }>): TargetSnapshot['entries'] {
    const entries: TargetSnapshot['entries'] = {};
    for (const unit of units) {
        entries[unit.keyPath] = { text: unit.sourceText, targetHash: computeHash(unit.sourceText) };
    }
    return entries;
}

/** Load full project state. Never throws on missing registry/skills. */
export async function loadProjectState(configOverride?: translatronxConfig): Promise<ProjectState> {
    const config = configOverride ?? (await loadConfig());
    const adapter = new GenericJsonAdapter();
    const pattern = config.extractors[0]?.pattern ?? './locales/en.json';
    const sourceFiles = await adapter.discover(pattern).catch(() => [] as string[]);
    const sourceCatalogs = sourceFiles.length > 0
        ? await adapter.read(sourceFiles, { locale: config.sourceLanguage })
        : [];
    const sourceUnits = sourceCatalogs.flatMap((catalog) => catalog.units);

    const targets: TargetSnapshot[] = [];
    const targetFiles: ProjectState['targetFiles'] = [];
    for (const language of config.targetLanguages) {
        const file = resolve(process.cwd(), AtomicFileWriter.getOutputPath(language, config.output));
        if (!existsSync(file)) {
            targetFiles.push({ locale: language.shortCode, path: file, found: false });
            // Configured but never created: empty snapshot so NEW keys plan
            // against the locale (and `check` reports them MISSING per CI-02).
            targets.push({ locale: language.shortCode, entries: {} });
            continue;
        }
        targetFiles.push({ locale: language.shortCode, path: file, found: true });
        const [catalog] = await adapter.read([file], { locale: language.shortCode });
        targets.push({ locale: language.shortCode, entries: snapshotEntries(catalog.units) });
    }

    const registryDir = resolve(process.cwd(), config.registry?.dir ?? './.translatron');
    let revisions: TranslationRevision[] = [];
    let registryPresent = existsSync(registryDir);
    let registryReadable = false;
    let registryDetail = 'No v3 registry found.';
    if (registryPresent) {
        try {
            const loaded = readRegistry({ registryDir });
            revisions = loaded.revisions;
            registryReadable = true;
            registryDetail = `${revisions.length} revision${revisions.length === 1 ? '' : 's'} indexed.`;
        } catch (error) {
            registryDetail = `Registry unreadable: ${error instanceof Error ? error.message : String(error)}`;
        }
    }

    const skillsDir = resolve(process.cwd(), config.skills?.dir ?? './translatron/skills');
    const extraPaths = (config.skills?.paths ?? []).map((path) => resolve(process.cwd(), path));
    let skills: LoadedSkill[] = [];
    let skillWarnings: string[] = [];
    try {
        const loaded = await loadSkills(skillsDir, extraPaths);
        skills = loaded.skills;
        skillWarnings = loaded.warnings;
    } catch (error) {
        skillWarnings = [`Skill load failed: ${error instanceof Error ? error.message : String(error)}`];
    }

    return {
        config,
        sourceFiles,
        sourceUnits,
        targets,
        targetFiles,
        revisions,
        registryPresent,
        registryReadable,
        registryDetail,
        skills,
        skillWarnings,
        registryDir,
    };
}
