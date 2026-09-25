/**
 * Deterministic skill resolution (Epic 009, D3/D4).
 *
 * Locale fallback is pure logic, never LLM-decided: global → language
 * (bare tag before region) → region → matching domains. Domain skills match
 * by key glob / catalog / locale affinity. Zero skills resolves to [].
 *
 * Staleness is conservative by design: the reconciler map (`currentSkillMap`)
 * unions every skill applicable to the locale at any key, so a domain-skill
 * rotation marks siblings SKILL_STALE rather than risking silent staleness.
 * Revisions record only the skills actually applied to the unit.
 */
import { fingerprintSkill, fingerprintSkillSet } from './fingerprint.js';
import type { LoadedSkill } from './types.js';

/** Language part of a locale tag (`pt-BR` → `pt`, `ja` → `ja`). */
export function langPart(locale: string): string {
    const separator = locale.indexOf('-');
    return separator < 0 ? locale : locale.substring(0, separator);
}

/**
 * Locale affinity: empty skill locales match everything; otherwise a skill
 * locale must equal the target or its language part.
 */
export function matchesLocale(skillLocales: string[], target: string): boolean {
    if (skillLocales.length === 0) return true;
    const language = langPart(target);
    return skillLocales.some((skillLocale) => skillLocale === target || skillLocale === language);
}

/** Key-path glob: `*` spans any characters, anchored full match. */
export function matchesKeyPattern(pattern: string, keyPath: string): boolean {
    const regex = new RegExp(`^${pattern.split('*').map(escapeRegex).join('.*')}$`);
    return regex.test(keyPath);
}

function escapeRegex(text: string): string {
    return text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

export interface ResolveInput {
    locale: string;
    keyPath: string;
    catalogId?: string;
}

/** Applicable chain for one unit, in worker prompt order. */
export function resolveSkillsForUnit(skills: LoadedSkill[], input: ResolveInput): LoadedSkill[] {
    const global: LoadedSkill[] = [];
    const language: LoadedSkill[] = [];
    const domain: LoadedSkill[] = [];
    for (const skill of skills) {
        if (skill.scope === 'global') {
            if (matchesLocale(skill.locales, input.locale)) global.push(skill);
        } else if (skill.scope === 'language') {
            if (matchesLocale(skill.locales, input.locale)) language.push(skill);
        } else {
            if (!matchesDomain(skill, input)) continue;
            domain.push(skill);
        }
    }
    global.sort(byId);
    // Bare language before region (`ja` before `ja-JP`), then id.
    language.sort((a, b) => specificity(a) - specificity(b) || byId(a, b));
    domain.sort(byId);
    return [...global, ...language, ...domain];
}

function matchesDomain(skill: LoadedSkill, input: ResolveInput): boolean {
    const selector = skill.selector;
    if (selector === undefined) return matchesLocale(skill.locales, input.locale);
    if (selector.locales !== undefined && !matchesLocale(selector.locales, input.locale)) return false;
    if (selector.catalog !== undefined && selector.catalog !== (input.catalogId ?? 'main')) return false;
    if (selector.keys !== undefined && !selector.keys.some((pattern) => matchesKeyPattern(pattern, input.keyPath))) {
        return false;
    }
    return true;
}

function byId(a: LoadedSkill, b: LoadedSkill): number {
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Specificity of the best-matching locale affinity (fewer segments = less specific). */
function specificity(skill: LoadedSkill): number {
    if (skill.locales.length === 0) return 0;
    return Math.min(...skill.locales.map((locale) => locale.split('-').length));
}

/**
 * Every skill applicable to a locale at any key (union for staleness,
 * glossaries, and worker materials). Key-scoped domains are included when
 * their locale affinity matches — locale-level consumers cannot narrow by
 * key, so the union is conservative by design.
 */
export function skillsForLocale(skills: LoadedSkill[], locale: string): LoadedSkill[] {
    const global = skills
        .filter((skill) => skill.scope === 'global' && matchesLocale(skill.locales, locale))
        .sort(byId);
    const language = skills
        .filter((skill) => skill.scope === 'language' && matchesLocale(skill.locales, locale))
        .sort((a, b) => specificity(a) - specificity(b) || byId(a, b));
    const domain = skills
        .filter((skill) => skill.scope === 'domain' && matchesLocale(skill.selector?.locales ?? skill.locales, locale))
        .sort(byId);
    return [...global, ...language, ...domain];
}

/** Reconciler input: skill id → current fingerprint for a locale. */
export function currentSkillMap(skills: LoadedSkill[], locale: string): Map<string, string> {
    return new Map(skillsForLocale(skills, locale).map((skill) => [skill.id, skill.fingerprint]));
}

/** Merged glossary for a locale (later skills override earlier). */
export function glossaryForLocale(skills: LoadedSkill[], locale: string): Record<string, string> {
    const merged: Record<string, string> = {};
    for (const skill of skillsForLocale(skills, locale)) {
        Object.assign(merged, skill.glossary);
    }
    return merged;
}

/** Worker material fragment for a locale (compiler adds TM examples). */
export function skillMaterialForLocale(
    skills: LoadedSkill[],
    locale: string
): { skills: Array<{ id: string; content: string }>; glossary: Record<string, string> } {
    const applicable = skillsForLocale(skills, locale);
    return {
        skills: applicable.map((skill) => ({ id: skill.id, content: skill.content })),
        glossary: glossaryForLocale(skills, locale),
    };
}

/** Combined fingerprint of an applied set (for planner `skillFingerprint` grouping). */
export function fingerprintAppliedSet(skills: LoadedSkill[]): string {
    return fingerprintSkillSet(skills.map((skill) => skill.fingerprint));
}

/** Minimal resource store backing the worker `get_skill_resource` tool (wired by the compiler). */
export interface SkillResourceStore {
    getSkillResource(skillId: string, resourcePath: string): string | null;
}

export function createSkillResourceStore(skills: LoadedSkill[]): SkillResourceStore {
    const byId = new Map(skills.map((skill) => [skill.id, skill]));
    return {
        getSkillResource(skillId: string, resourcePath: string): string | null {
            const skill = byId.get(skillId);
            if (skill === undefined) return null;
            const normalized = resourcePath.replace(/\\/g, '/').replace(/^\.\//, '');
            if (normalized === '' || normalized.startsWith('..') || normalized.includes('/../') || normalized.startsWith('/')) {
                return null;
            }
            return skill.resources.get(normalized) ?? null;
        },
    };
}

/** Epic 004 legacy prompt settings as a first-class global skill (consumed for real here). */
export function legacySkillToLoadedSkill(legacy: { content: string; glossary: Record<string, string> }): LoadedSkill {
    return {
        id: 'legacy-project',
        scope: 'global',
        locales: [],
        docPath: '<legacy-config>',
        content: legacy.content,
        resources: new Map(),
        glossary: { ...legacy.glossary },
        examples: [],
        fingerprint: fingerprintSkill(legacy.content, { 'glossary.json': JSON.stringify(legacy.glossary) }),
    };
}
