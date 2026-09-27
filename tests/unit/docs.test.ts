import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const readme = readFileSync(join(ROOT, 'README.md'), 'utf-8');
const guide = readFileSync(join(ROOT, 'docs', 'V3_GUIDE.md'), 'utf-8');
const legacyGuide = readFileSync(join(ROOT, 'docs', 'LEGACY_GUIDE.md'), 'utf-8');

describe('docs: README quick start (D-T003/US1)', () => {
    const required = [
        'translatronx init',
        'translatronx check',
        'sync --dry-run',
        'sourceLocale',
        'en-GB.json',
        'SKILL.md',
        'context generate',
        'contextFile',
        '.translatron/',
        'V3_GUIDE.md',
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
describe('docs: detailed v3 and legacy guides (D-T003/US1)', () => {
    for (const needle of [
        '--provider <id>', '--affected-by-skill', 'registry verify', 'registry repair',
        'registry status', 'translatronx doctor', 'translatronx explain',
        'translatronx resolve', 'translatronx migrate', 'reviewKeys',
        'Never hand-edit', 'paths', 'execution', 'targetOnly', 'policies',
        'context validate', 'context sync', 'glossary.csv',
    ]) {
        it(`explains ${needle} in the v3 guide`, () => {
            expect(guide).toContain(needle);
        });
    }

    it('keeps the explicit v2 commands in the legacy guide', () => {
        expect(legacyGuide).toContain('init --v2');
        expect(legacyGuide).toContain('sync --v2');
    });
});
