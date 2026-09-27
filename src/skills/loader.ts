/**
 * Skill discovery + bundle loading (Epic 009, D1/D2/D6).
 *
 * Recognizes `translatron/skills/**\/SKILL.md` packages and explicit
 * arbitrary `.md` references (R&D §12). Each SKILL.md may carry a small
 * frontmatter block (`id`, `scope`, `locales`, `keys`, `catalog`);
 * sibling bundle files (`glossary.csv`, `examples.json`, `references/`)
 * are loaded as worker-readable resources.
 *
 * Missing skills dir = zero skills (valid project). Malformed frontmatter
 * fails fast with the file path — deterministic, never guessed.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import fg from 'fast-glob';
import { fingerprintSkill } from './fingerprint.js';
import type { DomainSelector, LoadedSkill, SkillScope } from './types.js';

const MAX_RESOURCE_BYTES = 256 * 1024;

export interface SkillFrontmatter {
    id?: string;
    scope?: SkillScope;
    locales?: string[];
    keys?: string[];
    catalog?: string;
}

/** Parse a `---` frontmatter block. Returns remainder as body. Throws on malformed input. */
export function parseFrontmatter(docPath: string, raw: string): { frontmatter: SkillFrontmatter; body: string } {
    const frontmatter: SkillFrontmatter = {};
    if (!raw.startsWith('---')) return { frontmatter, body: raw };
    const end = raw.indexOf('\n---', 3);
    if (end < 0) {
        throw new Error(`Unterminated frontmatter block in ${docPath}`);
    }
    const block = raw.substring(3, end);
    const body = raw.substring(end + 4).replace(/^\r?\n/, '');
    let currentListKey: 'locales' | 'keys' | null = null;
    for (const [lineNumber, line] of block.replace(/\r/g, '').split('\n').map((line, index) => [index + 1, line] as const)) {
        if (line.trim() === '' || line.trim().startsWith('#')) continue;
        const listItem = line.match(/^\s*-\s+(.+)$/);
        if (listItem !== null) {
            if (currentListKey === null) {
                throw new Error(`List item without a key (line ${lineNumber}) in ${docPath}`);
            }
            (frontmatter[currentListKey] as string[]).push(unquote(listItem[1].trim()));
            continue;
        }
        currentListKey = null;
        const field = line.match(/^([A-Za-z]+):\s*(.*)$/);
        if (field === null) {
            throw new Error(`Malformed frontmatter line ${lineNumber} in ${docPath}: ${line.trim()}`);
        }
        const [, key, value] = field;
        if (key === 'id' || key === 'scope' || key === 'catalog') {
            if (key === 'scope' && value !== 'global' && value !== 'language' && value !== 'domain') {
                throw new Error(`Invalid scope "${value}" (line ${lineNumber}) in ${docPath}: expected global, language, or domain`);
            }
            (frontmatter as Record<string, string>)[key] = unquote(value.trim());
        } else if (key === 'locales' || key === 'keys') {
            if (value.trim() === '') {
                (frontmatter[key] as string[]) = [];
                currentListKey = key;
            } else {
                (frontmatter[key] as string[]) = parseInlineList(docPath, lineNumber, value);
            }
        } else {
            throw new Error(`Unknown frontmatter field "${key}" (line ${lineNumber}) in ${docPath}`);
        }
    }
    return { frontmatter, body };
}

function unquote(value: string): string {
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1);
    if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
    return value;
}

function parseInlineList(docPath: string, lineNumber: number, value: string): string[] {
    const trimmed = value.trim();
    if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
        throw new Error(`Expected [a, b] list (line ${lineNumber}) in ${docPath}: ${value.trim()}`);
    }
    const inner = trimmed.slice(1, -1).trim();
    if (inner === '') return [];
    return inner.split(',').map((item) => unquote(item.trim()));
}

/** Parse `source,target` glossary rows. First line skipped when it looks like a header. */
export function parseGlossaryCsv(raw: string): Record<string, string> {
    const glossary: Record<string, string> = {};
    const lines = raw.replace(/\r\n/g, '\n').split('\n');
    for (const [index, line] of lines.map((line, index) => [index, line] as const)) {
        const trimmed = line.trim();
        if (trimmed === '' || trimmed.startsWith('#')) continue;
        const separator = trimmed.indexOf(',');
        if (separator <= 0) continue;
        const source = trimmed.substring(0, separator).trim();
        const target = trimmed.substring(separator + 1).trim();
        if (index === 0 && /^(source|term)$/i.test(source) && /^target$/i.test(target)) continue;
        if (source !== '' && target !== '') glossary[source] = target;
    }
    return glossary;
}

/** Parse `[{keyPath|key, text|translation}]` examples tolerantly. */
export function parseExamplesJson(raw: string): Array<{ keyPath: string; text: string }> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        throw new Error(`Invalid examples.json: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!Array.isArray(parsed)) throw new Error('Invalid examples.json: expected a top-level array');
    const examples: Array<{ keyPath: string; text: string }> = [];
    for (const entry of parsed) {
        if (entry === null || typeof entry !== 'object') continue;
        const record = entry as Record<string, unknown>;
        const keyPath = record['keyPath'] ?? record['key'];
        const text = record['text'] ?? record['translation'];
        if (typeof keyPath === 'string' && typeof text === 'string') {
            examples.push({ keyPath, text });
        }
    }
    return examples;
}

function readTextFileIfPresent(path: string, warnings: string[]): string | null {
    if (!existsSync(path)) return null;
    try {
        const stats = statSync(path);
        if (stats.size > MAX_RESOURCE_BYTES) {
            warnings.push(`Skipping oversized resource (>256KB): ${path}`);
            return null;
        }
        return readFileSync(path, 'utf-8');
    } catch (error) {
        warnings.push(`Skipping unreadable resource ${path}: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}

function loadBundleResources(skillDir: string, warnings: string[]): { resources: Map<string, string>; glossary: Record<string, string>; examples: Array<{ keyPath: string; text: string }> } {
    const resources = new Map<string, string>();
    let glossary: Record<string, string> = {};
    let examples: Array<{ keyPath: string; text: string }> = [];
    const glossaryRaw = readTextFileIfPresent(join(skillDir, 'glossary.csv'), warnings);
    if (glossaryRaw !== null) {
        glossary = parseGlossaryCsv(glossaryRaw);
        resources.set('glossary.csv', glossaryRaw);
    }
    const examplesRaw = readTextFileIfPresent(join(skillDir, 'examples.json'), warnings);
    if (examplesRaw !== null) {
        try {
            examples = parseExamplesJson(examplesRaw);
        } catch (error) {
            throw new Error(`${join(skillDir, 'examples.json')}: ${error instanceof Error ? error.message : String(error)}`);
        }
        resources.set('examples.json', examplesRaw);
    }
    const referencesDir = join(skillDir, 'references');
    if (existsSync(referencesDir) && statSync(referencesDir).isDirectory()) {
        for (const entry of readdirSync(referencesDir)) {
            const full = join(referencesDir, entry);
            if (!statSync(full).isFile()) continue;
            const text = readTextFileIfPresent(full, warnings);
            if (text !== null) resources.set(`references/${entry}`, text);
        }
    }
    return { resources, glossary, examples };
}

function inferScopeFromPath(skillDir: string, docPath: string): SkillScope {
    const normalized = `${skillDir}/${docPath}`.replace(/\\/g, '/');
    if (normalized.includes('/domains/')) return 'domain';
    if (normalized.includes('/languages/')) return 'language';
    return 'global';
}

/** Locale affinity from a `languages/<tag>/SKILL.md` layout (`ja` → [`ja`], `ja-JP` → [`ja-JP`]). */
function inferLocalesFromPath(skillDir: string, docPath: string, scope: SkillScope): string[] {
    if (scope !== 'language') return [];
    const dir = basename(dirname(resolve(skillDir, docPath)));
    if (dir === 'languages' || dir === 'skills') return [];
    return [dir];
}

function loadSkillDocument(docPath: string, defaults: { id: string; scope: SkillScope; locales: string[] }, warnings: string[]): LoadedSkill {
    const raw = readFileSync(docPath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(docPath, raw);
    const skillDir = dirname(docPath);
    const { resources, glossary, examples } = loadBundleResources(skillDir, warnings);
    const scope = frontmatter.scope ?? defaults.scope;
    const locales = frontmatter.locales ?? defaults.locales;
    const selector: DomainSelector | undefined =
        scope === 'domain' && (frontmatter.keys !== undefined || frontmatter.catalog !== undefined || frontmatter.locales !== undefined)
            ? {
                ...(frontmatter.keys !== undefined ? { keys: frontmatter.keys } : {}),
                ...(frontmatter.catalog !== undefined ? { catalog: frontmatter.catalog } : {}),
                ...(frontmatter.locales !== undefined ? { locales: frontmatter.locales } : {}),
            }
            : undefined;
    return {
        id: frontmatter.id ?? defaults.id,
        scope,
        locales,
        docPath,
        content: body,
        resources,
        glossary,
        examples,
        fingerprint: fingerprintSkill(body, resources),
        ...(selector !== undefined ? { selector } : {}),
    };
}

export interface DiscoveredSkills {
    skills: LoadedSkill[];
    warnings: string[];
}

function assertUniqueIds(skills: LoadedSkill[]): void {
    const seen = new Set<string>();
    for (const skill of skills) {
        if (seen.has(skill.id)) {
            throw new Error(`Duplicate skill id "${skill.id}" (at ${skill.docPath}); skill ids must be unique`);
        }
        seen.add(skill.id);
    }
}

/** Discover `**\/SKILL.md` packages under a skills root. Missing dir = zero skills. */
export async function discoverSkills(skillsDir: string): Promise<DiscoveredSkills> {
    const warnings: string[] = [];
    if (!existsSync(skillsDir)) return { skills: [], warnings };
    // fast-glob requires forward slashes, even on Windows.
    const pattern = `${resolve(skillsDir).replace(/\\/g, '/')}/**/SKILL.md`;
    const docPaths = (await fg([pattern], { absolute: true, onlyFiles: true, ignore: ['**/node_modules/**', '**/dist/**'] })).sort();
    const skills = docPaths.map((docPath) => {
        const scope = inferScopeFromPath(skillsDir, docPath);
        const fallbackId = basename(dirname(docPath));
        return loadSkillDocument(docPath, {
            id: fallbackId,
            scope,
            locales: inferLocalesFromPath(skillsDir, docPath, scope),
        }, warnings);
    });
    assertUniqueIds(skills);
    return { skills, warnings };
}

/** Load explicit arbitrary `.md` references as global all-locale skills. */
export function loadExplicitSkills(paths: string[]): DiscoveredSkills {
    const warnings: string[] = [];
    const skills = paths.map((path) => {
        const docPath = resolve(path);
        if (!existsSync(docPath)) {
            throw new Error(`Skill reference not found: ${path}`);
        }
        const fallbackId = basename(docPath).replace(/\.md$/i, '');
        return loadSkillDocument(docPath, { id: fallbackId, scope: 'global', locales: [] }, warnings);
    });
    assertUniqueIds(skills);
    return { skills, warnings };
}

/** Full load: packages + explicit refs (duplicate ids across both fail fast). */
export async function loadSkills(skillsDir: string, extraPaths: string[] = []): Promise<DiscoveredSkills> {
    const fromDir = await discoverSkills(skillsDir);
    const explicit = loadExplicitSkills(extraPaths);
    const skills = [...fromDir.skills, ...explicit.skills];
    assertUniqueIds(skills);
    return { skills, warnings: [...fromDir.warnings, ...explicit.warnings] };
}
