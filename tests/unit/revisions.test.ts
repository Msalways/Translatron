import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import {
    buildAdoptionRevision,
    buildAgentRevision,
    buildHumanRevision,
    currentGitCommit,
    isAlreadyRecorded,
    revisionId,
} from '../../src/registry/revisions.js';
import { computeHash } from '../../src/utils/hash.js';
import type { TranslationRevision } from '../../src/core/domain.js';

function rev(id: string, targetHash: string, origin: TranslationRevision['origin'] = 'agent'): TranslationRevision {
    return {
        id,
        catalogId: 'main',
        keyPath: 'a.b',
        sourceLocale: 'en-GB',
        targetLocale: 'fr-FR',
        sourceHash: 'src-1',
        targetHash,
        origin,
        parentIds: [],
        runId: 'run_0',
        createdAt: '2026-01-01T00:00:00.000Z',
    };
}

const BASE = {
    catalogId: 'main',
    keyPath: 'a.b',
    sourceLocale: 'en-GB',
    targetLocale: 'fr-FR',
    sourceHash: 'src-1',
    targetHash: 'tgt-1',
    runId: 'run_1',
    createdAt: '2026-02-01T00:00:00.000Z',
};

describe('revisions: deterministic IDs (E-T007)', () => {
    it('identical inputs yield identical IDs; distinct runs never collide', () => {
        const a = revisionId('run_1', 'fr-FR', 'a.b', 's', 't');
        expect(a).toMatch(/^tr_[0-9a-f]{16}$/);
        expect(revisionId('run_1', 'fr-FR', 'a.b', 's', 't')).toBe(a);
        expect(revisionId('run_2', 'fr-FR', 'a.b', 's', 't')).not.toBe(a);
    });
});

describe('revisions: builders (E-T007)', () => {
    it('agent revision carries full provenance and chains to previous', () => {
        const previous = rev('tr_old', 'tgt-0');
        const built = buildAgentRevision({
            ...BASE,
            model: 'gpt-5',
            provider: 'openai',
            corePolicyFingerprint: 'cp1',
            skillFingerprints: [{ id: 'global', scope: 'global', fingerprint: 'ff' }],
            glossaryFingerprint: 'gf1',
            previous,
        });
        expect(built.origin).toBe('agent');
        expect(built.parentIds).toEqual(['tr_old']);
        expect(built.model).toBe('gpt-5');
        expect(built.skillFingerprints).toHaveLength(1);
        expect(built.gitCommit).toBeUndefined();
    });

    it('human revision parents the generated revision; gitCommit flows when present', () => {
        const built = buildHumanRevision({ ...BASE, previousGeneratedId: 'tr_gen', gitCommit: 'abc123' });
        expect(built.origin).toBe('human');
        expect(built.parentIds).toEqual(['tr_gen']);
        expect(built.gitCommit).toBe('abc123');
    });

    it('adoption revision starts lineage with empty parents', () => {
        const built = buildAdoptionRevision(BASE);
        expect(built.origin).toBe('imported');
        expect(built.parentIds).toEqual([]);
    });
});

describe('revisions: already-recorded guard (E-T007)', () => {
    it('latest hash match suppresses duplicates; mismatch allows publish', () => {
        const history = [
            rev('tr_1', 'tgt-0'),
            { ...rev('tr_2', 'tgt-1'), createdAt: '2026-02-01T00:00:00.000Z' },
        ];
        expect(isAlreadyRecorded(history, 'tgt-1')).toBe(true);
        expect(isAlreadyRecorded(history, 'tgt-2')).toBe(false);
        expect(isAlreadyRecorded([], 'tgt-1')).toBe(false);
    });
});

describe('revisions: git HEAD helper (E-T007)', () => {
    it('returns null outside git repos', () => {
        expect(currentGitCommit(tmpdir())).toBeNull();
    });

    it('returns the HEAD sha inside this repo', () => {
        const sha = currentGitCommit(process.cwd());
        expect(sha).toMatch(/^[0-9a-f]{40}$/);
    });

    it('source-hash helper is stable', () => {
        expect(computeHash('x')).toBe(computeHash('x'));
    });
});
