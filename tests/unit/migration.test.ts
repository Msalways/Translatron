import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { translatronxLedger } from '../../src/ledger/index.js';
import { GenericJsonAdapter } from '../../src/catalogs/generic-json.js';
import { V2LedgerReader } from '../../src/migration/v2-ledger.js';
import { applyMigration, dryRunMigration } from '../../src/migration/migrate.js';
import { adaptLegacyConfig } from '../../src/migration/config-adapter.js';
import { readRegistry } from '../../src/registry/reader.js';
import { computeHash } from '../../src/utils/hash.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = join(__dirname, '..', '..', 'src');

function seedSource(dir: string): string {
    const file = join(dir, 'en.json');
    writeFileSync(file, JSON.stringify({
        a: 'hello',
        b: 'world',
        c: 'bye',
        d: 'try again',
        e: 'lonely',
    }), 'utf-8');
    return file;
}

function seedTarget(dir: string): string {
    const file = join(dir, 'fr.json');
    writeFileSync(file, JSON.stringify({
        a: 'bonjour',
        b: 'monde MODIFIÉ',
        c: 'au revoir',
        f: 'orpheline',
        g: 'trafiquée',
    }), 'utf-8');
    return file;
}

/** Seeds the exact scenario asserted below. Returns ledger path. */
function seedLedger(dir: string): string {
    const ledgerPath = join(dir, 'ledger.sqlite');
    const ledger = new translatronxLedger(ledgerPath);
    ledger.updateSourceHash('a', computeHash('hello'));
    ledger.updateSourceHash('b', computeHash('world'));
    ledger.updateSourceHash('c', computeHash('bye'));
    ledger.updateSourceHash('d', computeHash('try again'));
    ledger.updateSourceHash('e', computeHash('lonely'));
    // a: CLEAN + model, file matches → agent
    ledger.updateSyncStatus('a', 'fr', computeHash('bonjour'), 'CLEAN', 'openai:gpt-4o', 1);
    // b: MANUAL → human (+mismatch: file differs from recorded hash)
    ledger.updateSyncStatus('b', 'fr', computeHash('monde'), 'MANUAL', 'openai:gpt-4o', 1);
    // c: CLEAN without model → imported
    ledger.updateSyncStatus('c', 'fr', computeHash('au revoir'), 'CLEAN');
    // d: FAILED → failed
    ledger.updateSyncStatus('d', 'fr', '', 'FAILED');
    // g: CLEAN + model but file edited → mismatch → human
    ledger.updateSyncStatus('g', 'fr', computeHash('originale'), 'CLEAN', 'openai:gpt-4o', 1);
    ledger.close();
    return ledgerPath;
}

describe('migration: classification (M-T002)', () => {
    let dir: string;
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'trn-mig-'));
    });
    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    async function load() {
        const adapter = new GenericJsonAdapter();
        const [source] = await adapter.read([seedSource(dir)], { locale: 'en' });
        const [target] = await adapter.read([seedTarget(dir)], { locale: 'fr' });
        const ledgerPath = seedLedger(dir);
        const reader = new V2LedgerReader(ledgerPath);
        const sourceHashes = new Map(reader.readSourceHashes().map((r) => [r.keyPath, r.valueHash]));
        const syncRows = reader.readSyncStatuses();
        reader.close();
        return {
            ledgerPath,
            input: {
                catalogId: 'main',
                sourceLocale: 'en',
                sourceUnits: source.units,
                sourceHashes,
                syncRows,
                targets: [{ locale: 'fr', entries: Object.fromEntries(target.units.map((u) => [u.keyPath, u.sourceText])) }],
                registryDir: join(dir, 'registry'),
                migrationRunId: 'migrate_test',
                migratedAt: '2026-01-01T00:00:00.000Z',
            },
        };
    }

    it('classifies agent/human/imported/failed/missing with file truth winning', async () => {
        const { input } = await load();
        const report = dryRunMigration(input);
        expect(report.sourceKeys).toBe(5);
        expect(report.agent).toBe(1); // a
        expect(report.human).toBe(2); // b, g
        expect(report.imported).toBe(2); // c, f
        expect(report.failed).toBe(1); // d
        expect(report.missing).toBe(1); // e
        expect(report.translations).toBe(5); // revisions for a,b,c,f,g
        expect(report.mismatches.map((m) => m.keyPath).sort()).toEqual(['b', 'g']);
        expect(report.applied).toBe(false);
    });

    it('dry run writes nothing', async () => {
        const { input } = await load();
        dryRunMigration(input);
        expect(existsSync(join(dir, 'registry'))).toBe(false);
    });

    it('apply writes one validated segment and keeps the SQLite backup', async () => {
        const { input, ledgerPath } = await load();
        const report = applyMigration(input);
        expect(report.applied).toBe(true);
        expect(report.segmentFile?.endsWith('.trn')).toBe(true);
        const reloaded = readRegistry({ registryDir: input.registryDir });
        expect(reloaded.revisions.filter((r) => r.runId === 'migrate_test')).toHaveLength(5);
        expect(reloaded.quarantined).toEqual([]);
        // Origins survive the round-trip.
        const origins = new Map(reloaded.revisions.map((r) => [`${r.targetLocale}${r.keyPath}`, r.origin]));
        expect(origins.get('fra')).toBe('agent');
        expect(origins.get('frb')).toBe('human');
        expect(origins.get('frc')).toBe('imported');
        // Legacy DB untouched and retained.
        expect(existsSync(ledgerPath)).toBe(true);
        const reader = new V2LedgerReader(ledgerPath);
        expect(reader.readSyncStatuses()).toHaveLength(5);
        reader.close();
    });

    it('V2LedgerReader rejects missing files', () => {
        expect(() => new V2LedgerReader(join(dir, 'nope.sqlite'))).toThrow(/not found/);
    });
});

describe('migration: config adapter (M-T006)', () => {
    it('normalizes legacy providers/prompts/ledgerPath with warnings', () => {
        const result = adaptLegacyConfig({
            sourceLanguage: 'en-GB',
            targetLanguages: [{ language: 'French', shortCode: 'fr' }],
            providers: [{ name: 'main', type: 'openai', model: 'gpt-4o', temperature: 0.3 }],
            prompts: {
                formatting: 'formal',
                glossary: { checkout: 'panier' },
                brandVoice: 'playful',
                customContext: 'Extra ctx',
            },
            advanced: { ledgerPath: './.translatronx/ledger.sqlite' },
        });
        expect(result.model.model).toBe('openai:gpt-4o');
        expect(result.locales).toEqual(['fr']);
        expect(result.legacySkill?.glossary).toEqual({ checkout: 'panier' });
        expect(result.legacySkill?.content).toContain('playful');
        expect(result.warnings.join('\n')).toContain('ledgerPath');
        expect(result.warnings.join('\n')).toContain('glossary');
    });

    it('degrades gracefully on empty input', () => {
        const result = adaptLegacyConfig({});
        expect(result.model.model).toBe('openai:gpt-4o');
        expect(result.legacySkill).toBeNull();
        expect(result.warnings.length).toBeGreaterThan(0);
    });
});

describe('migration: SQLite boundary (M-T008)', () => {
    it('better-sqlite3 is imported only under src/migration and src/ledger', () => {
        const offenders: string[] = [];
        const walk = (dir: string) => {
            for (const entry of readdirSync(dir)) {
                const full = join(dir, entry);
                if (statSync(full).isDirectory()) {
                    if (entry === 'node_modules') continue;
                    walk(full);
                } else if (entry.endsWith('.ts')) {
                    const content = readFileSync(full, 'utf-8');
                    if (/from\s+['"]better-sqlite3['"]|require\(['"]better-sqlite3['"]\)/.test(content)) {
                        // Normalize Windows separators before comparing.
                        const rel = full.replace(SRC_ROOT, 'src').replace(/\\/g, '/');
                        if (!rel.startsWith('src/migration/') && !rel.startsWith('src/ledger/')) {
                            offenders.push(rel);
                        }
                    }
                }
            }
        };
        walk(SRC_ROOT);
        expect(offenders).toEqual([]);
    });
});
