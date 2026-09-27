/**
 * Shared project-state loading for CLI commands (Epic 010).
 *
 * Reads config → source catalog → target snapshots → registry revisions →
 * skills. Every step degrades gracefully: missing registry means zero
 * revisions (v2 project), missing skills means an empty set. Commands stay
 * thin; all decisions live in testable modules.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, join, parse } from 'node:path';
import { createRequire } from 'node:module';
import type { translatronxConfig } from '../config/schema.js';
import { loadConfig } from '../config/loader.js';
import { configuredCatalogAdapter } from '../catalogs/configured.js';
import { applySourceContext } from '../catalogs/source-context.js';
import { AtomicFileWriter } from '../file-writer/index.js';
import type { SourceUnit, TargetSnapshot, TranslationRevision } from '../core/domain.js';
import { readRegistry } from '../registry/reader.js';
import { loadSkills } from '../skills/loader.js';
import type { LoadedSkill } from '../skills/types.js';
import { computeHash } from '../utils/hash.js';

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
    const { adapter, extractors } = await configuredCatalogAdapter(config.extractors);
    const sources = await Promise.all(extractors.map(async (extractor) => {
        const files = await adapter.discover(extractor.pattern, extractor.exclude);
        const catalogs = files.length > 0 ? await adapter.read(files, {
            locale: config.sourceLanguage,
            ...(extractor.keyPrefix !== undefined ? { keyPrefix: extractor.keyPrefix } : {}),
            ...(extractor.exclude !== undefined ? { exclude: extractor.exclude } : {}),
        }) : [];
        if (extractor.contextFile?.enabled) {
            for (const catalog of catalogs) {
                const contextPath = extractor.contextFile.pattern
                    ?? (/\.json$/i.test(catalog.sourceFile)
                        ? catalog.sourceFile.replace(/\.json$/i, '.context.json')
                        : `${catalog.sourceFile}.context.json`);
                applySourceContext(catalog.units, resolve(process.cwd(), contextPath), extractor.keyPrefix);
            }
        }
        return { files, catalogs };
    }));
    const sourceFiles = sources.flatMap((source) => source.files);
    const sourceCatalogs = sources.flatMap((source) => source.catalogs);
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
        const pinned = config.skills?.package;
        if (pinned !== undefined) {
            const requireFromProject = createRequire(resolve(process.cwd(), 'package.json'));
            const packageEntry = requireFromProject.resolve(pinned.name);
            const manifestPath = findPackageManifest(dirname(packageEntry), pinned.name);
            const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { version?: string };
            if (manifest.version !== pinned.version) {
                throw new Error(`Organization policy package ${pinned.name} is ${manifest.version ?? 'unversioned'}; config requires exactly ${pinned.version}.`);
            }
            const packageRoot = dirname(manifestPath);
            const policyRoot = [join(packageRoot, 'translatron', 'skills'), join(packageRoot, 'skills')].find(existsSync)
                ?? (existsSync(join(packageRoot, 'SKILL.md')) ? packageRoot : undefined);
            if (policyRoot === undefined) throw new Error(`Organization policy package ${pinned.name} has no translatron/skills/, skills/, or root SKILL.md.`);
            const organization = await loadSkills(policyRoot);
            const policyTag = `${pinned.name}@${pinned.version}`;
            skills = [
                ...organization.skills.map((skill) => ({ ...skill, id: `org:${pinned.name}:${skill.id}`, priority: -1, fingerprint: computeHash(`${policyTag}:${skill.fingerprint}`) })),
                ...skills,
            ];
            skillWarnings.push(...organization.warnings);
        }
    } catch (error) {
        if (config.skills?.package !== undefined) throw error;
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

function findPackageManifest(start: string, packageName: string): string {
    let directory = start;
    while (true) {
        const manifestPath = join(directory, 'package.json');
        if (existsSync(manifestPath)) {
            const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { name?: string };
            if (manifest.name === packageName) return manifestPath;
        }
        const parent = dirname(directory);
        if (parent === directory || directory === parse(directory).root) break;
        directory = parent;
    }
    throw new Error(`Could not find package.json for installed organization policy package ${packageName}.`);
}
