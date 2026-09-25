import { describe, it, expect } from 'vitest';
import {
    deriveState,
    latestAgentRevision,
    latestRevision,
    reconcile,
    scopedKey,
    type ReconcileInput,
} from '../../src/core/reconciler.js';
import type {
    SourceUnit,
    TargetSnapshot,
    TranslationIdentity,
    TranslationRevision,
} from '../../src/core/domain.js';

function unit(keyPath: string, sourceText = 'text', sourceHash = 'src-v1'): SourceUnit {
    return {
        unitId: `u-${keyPath}`,
        keyPath,
        sourceText,
        sourceHash,
        placeholders: [],
        sourceFile: 'en-GB.json',
        schemaVersion: 1,
    };
}

function rev(
    keyPath: string,
    targetLocale: string,
    overrides: Partial<TranslationRevision> = {}
): TranslationRevision {
    return {
        id: `tr-${targetLocale}-${keyPath}`,
        catalogId: 'main',
        keyPath,
        sourceLocale: 'en-GB',
        targetLocale,
        sourceHash: 'src-v1',
        targetHash: 'tgt-v1',
        origin: 'agent',
        parentIds: [],
        runId: 'run_1',
        createdAt: '2026-01-01T00:00:00.000Z',
        ...overrides,
    };
}

function identity(keyPath: string, targetLocale: string): TranslationIdentity {
    return { catalogId: 'main', keyPath, sourceLocale: 'en-GB', targetLocale };
}

function baseInput(): ReconcileInput {
    return {
        sourceLocale: 'en-GB',
        catalogId: 'main',
        sourceUnits: [],
        targets: [],
        revisions: [],
    };
}

const SKILLS = new Map([['global', 'fp-global']]);

describe('reconciler: 12-state matrix (A2-T005)', () => {
    it('NEW — source exists, no target, never tracked', () => {
        expect(
            deriveState({
                identity: identity('a', 'fr-FR'),
                sourceUnit: unit('a'),
                currentTargetHash: undefined,
                revisions: [],
                currentSkills: new Map(),
                currentContextFingerprint: undefined,
                isFailed: false,
                isConflict: false,
                needsReview: false,
            })
        ).toBe('NEW');
    });

    it('TARGET_DELETED — tracked revision exists but file entry gone', () => {
        expect(
            deriveState({
                identity: identity('a', 'fr-FR'),
                sourceUnit: unit('a'),
                currentTargetHash: undefined,
                revisions: [rev('a', 'fr-FR')],
                currentSkills: new Map(),
                currentContextFingerprint: undefined,
                isFailed: false,
                isConflict: false,
                needsReview: false,
            })
        ).toBe('TARGET_DELETED');
    });

    it('FAILED — previous attempt failed, still no target', () => {
        expect(
            deriveState({
                identity: identity('a', 'fr-FR'),
                sourceUnit: unit('a'),
                currentTargetHash: undefined,
                revisions: [],
                currentSkills: new Map(),
                currentContextFingerprint: undefined,
                isFailed: true,
                isConflict: false,
                needsReview: false,
            })
        ).toBe('FAILED');
    });

    it('UNTRACKED — target exists but no provenance', () => {
        expect(
            deriveState({
                identity: identity('a', 'fr-FR'),
                sourceUnit: unit('a'),
                currentTargetHash: 'some-hash',
                revisions: [],
                currentSkills: new Map(),
                currentContextFingerprint: undefined,
                isFailed: false,
                isConflict: false,
                needsReview: false,
            })
        ).toBe('UNTRACKED');
    });

    it('CLEAN — target matches accepted revision', () => {
        expect(
            deriveState({
                identity: identity('a', 'fr-FR'),
                sourceUnit: unit('a'),
                currentTargetHash: 'tgt-v1',
                revisions: [rev('a', 'fr-FR')],
                currentSkills: new Map(),
                currentContextFingerprint: undefined,
                isFailed: false,
                isConflict: false,
                needsReview: false,
            })
        ).toBe('CLEAN');
    });

    it('CLEAN — imported revision match counts as accepted', () => {
        const imported = rev('a', 'fr-FR', { origin: 'imported', id: 'tr-imp' });
        expect(
            deriveState({
                identity: identity('a', 'fr-FR'),
                sourceUnit: unit('a'),
                currentTargetHash: 'tgt-v1',
                revisions: [imported],
                currentSkills: new Map(),
                currentContextFingerprint: undefined,
                isFailed: false,
                isConflict: false,
                needsReview: false,
            })
        ).toBe('CLEAN');
    });

    it('MANUAL — target differs from last agent revision', () => {
        expect(
            deriveState({
                identity: identity('a', 'fr-FR'),
                sourceUnit: unit('a'),
                currentTargetHash: 'human-edit',
                revisions: [rev('a', 'fr-FR')],
                currentSkills: new Map(),
                currentContextFingerprint: undefined,
                isFailed: false,
                isConflict: false,
                needsReview: false,
            })
        ).toBe('MANUAL');
    });

    it('SOURCE_STALE — source changed after translation', () => {
        expect(
            deriveState({
                identity: identity('a', 'fr-FR'),
                sourceUnit: unit('a', 'text', 'src-v2'),
                currentTargetHash: 'tgt-v1',
                revisions: [rev('a', 'fr-FR')],
                currentSkills: new Map(),
                currentContextFingerprint: undefined,
                isFailed: false,
                isConflict: false,
                needsReview: false,
            })
        ).toBe('SOURCE_STALE');
    });

    it('SKILL_STALE — skill fingerprint rotated', () => {
        const withSkill = rev('a', 'fr-FR', {
            skillFingerprints: [{ id: 'global', scope: 'global', fingerprint: 'fp-old' }],
        });
        expect(
            deriveState({
                identity: identity('a', 'fr-FR'),
                sourceUnit: unit('a'),
                currentTargetHash: 'tgt-v1',
                revisions: [withSkill],
                currentSkills: SKILLS,
                currentContextFingerprint: undefined,
                isFailed: false,
                isConflict: false,
                needsReview: false,
            })
        ).toBe('SKILL_STALE');
    });

    it('SKILL_STALE — revision predates skills entirely', () => {
        expect(
            deriveState({
                identity: identity('a', 'fr-FR'),
                sourceUnit: unit('a'),
                currentTargetHash: 'tgt-v1',
                revisions: [rev('a', 'fr-FR')],
                currentSkills: SKILLS,
                currentContextFingerprint: undefined,
                isFailed: false,
                isConflict: false,
                needsReview: false,
            })
        ).toBe('SKILL_STALE');
    });

    it('CONTEXT_STALE — context fingerprint changed', () => {
        const withCtx = rev('a', 'fr-FR', { contextFingerprint: 'ctx-old' });
        expect(
            deriveState({
                identity: identity('a', 'fr-FR'),
                sourceUnit: unit('a'),
                currentTargetHash: 'tgt-v1',
                revisions: [withCtx],
                currentSkills: new Map(),
                currentContextFingerprint: 'ctx-new',
                isFailed: false,
                isConflict: false,
                needsReview: false,
            })
        ).toBe('CONTEXT_STALE');
    });

    it('ORPHANED — source key removed', () => {
        expect(
            deriveState({
                identity: identity('a', 'fr-FR'),
                sourceUnit: undefined,
                currentTargetHash: 'tgt-v1',
                revisions: [rev('a', 'fr-FR')],
                currentSkills: new Map(),
                currentContextFingerprint: undefined,
                isFailed: false,
                isConflict: false,
                needsReview: false,
            })
        ).toBe('ORPHANED');
    });

    it('CONFLICT — competing human revisions', () => {
        expect(
            deriveState({
                identity: identity('a', 'fr-FR'),
                sourceUnit: unit('a'),
                currentTargetHash: 'tgt-v1',
                revisions: [rev('a', 'fr-FR')],
                currentSkills: new Map(),
                currentContextFingerprint: undefined,
                isFailed: false,
                isConflict: true,
                needsReview: false,
            })
        ).toBe('CONFLICT');
    });

    it('NEEDS_REVIEW — policy routes to human', () => {
        expect(
            deriveState({
                identity: identity('a', 'fr-FR'),
                sourceUnit: unit('a'),
                currentTargetHash: 'tgt-v1',
                revisions: [rev('a', 'fr-FR')],
                currentSkills: new Map(),
                currentContextFingerprint: undefined,
                isFailed: false,
                isConflict: false,
                needsReview: true,
            })
        ).toBe('NEEDS_REVIEW');
    });
});

describe('reconciler: precedence (A2-T006)', () => {
    it('MANUAL beats SOURCE_STALE (human ownership wins)', () => {
        expect(
            deriveState({
                identity: identity('a', 'fr-FR'),
                sourceUnit: unit('a', 'text', 'src-v2'),
                currentTargetHash: 'human-edit',
                revisions: [rev('a', 'fr-FR')],
                currentSkills: new Map(),
                currentContextFingerprint: undefined,
                isFailed: false,
                isConflict: false,
                needsReview: false,
            })
        ).toBe('MANUAL');
    });

    it('CONFLICT beats MANUAL', () => {
        expect(
            deriveState({
                identity: identity('a', 'fr-FR'),
                sourceUnit: unit('a'),
                currentTargetHash: 'human-edit',
                revisions: [rev('a', 'fr-FR')],
                currentSkills: new Map(),
                currentContextFingerprint: undefined,
                isFailed: false,
                isConflict: true,
                needsReview: false,
            })
        ).toBe('CONFLICT');
    });

    it('latestRevision prefers newest createdAt, id breaks ties', () => {
        const older = rev('a', 'fr-FR', { id: 'tr-b', createdAt: '2026-01-02T00:00:00.000Z' });
        const newer = rev('a', 'fr-FR', { id: 'tr-a', createdAt: '2026-01-03T00:00:00.000Z' });
        expect(latestRevision([older, newer])?.id).toBe('tr-a');
        const tie1 = rev('a', 'fr-FR', { id: 'tr-a', createdAt: '2026-01-01T00:00:00.000Z' });
        const tie2 = rev('a', 'fr-FR', { id: 'tr-b', createdAt: '2026-01-01T00:00:00.000Z' });
        expect(latestRevision([tie1, tie2])?.id).toBe('tr-b');
    });

    it('latestAgentRevision ignores human/imported revisions', () => {
        const human = rev('a', 'fr-FR', {
            id: 'tr-human',
            origin: 'human',
            createdAt: '2026-02-01T00:00:00.000Z',
        });
        const agent = rev('a', 'fr-FR', { id: 'tr-agent' });
        expect(latestAgentRevision([human, agent])?.id).toBe('tr-agent');
    });
});

describe('reconciler: full reconcile + work units (A2-T006)', () => {
    function target(locale: string, entries: Record<string, string>): TargetSnapshot {
        const mapped: TargetSnapshot['entries'] = {};
        for (const [key, text] of Object.entries(entries)) {
            mapped[key] = { text, targetHash: `hash:${text}` };
        }
        return { locale, entries: mapped };
    }

    it('maps a mixed project to exact states and selects work', () => {
        const input: ReconcileInput = {
            ...baseInput(),
            sourceUnits: [unit('new.key'), unit('clean.key'), unit('manual.key'), unit('stale.key')],
            targets: [
                target('fr-FR', {
                    'clean.key': 't-clean',
                    'manual.key': 'touched-by-human',
                    'stale.key': 't-stale',
                }),
            ],
            revisions: [
                rev('clean.key', 'fr-FR', { targetHash: 'hash:t-clean' }),
                rev('manual.key', 'fr-FR', { targetHash: 'hash:t-manual-old' }),
                rev('stale.key', 'fr-FR', { targetHash: 'hash:t-stale', sourceHash: 'src-old' }),
            ],
        };
        // Align stale revision source hash with old source
        input.revisions[2] = { ...input.revisions[2], sourceHash: 'src-old' };

        const { reconciled, workUnits } = reconcile(input);
        const states = new Map(reconciled.map((r) => [r.identity.keyPath, r.status]));
        expect(states.get('new.key')).toBe('NEW');
        expect(states.get('clean.key')).toBe('CLEAN');
        expect(states.get('manual.key')).toBe('MANUAL');
        expect(states.get('stale.key')).toBe('SOURCE_STALE');

        // Work selected for NEW + SOURCE_STALE only, with reasons, stable order.
        expect(workUnits.map((w) => [w.keyPath, w.reason])).toEqual([
            ['new.key', 'new'],
            ['stale.key', 'source-changed'],
        ]);
        expect(reconciled[0].latestAgentRevisionId).toBeUndefined();
        expect(reconciled[1].latestRevisionId).toBe('tr-fr-FR-clean.key');
    });

    it('scopedKey is locale-scoped', () => {
        expect(scopedKey('fr-FR', 'a')).toBe('fr-FRa');
        expect(scopedKey('fr-FR', 'a')).not.toBe(scopedKey('de-DE', 'a'));
    });
});
