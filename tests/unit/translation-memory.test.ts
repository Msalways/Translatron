import { describe, it, expect } from 'vitest';
import { TranslationMemory, contextCompatible } from '../../src/memory/translation-memory.js';
import type { TranslationRevision } from '../../src/core/domain.js';

function rev(id: string, overrides: Partial<TranslationRevision> = {}): TranslationRevision {
    return {
        id,
        catalogId: 'main',
        keyPath: 'a.b',
        sourceLocale: 'en-GB',
        targetLocale: 'fr-FR',
        sourceHash: 'src-1',
        targetHash: `tgt-${id}`,
        origin: 'agent',
        parentIds: [],
        runId: 'run_1',
        createdAt: '2026-01-01T00:00:00.000Z',
        ...overrides,
    };
}

describe('memory: exact lookup (G-T001)', () => {
    it('hits on source fingerprint + locale + compatible context', () => {
        const tm = new TranslationMemory([rev('tr-1')]);
        const hit = tm.lookup({ sourceHash: 'src-1', locale: 'fr-FR' });
        expect(hit?.revision.id).toBe('tr-1');
        expect(hit?.reason).toBe('agent-accepted');
    });

    it('misses on source change, locale change, or context change', () => {
        const tm = new TranslationMemory([rev('tr-1', { contextFingerprint: 'ctx-a' })]);
        expect(tm.lookup({ sourceHash: 'src-2', locale: 'fr-FR' })).toBeNull();
        expect(tm.lookup({ sourceHash: 'src-1', locale: 'de-DE' })).toBeNull();
        expect(tm.lookup({ sourceHash: 'src-1', locale: 'fr-FR', contextFingerprint: 'ctx-b' })).toBeNull();
        expect(tm.lookup({ sourceHash: 'src-1', locale: 'fr-FR', contextFingerprint: 'ctx-a' })?.revision.id).toBe('tr-1');
    });

    it('absent query context matches any revision context', () => {
        const tm = new TranslationMemory([rev('tr-1', { contextFingerprint: 'ctx-a' })]);
        expect(tm.lookup({ sourceHash: 'src-1', locale: 'fr-FR' })).not.toBeNull();
    });

    it('contextCompatible treats both-absent as compatible', () => {
        expect(contextCompatible(undefined, undefined)).toBe(true);
        expect(contextCompatible('a', undefined)).toBe(true);
        expect(contextCompatible('a', 'b')).toBe(false);
        expect(contextCompatible('a', 'a')).toBe(true);
    });
});

describe('memory: origin priority (G-T002/G-T003)', () => {
    it('prefers human over agent over imported', () => {
        const tm = new TranslationMemory([
            rev('tr-imported', { origin: 'imported', createdAt: '2026-03-01T00:00:00.000Z' }),
            rev('tr-agent', { origin: 'agent', createdAt: '2026-02-01T00:00:00.000Z' }),
            rev('tr-human', { origin: 'human', createdAt: '2026-01-01T00:00:00.000Z' }),
        ]);
        const hit = tm.lookup({ sourceHash: 'src-1', locale: 'fr-FR' });
        expect(hit?.revision.id).toBe('tr-human');
        expect(hit?.reason).toBe('human-accepted');
    });

    it('prefers newer within the same origin', () => {
        const tm = new TranslationMemory([
            rev('tr-old', { createdAt: '2026-01-01T00:00:00.000Z' }),
            rev('tr-new', { createdAt: '2026-06-01T00:00:00.000Z' }),
        ]);
        expect(tm.lookup({ sourceHash: 'src-1', locale: 'fr-FR' })?.revision.id).toBe('tr-new');
    });
});

describe('memory: bounded examples (G-T003)', () => {
    it('returns newest-first, locale-filtered, capped sets', () => {
        const tm = new TranslationMemory([
            rev('tr-1', { keyPath: 'x.a', createdAt: '2026-01-01T00:00:00.000Z' }),
            rev('tr-2', { keyPath: 'x.b', createdAt: '2026-02-01T00:00:00.000Z' }),
            rev('tr-3', { keyPath: 'x.c', targetLocale: 'de-DE', createdAt: '2026-03-01T00:00:00.000Z' }),
        ]);
        const examples = tm.getExamples('fr-FR', 5);
        expect(examples.map((e) => e.revision.id)).toEqual(['tr-2', 'tr-1']);
        expect(tm.getExamples('fr-FR', 1)).toHaveLength(1);
        expect(tm.getExamples('fr-FR', 5, 'x.b').map((e) => e.revision.id)).toEqual(['tr-1']);
        expect(tm.size).toBe(3);
    });
});
