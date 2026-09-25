import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const readme = readFileSync(join(ROOT, 'README.md'), 'utf-8');
const api = readFileSync(join(ROOT, 'API.md'), 'utf-8');

describe('docs: README v3 coverage (D-T003/US1)', () => {
    const required = [
        'sync --v2',
        'translatronx init',
        '--provider <id>',
        '--affected-by-skill',
        '--dry-run',
        'registry verify',
        'registry repair',
        'registry status',
        'translatronx doctor',
        'translatronx explain',
        'translatronx resolve',
        'translatronx check',
        'translatronx migrate',
        'reviewKeys',
        '.translatron/',
        'Never hand-edit',
        'locales',
        'model',
        'skills',
        'paths',
        'execution',
        'targetOnly',
        'policies',
    ];
    for (const needle of required) {
        it(`mentions ${needle}`, () => {
            expect(readme).toContain(needle);
        });
    }

    it('shows runnable examples', () => {
        expect(readme).toContain('```bash');
        expect(readme).toContain('```json');
    });
});

describe('docs: API.md v3 modules (D-T003/US2)', () => {
    const modules = [
        'core/compiler',
        'core/policy',
        'runtime/models',
        'toolBackend',
        'config/normalize',
        'registry/revisions',
        'registry/bootstrap',
        'removals',
        'cli/sync-v3',
        'cli/registry',
        'core/coverage',
        'validation/batch',
        'validation/repair',
        'translation-memory',
        'skills/resolver',
    ];
    for (const module of modules) {
        it(`documents ${module}`, () => {
            expect(api).toContain(module);
        });
    }

    it('marks the ledger v2-import-only', () => {
        expect(api).toContain('v2-import-only');
    });
});
