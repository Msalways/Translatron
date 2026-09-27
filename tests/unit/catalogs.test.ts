import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GenericJsonAdapter } from '../../src/catalogs/generic-json.js';
import { configuredCatalogAdapter } from '../../src/catalogs/configured.js';
import { SourceUnitSchema } from '../../src/core/domain.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, '..', 'fixtures', 'catalogs', 'nested.en-GB.json');

describe('catalogs: GenericJsonAdapter (A2-T002)', () => {
    it('uses JSON as the built-in adapter and rejects unsupported extractor types clearly', async () => {
        const configured = await configuredCatalogAdapter([{ type: 'json', pattern: FIXTURE }]);
        expect(configured.adapter).toBeInstanceOf(GenericJsonAdapter);
        await expect(configuredCatalogAdapter([{ type: 'typescript', pattern: './src/**/*.ts' }])).rejects.toThrow(/not supported by a built-in catalog adapter/);
    });

    it('loads a custom adapter that discovers, reads, validates, and writes catalogs', async () => {
        const module = join(__dirname, '..', 'fixtures', 'catalog-adapter.mjs');
        const { adapter, extractors } = await configuredCatalogAdapter([{ type: 'custom', module, pattern: 'fixture.catalog' }]);
        const [file] = await adapter.discover(extractors[0].pattern);
        const [catalog] = await adapter.read([file], { locale: 'fr-FR' });
        expect(catalog.units.map((unit) => SourceUnitSchema.parse(unit).keyPath)).toEqual(['message']);
        const output = join(mkdtempSync(join(tmpdir(), 'trn-custom-')), 'fr.catalog');
        try {
            await adapter.write(output, { message: 'Bonjour' });
            expect(JSON.parse(await (await import('node:fs/promises')).readFile(output, 'utf-8'))).toEqual({ message: 'Bonjour' });
        } finally {
            rmSync(dirname(output), { recursive: true, force: true });
        }
    });

    it('reads nested JSON into flat units with hashes + placeholders', async () => {
        const adapter = new GenericJsonAdapter();
        const [catalog] = await adapter.read([FIXTURE], { locale: 'en-GB' });
        expect(catalog.locale).toBe('en-GB');
        const byKey = new Map(catalog.units.map((u) => [u.keyPath, u]));
        expect([...byKey.keys()].sort()).toEqual([
            'auth.login.button',
            'auth.login.title',
            'checkout.items.0',
            'checkout.items.1',
            'checkout.payNow',
        ]);
        expect(byKey.get('auth.login.button')?.placeholders).toEqual(['{name}']);
        expect(byKey.get('checkout.items.1')?.placeholders).toEqual(['{count}']);
        for (const unit of catalog.units) {
            expect(unit.sourceHash).toMatch(/^[0-9a-f]{64}$/);
            expect(unit.unitId).toHaveLength(16);
            expect(unit.schemaVersion).toBe(1);
        }
    });

    it('rejects malformed JSON with a file-named error', async () => {
        const adapter = new GenericJsonAdapter();
        const dir = mkdtempSync(join(tmpdir(), 'trn-cat-'));
        try {
            const bad = join(dir, 'bad.json');
            const { writeFileSync } = await import('node:fs');
            writeFileSync(bad, '{oops', 'utf-8');
            await expect(adapter.read([bad], { locale: 'en-GB' })).rejects.toThrow(/bad\.json/);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('discovers files via glob', async () => {
        const adapter = new GenericJsonAdapter();
        const found = await adapter.discover([join(__dirname, '..', 'fixtures', 'catalogs', '*.json')]);
        expect(found.some((f) => f.endsWith('nested.en-GB.json'))).toBe(true);
    });

    describe('atomic write', () => {
        let dir: string;
        beforeEach(() => {
            dir = mkdtempSync(join(tmpdir(), 'trn-catw-'));
        });

        it('merges flat keys into nested JSON via tmp + rename', async () => {
            const adapter = new GenericJsonAdapter();
            const file = join(dir, 'fr-FR.json');
            await adapter.write(file, { 'auth.login.title': 'Connexion' });
            await adapter.write(file, { 'auth.login.button': 'Se connecter', 'checkout.payNow': 'Payer' });
            const [catalog] = await adapter.read([file], { locale: 'fr-FR' });
            const byKey = new Map(catalog.units.map((u) => [u.keyPath, u.sourceText]));
            expect(byKey.get('auth.login.title')).toBe('Connexion');
            expect(byKey.get('auth.login.button')).toBe('Se connecter');
            expect(byKey.get('checkout.payNow')).toBe('Payer');
        });

        it('refuses to merge into non-object catalogs', async () => {
            const adapter = new GenericJsonAdapter();
            const file = join(dir, 'arr.json');
            const { writeFileSync } = await import('node:fs');
            writeFileSync(file, '[]', 'utf-8');
            await expect(adapter.write(file, { a: 'b' })).rejects.toThrow(/non-object/);
        });

        it('removes nested keys; missing keys are no-ops (E-T006)', async () => {
            const adapter = new GenericJsonAdapter();
            const file = join(dir, 'de-DE.json');
            await adapter.write(file, { 'auth.login': 'Anmelden', 'auth.logout': 'Abmelden', 'other': 'X' });
            await adapter.removeKeys(file, ['auth.logout', 'missing.key']);
            const [catalog] = await adapter.read([file], { locale: 'de-DE' });
            const byKey = new Map(catalog.units.map((u) => [u.keyPath, u.sourceText]));
            expect([...byKey.keys()].sort()).toEqual(['auth.login', 'other']);
        });

        it('applies translations and removals in one staged cycle (E-T006/J5)', async () => {
            const adapter = new GenericJsonAdapter();
            const file = join(dir, 'es-ES.json');
            await adapter.write(file, { 'a': 'A', 'b': 'B', 'c': 'C' });
            await adapter.applyChanges(file, { set: { d: 'D' }, remove: ['b'] });
            const [catalog] = await adapter.read([file], { locale: 'es-ES' });
            const byKey = new Map(catalog.units.map((u) => [u.keyPath, u.sourceText]));
            expect([...byKey.keys()].sort()).toEqual(['a', 'c', 'd']);
        });
    });
});
