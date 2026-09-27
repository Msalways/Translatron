/**
 * Skill types (Epic 009, D1–D6).
 *
 * Skills are optional Markdown expertise layers: global house style,
 * language/region guidance, and domain rules. Zero skills is a valid
 * project — workers then run on core policy alone.
 */
import type { AppliedSkill } from '../core/domain.js';

/** Skill scope: house style, language/region guidance, or domain rules. */
export type SkillScope = 'global' | 'language' | 'domain';

/** Key/catalog/locale selector for domain skills (all present fields must match). */
export interface DomainSelector {
    /** Key-path globs, e.g. `checkout.*`. Absent = all keys. */
    keys?: string[];
    /** Catalog id. Absent = all catalogs. */
    catalog?: string;
    /** Locale affinity. Absent = all locales. */
    locales?: string[];
}

export interface LoadedSkill {
    /** Stable id: frontmatter `id`, directory name, or file basename. */
    id: string;
    scope: SkillScope;
    /**
     * Locale affinity. Empty = all locales. A skill matches target T when
     * one of its locales equals T or the language part of T
     * (`ja` matches `ja-JP`; `ja-JP` never matches bare `ja`).
     */
    locales: string[];
    /** Absolute path of the SKILL.md / .md document. */
    docPath: string;
    /** Normalized document body (frontmatter stripped). */
    content: string;
    /** Bundle resources, relative path → text (glossary.csv, examples.json, references/). */
    resources: Map<string, string>;
    /** Parsed glossary.csv rows (source → approved target). */
    glossary: Record<string, string>;
    /** Parsed examples.json entries. */
    examples: Array<{ keyPath: string; text: string }>;
    /** sha256 over normalized content + sorted resources. */
    fingerprint: string;
    /** Organization guidance sorts before repo-local guidance. */
    priority?: number;
    /** Domain selector (scope `domain` only). */
    selector?: DomainSelector;
}

/** Project skill configuration (compiler-owned; schema lands in Epic 010). */
export interface SkillsConfig {
    /** Skills root, default `./translatron/skills`. Missing dir = zero skills. */
    skillsDir?: string;
    /** Explicit arbitrary `.md` reference paths (R&D §12). */
    extraPaths?: string[];
}

export const DEFAULT_SKILLS_DIR = './translatron/skills';

/** Provenance form of applied skills, recorded on every agent revision. */
export function toAppliedSkills(skills: LoadedSkill[]): AppliedSkill[] {
    return skills.map((skill) => ({
        id: skill.id,
        scope: skill.scope,
        fingerprint: skill.fingerprint,
    }));
}
