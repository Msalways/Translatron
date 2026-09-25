import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    discoverSkills,
    loadExplicitSkills,
    loadSkills,
    parseExamplesJson,
    parseFrontmatter,
    parseGlossaryCsv,
} from '../../src/skills/loader.js';
import { fingerprintSkill, fingerprintSkillSet, normalizeSkillContent } from '../../src/skills/fingerprint.js';
import {
    createSkillResourceStore,
    currentSkillMap,
    fingerprintAppliedSet,
    glossaryForLocale,
    langPart,
    legacySkillToLoadedSkill,
    matchesKeyPattern,
    matchesLocale,
    resolveSkillsForUnit,
    skillMaterialForLocale,
    skillsForLocale,
} from '../../src/skills/resolver.js';
import { toAppliedSkills } from '../../src/skills/types.js';
import { reconcile } from '../../src/core/reconciler.js';
import { computeHash } from '../../src/utils/hash.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_ROOT = join(__dirname, '..', 'fixtures', 'skills', 'translatron', 'skills');
const GUIDELINES = join(__dirname, '..', 'fixtures', 'skills', 'docs', 'localization-guidelines.md');

const chainIds = (locale: string, keyPath: string, catalogId = 'main') =>
    resolveSkillsForUnit(FIXTURE_SKILLS, { locale, keyPath, catalogId }).map((s) => s.id);

let FIXTURE_SKILLS: Awaited<ReturnType<typeof discoverSkills>>['skills'] = [];

describe('skills: discovery (S-T002/FR-001)', () => {
    it('discovers the SKILL.md tree with scopes, locales, and bundles', async () => {
        const { skills, warnings } = await discoverSkills(SKILLS_ROOT);
        FIXTURE_SKILLS = skills;
        expect(warnings).toEqual([]);
        expect(skills.map((s) => s.id).sort()).toEqual([
            'ecommerce',
            'global',
            'ja',
            'ja-JP',
            'legal',
            'pt',
        ]);
        const byId = new Map(skills.map((s) => [s.id, s]));
        expect(byId.get('global')?.scope).toBe('global');
        expect(byId.get('ja')?.scope).toBe('language');
        expect(byId.get('ja')?.locales).toEqual(['ja']);
        expect(byId.get('ja-JP')?.locales).toEqual(['ja-JP']);
        expect(byId.get('ecommerce')?.scope).toBe('domain');
        expect(byId.get('ecommerce')?.selector?.keys).toEqual(['checkout.*', 'cart.*']);
        expect(byId.get('legal')?.selector?.locales).toEqual(['de-DE']);
        // Bundles loaded.
        expect(byId.get('ecommerce')?.glossary).toEqual({ checkout: 'carrinho', cart: 'carrinho' });
        expect(byId.get('ecommerce')?.examples).toEqual([
            { keyPath: 'checkout.payNow', text: 'Payer' },
            { keyPath: 'cart.title', text: 'Panier' },
        ]);
        expect(byId.get('ecommerce')?.resources.get('references/cta-note.md')).toContain('Pay now');
        for (const skill of skills) {
            expect(skill.fingerprint).toMatch(/^[0-9a-f]{64}$/);
            expect(skill.content).not.toContain('---');
        }
    });

    it('missing dir resolves to zero skills (valid project)', async () => {
        const { skills } = await discoverSkills(join(tmpdir(), 'trn-no-such-skills-dir'));
        expect(skills).toEqual([]);
    });

    it('duplicate ids fail fast', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'trn-dup-'));
        try {
            mkdirSync(join(dir, 'a'), { recursive: true });
            mkdirSync(join(dir, 'b'), { recursive: true });
            writeFileSync(join(dir, 'a', 'SKILL.md'), '---\nid: same\n---\nA');
            writeFileSync(join(dir, 'b', 'SKILL.md'), '---\nid: same\n---\nB');
            await expect(discoverSkills(dir)).rejects.toThrow(/Duplicate skill id "same"/);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('unterminated frontmatter fails with the file path', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'trn-fm-'));
        try {
            writeFileSync(join(dir, 'SKILL.md'), '---\nid: broken\nno end');
            await expect(discoverSkills(dir)).rejects.toThrow(/Unterminated frontmatter/);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

describe('skills: explicit .md refs (FR-002)', () => {
    it('loads arbitrary markdown as global skills', () => {
        const { skills } = loadExplicitSkills([GUIDELINES]);
        expect(skills).toHaveLength(1);
        expect(skills[0].id).toBe('localization-guidelines');
        expect(skills[0].scope).toBe('global');
        expect(skills[0].locales).toEqual([]);
        expect(skills[0].content).toContain('Translatron');
    });

    it('missing ref fails fast', () => {
        expect(() => loadExplicitSkills([join(tmpdir(), 'nope.md')])).toThrow(/not found/);
    });

    it('full load merges packages and refs', async () => {
        const { skills } = await loadSkills(SKILLS_ROOT, [GUIDELINES]);
        expect(skills).toHaveLength(7);
    });
});

describe('skills: frontmatter + bundle parsers', () => {
    it('parses inline and block lists, rejects unknowns', () => {
        const { frontmatter, body } = parseFrontmatter('x.md', '---\nlocales: [de-DE, fr-FR]\nkeys:\n  - a.*\n  - b\n---\nBody');
        expect(frontmatter.locales).toEqual(['de-DE', 'fr-FR']);
        expect(frontmatter.keys).toEqual(['a.*', 'b']);
        expect(body).toBe('Body');
        expect(() => parseFrontmatter('x.md', '---\nbogus: 1\n---\nB')).toThrow(/Unknown frontmatter field/);
        expect(() => parseFrontmatter('x.md', '---\nscope: regional\n---\nB')).toThrow(/Invalid scope/);
        expect(() => parseFrontmatter('x.md', '---\nlocales: de-DE\n---\nB')).toThrow(/\[a, b\] list/);
    });

    it('parses glossaries (header-aware) and examples (tolerant)', () => {
        expect(parseGlossaryCsv('source,target\na,b\n# comment\nc,d\n')).toEqual({ a: 'b', c: 'd' });
        expect(parseGlossaryCsv('hello,bonjour\n')).toEqual({ hello: 'bonjour' });
        expect(parseExamplesJson('[{"key": "k", "translation": "t"}, {"nope": 1}]')).toEqual([{ keyPath: 'k', text: 't' }]);
        expect(() => parseExamplesJson('{bad')).toThrow(/Invalid examples.json/);
        expect(() => parseExamplesJson('{}')).toThrow(/top-level array/);
    });
});

describe('skills: resolution matrix (S-T002/FR-003/SC-001)', () => {
    it('ja-JP checkout resolves global + ja + ja-JP + ecommerce', async () => {
        if (FIXTURE_SKILLS.length === 0) FIXTURE_SKILLS = (await discoverSkills(SKILLS_ROOT)).skills;
        expect(chainIds('ja-JP', 'checkout.payNow')).toEqual(['global', 'ja', 'ja-JP', 'ecommerce']);
    });

    it('pt-BR resolves global + pt + ecommerce (language-part fallback)', async () => {
        if (FIXTURE_SKILLS.length === 0) FIXTURE_SKILLS = (await discoverSkills(SKILLS_ROOT)).skills;
        expect(chainIds('pt-BR', 'checkout.x')).toEqual(['global', 'pt', 'ecommerce']);
    });

    it('locale-restricted domains stay put', async () => {
        if (FIXTURE_SKILLS.length === 0) FIXTURE_SKILLS = (await discoverSkills(SKILLS_ROOT)).skills;
        // legal is de-DE only: absent for ja-JP…
        expect(chainIds('ja-JP', 'legal.terms')).toEqual(['global', 'ja', 'ja-JP']);
        // …present for de-DE with its key scope…
        expect(chainIds('de-DE', 'legal.terms')).toEqual(['global', 'legal']);
        // …but not for other de-DE keys.
        expect(chainIds('de-DE', 'checkout.payNow')).toEqual(['global', 'ecommerce']);
    });

    it('unmatched locales get house style only; empty set resolves to []', async () => {
        if (FIXTURE_SKILLS.length === 0) FIXTURE_SKILLS = (await discoverSkills(SKILLS_ROOT)).skills;
        expect(chainIds('fr-FR', 'other.key')).toEqual(['global']);
        expect(resolveSkillsForUnit([], { locale: 'ja-JP', keyPath: 'checkout.x' })).toEqual([]);
    });

    it('region skill never matches the bare language', async () => {
        if (FIXTURE_SKILLS.length === 0) FIXTURE_SKILLS = (await discoverSkills(SKILLS_ROOT)).skills;
        expect(chainIds('ja', 'checkout.x')).toEqual(['global', 'ja', 'ecommerce']);
    });

    it('locale matcher primitives', () => {
        expect(langPart('pt-BR')).toBe('pt');
        expect(langPart('ja')).toBe('ja');
        expect(matchesLocale([], 'xx-YY')).toBe(true);
        expect(matchesLocale(['ja'], 'ja-JP')).toBe(true);
        expect(matchesLocale(['ja-JP'], 'ja')).toBe(false);
        expect(matchesLocale(['de'], 'de-DE')).toBe(true);
        expect(matchesKeyPattern('checkout.*', 'checkout.payNow')).toBe(true);
        expect(matchesKeyPattern('checkout.*', 'checkout')).toBe(false);
        expect(matchesKeyPattern('exact.key', 'exact.key')).toBe(true);
    });
});

describe('skills: fingerprints (S-T005/FR-004/SC-002)', () => {
    it('stable for identical bytes, sensitive to any change', () => {
        const base = fingerprintSkill('# Title\n\nBody.\n', new Map([['glossary.csv', 'a,b\n']]));
        expect(fingerprintSkill('# Title\n\nBody.\n', new Map([['glossary.csv', 'a,b\n']]))).toBe(base);
        // CRLF/whitespace noise normalizes away…
        expect(fingerprintSkill('# Title  \r\n\r\nBody.\r\n', new Map([['glossary.csv', 'a,b\n']]))).toBe(base);
        // …but real changes (doc, resource content, added/removed files) rotate.
        expect(fingerprintSkill('# Title\n\nBody changed.\n', new Map([['glossary.csv', 'a,b\n']]))).not.toBe(base);
        expect(fingerprintSkill('# Title\n\nBody.\n', new Map([['glossary.csv', 'a,c\n']]))).not.toBe(base);
        expect(fingerprintSkill('# Title\n\nBody.\n', new Map())).not.toBe(base);
        expect(normalizeSkillContent('  x  \r\n')).toBe('x\n');
    });

    it('applied-set fingerprint is order-independent', () => {
        expect(fingerprintSkillSet(['b', 'a'])).toBe(fingerprintSkillSet(['a', 'b']));
        expect(fingerprintAppliedSet([{ fingerprint: 'a' }, { fingerprint: 'b' }] as never)).toBe(
            fingerprintSkillSet(['a', 'b'])
        );
    });
});

describe('skills: provenance + stale flow (S-T005/S-T006/SC-003)', () => {
    it('applied skills become revision provenance; rotation flips CLEAN to SKILL_STALE without writes', async () => {
        const { skills } = await discoverSkills(SKILLS_ROOT);
        const targetHash = computeHash('Payer');
        const sourceHash = computeHash('Pay now');
        const applied = resolveSkillsForUnit(skills, { locale: 'ja-JP', keyPath: 'checkout.payNow' });
        const revision = {
            id: 'tr_1',
            catalogId: 'main',
            keyPath: 'checkout.payNow',
            sourceLocale: 'en-GB',
            targetLocale: 'ja-JP',
            sourceHash,
            targetHash,
            origin: 'agent' as const,
            parentIds: [],
            runId: 'run_1',
            createdAt: '2026-01-01T00:00:00.000Z',
            skillFingerprints: toAppliedSkills(applied),
        };
        expect(revision.skillFingerprints.map((s) => s.id)).toEqual(['global', 'ja', 'ja-JP', 'ecommerce']);

        const input = {
            sourceLocale: 'en-GB',
            catalogId: 'main',
            sourceUnits: [
                { unitId: 'u-1', keyPath: 'checkout.payNow', sourceText: 'Pay now', sourceHash, placeholders: [] as string[], sourceFile: 'en.json', schemaVersion: 1 },
            ],
            targets: [{ locale: 'ja-JP', entries: { 'checkout.payNow': { text: 'Payer', targetHash } } }],
            revisions: [revision],
            currentSkills: currentSkillMap(skills, 'ja-JP'),
        };
        expect(reconcile(input).reconciled[0].status).toBe('CLEAN');

        // Rotate one skill's bytes (simulated edit): stale, files untouched.
        const rotated = skills.map((skill) =>
            skill.id === 'ja-JP' ? { ...skill, fingerprint: `${skill.fingerprint}0`.slice(1) } : skill
        );
        const stale = reconcile({ ...input, currentSkills: currentSkillMap(rotated, 'ja-JP') });
        expect(stale.reconciled[0].status).toBe('SKILL_STALE');
        // Work is selected for retranslation, never rewritten in place.
        expect(stale.workUnits.map((w) => [w.keyPath, w.reason])).toEqual([['checkout.payNow', 'skill-stale']]);
    });

    it('currentSkillMap unions locale-applicable skills (conservative staleness)', async () => {
        const { skills } = await discoverSkills(SKILLS_ROOT);
        const map = currentSkillMap(skills, 'ja-JP');
        // pt is pt-only, legal is de-DE-only: excluded. ecommerce has no
        // locale restriction: included even though it is key-scoped.
        expect([...map.keys()].sort()).toEqual(['ecommerce', 'global', 'ja', 'ja-JP']);
        expect(map.get('ja-JP')).toHaveLength(64);
    });
});

describe('skills: worker + tool hookup (FR-005)', () => {
    it('material fragment carries ordered content + merged glossary', async () => {
        const { skills } = await discoverSkills(SKILLS_ROOT);
        // Locale-level union: key-scoped domains ride along when their
        // locale affinity matches (per-batch narrowing is Epic 010 scope).
        const material = skillMaterialForLocale(skills, 'pt-BR');
        expect(material.skills.map((s) => s.id)).toEqual(['global', 'pt', 'ecommerce']);
        expect(material.glossary).toEqual({ checkout: 'carrinho', cart: 'carrinho' });
        const japanese = skillMaterialForLocale(skills, 'ja-JP');
        expect(japanese.skills.map((s) => s.id)).toEqual(['global', 'ja', 'ja-JP', 'ecommerce']);
        expect(japanese.glossary).toEqual({ checkout: 'carrinho', cart: 'carrinho' });
        // Unrestricted domains (ecommerce) merge everywhere.
        expect(glossaryForLocale(skills, 'fr-FR')).toEqual({ checkout: 'carrinho', cart: 'carrinho' });
    });

    it('resource store serves bundles and rejects escapes/unknowns', async () => {
        const { skills } = await discoverSkills(SKILLS_ROOT);
        const store = createSkillResourceStore(skills);
        expect(store.getSkillResource('ecommerce', 'glossary.csv')).toContain('checkout');
        expect(store.getSkillResource('ecommerce', 'references/cta-note.md')).toContain('Pay now');
        expect(store.getSkillResource('ecommerce', '../SKILL.md')).toBeNull();
        expect(store.getSkillResource('ecommerce', '/etc/passwd')).toBeNull();
        expect(store.getSkillResource('ecommerce', 'missing.csv')).toBeNull();
        expect(store.getSkillResource('no-such-skill', 'glossary.csv')).toBeNull();
    });

    it('legacy v2 prompts become a fingerprinted global skill', () => {
        const legacy = legacySkillToLoadedSkill({ content: 'Be formal.', glossary: { checkout: 'panier' } });
        expect(legacy.id).toBe('legacy-project');
        expect(legacy.scope).toBe('global');
        expect(legacySkillToLoadedSkill({ content: 'Be formal.', glossary: { checkout: 'panier' } }).fingerprint).toBe(
            legacy.fingerprint
        );
        expect(legacySkillToLoadedSkill({ content: 'Be casual.', glossary: {} }).fingerprint).not.toBe(legacy.fingerprint);
        expect(resolveSkillsForUnit([legacy], { locale: 'fr-FR', keyPath: 'a' }).map((s) => s.id)).toEqual([
            'legacy-project',
        ]);
    });

    it('skillsForLocale feeds locale-level consumers', async () => {
        const { skills } = await discoverSkills(SKILLS_ROOT);
        // fr-FR: house style + unrestricted ecommerce domain.
        expect(skillsForLocale(skills, 'fr-FR').map((s) => s.id)).toEqual(['global', 'ecommerce']);
        expect(skillsForLocale([], 'ja-JP')).toEqual([]);
    });
});
