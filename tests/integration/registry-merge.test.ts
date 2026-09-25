import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ensureRegistryHome } from '../../src/registry/bootstrap.js';
import { readRegistry } from '../../src/registry/reader.js';
import { writeSegment } from '../../src/registry/writer.js';
import type { TranslationRevision } from '../../src/core/domain.js';

let dir: string;
beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'trn-merge-'));
});
afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});

function git(args: string[], cwd: string): string {
    return execFileSync('git', args, { cwd, stdio: 'pipe', encoding: 'utf-8' }) as string;
}

function initRepo(cwd: string): void {
    git(['init'], cwd);
    git(['config', 'user.email', 'test@translatron.dev'], cwd);
    git(['config', 'user.name', 'Translatron Test'], cwd);
    git(['config', 'commit.gpgsign', 'false'], cwd);
}

function rev(id: string, keyPath: string, runId: string): TranslationRevision {
    return {
        id,
        catalogId: 'main',
        keyPath,
        sourceLocale: 'en-GB',
        targetLocale: 'fr-FR',
        sourceHash: 'src-1',
        targetHash: `tgt-${id}`,
        origin: 'agent',
        parentIds: [],
        runId,
        createdAt: '2026-01-01T00:00:00.000Z',
    };
}

describe('registry folder: bootstrap determinism + ignore policy (R-T002)', () => {
    it('two bootstraps are byte-identical; cache/ is ignored', () => {
        const first = ensureRegistryHome(join(dir, 'a'));
        const second = ensureRegistryHome(join(dir, 'b'));
        expect(first.created).toBe(true);
        expect(ensureRegistryHome(join(dir, 'a')).created).toBe(false);
        expect(readFileSync(join(second.dir, 'meta.json'), 'utf-8')).toBe(
            readFileSync(join(first.dir, 'meta.json'), 'utf-8')
        );
        expect(readFileSync(join(second.dir, '.gitignore'), 'utf-8')).toBe(
            readFileSync(join(first.dir, '.gitignore'), 'utf-8')
        );
    });

    it('git ignores cache/ but tracks segments', () => {
        initRepo(dir);
        ensureRegistryHome(dir);
        writeFileSync(join(dir, 'cache', 'probe.txt'), 'x');
        // Exits 0 when ignored; throws otherwise.
        git(['check-ignore', '-q', join('cache', 'probe.txt')], dir);
        expect(() => git(['check-ignore', '-q', join('segments', 'probe.trn')], dir)).toThrow();
    });
});

describe('registry folder: branch merges never conflict (R-T010/SC-001)', () => {
    it('50 seeded segment pairs merge with exit 0, no markers, full recall', () => {
        initRepo(dir);
        ensureRegistryHome(dir);
        const pairs = 50;
        for (let i = 0; i < pairs; i++) {
            writeSegment({
                registryDir: dir,
                runId: `seed-a-${i}`,
                revisions: [rev(`tr-a-${i}`, `k.a.${i}`, `seed-a-${i}`)],
                createdAt: '2026-01-01T00:00:00.000Z',
            });
        }
        git(['add', '-A'], dir);
        git(['commit', '-m', 'base + side A'], dir);
        git(['checkout', '-b', 'dev-b'], dir);
        for (let i = 0; i < pairs; i++) {
            writeSegment({
                registryDir: dir,
                runId: `seed-b-${i}`,
                revisions: [rev(`tr-b-${i}`, `k.b.${i}`, `seed-b-${i}`)],
                createdAt: '2026-01-02T00:00:00.000Z',
            });
        }
        git(['add', '-A'], dir);
        git(['commit', '-m', 'side B'], dir);
        git(['checkout', '-'], dir);
        git(['merge', '--no-edit', 'dev-b'], dir);

        // No conflict markers anywhere in the tree.
        expect(() => git(['grep', '-l', '<<<<<<<', 'HEAD'], dir)).toThrow();
        // No unmerged paths.
        expect(git(['diff', '--name-only', '--diff-filter=U'], dir).trim()).toBe('');
        // Full recall of both sides.
        const { revisions, quarantined } = readRegistry({ registryDir: dir });
        expect(quarantined).toEqual([]);
        expect(revisions).toHaveLength(pairs * 2);
    });

    it('identical content on both branches collapses to one file', () => {
        initRepo(dir);
        ensureRegistryHome(dir);
        const input = {
            registryDir: dir,
            runId: 'shared-run',
            revisions: [rev('tr-shared', 'k.shared', 'shared-run')],
            createdAt: '2026-01-01T00:00:00.000Z',
        };
        const fromA = writeSegment(input);
        git(['add', '-A'], dir);
        git(['commit', '-m', 'base'], dir);
        git(['checkout', '-b', 'dev-b'], dir);
        const fromB = writeSegment(input);
        expect(fromB.fileName).toBe(fromA.fileName);
        git(['add', '-A'], dir);
        git(['commit', '-m', 'same content', '--allow-empty'], dir);
        git(['checkout', '-'], dir);
        git(['merge', '--no-edit', 'dev-b'], dir);
        expect(readRegistry({ registryDir: dir }).revisions).toHaveLength(1);
    });
});
