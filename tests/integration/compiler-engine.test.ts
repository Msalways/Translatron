import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSyncEngine, type EngineInput, type EngineRunResult } from '../../src/core/compiler.js';
import { StubRuntime } from '../../src/runtime/stub.js';
import type { TranslationRuntime, RuntimeContext } from '../../src/runtime/runtime.js';
import type { RunPlan } from '../../src/core/domain.js';
import { readRegistry } from '../../src/registry/reader.js';
import { runCheck } from '../../src/cli/commands/check.js';
import { computeHash } from '../../src/utils/hash.js';
import { fingerprintSkill } from '../../src/skills/fingerprint.js';
import type { LoadedSkill } from '../../src/skills/types.js';
import type { SourceUnit, TargetSnapshot } from '../../src/core/domain.js';
import type { ProviderConfig } from '../../src/config/schema.js';

let dir: string;
beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'trn-eng-'));
});
afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});

function unit(keyPath: string, sourceText: string): SourceUnit {
    return {
        unitId: `u-${keyPath}`,
        keyPath,
        sourceText,
        sourceHash: computeHash(sourceText),
        placeholders: [],
        sourceFile: 'en.json',
        schemaVersion: 1,
    };
}

function snap(locale: string, entries: Record<string, string>): TargetSnapshot {
    const mapped: TargetSnapshot['entries'] = {};
    for (const [key, text] of Object.entries(entries)) {
        mapped[key] = { text, targetHash: computeHash(text) };
    }
    return { locale, entries: mapped };
}

function providers(): ProviderConfig[] {
    return [{ name: 'main', type: 'openai', model: 'gpt-5', temperature: 0, maxRetries: 0 }];
}

function skill(id: string, content: string): LoadedSkill {
    return {
        id,
        scope: 'language',
        locales: ['fr-FR'],
        docPath: `<test>/${id}.md`,
        content,
        resources: new Map(),
        glossary: {},
        examples: [],
        fingerprint: fingerprintSkill(content, new Map()),
    };
}

interface Project {
    sourceUnits: SourceUnit[];
    targets: TargetSnapshot[];
    targetFiles: Record<string, string>;
    registryDir: string;
}

function setupProject(source: Record<string, string>, targets: Record<string, Record<string, string>>): Project {
    const sourceUnits = Object.entries(source).map(([k, v]) => unit(k, v));
    const targetFiles: Record<string, string> = {};
    const snapshots: TargetSnapshot[] = [];
    for (const [locale, entries] of Object.entries(targets)) {
        const file = join(dir, `${locale}.json`);
        writeFileSync(file, JSON.stringify(entries, null, 2), 'utf-8');
        targetFiles[locale] = file;
        snapshots.push(snap(locale, entries));
    }
    return { sourceUnits, targets: snapshots, targetFiles, registryDir: join(dir, '.translatron') };
}

function readJson(file: string): Record<string, unknown> {
    return JSON.parse(readFileSync(file, 'utf-8')) as Record<string, unknown>;
}

function segments(registryDir: string): string[] {
    const segDir = join(registryDir, 'segments');
    if (!existsSync(segDir)) return [];
    return readdirSync(segDir).filter((f) => f.endsWith('.trn')).sort();
}

function baseInput(project: Project, opts: Partial<EngineInput> = {}): EngineInput {
    const { revisions } = readRegistry({ registryDir: project.registryDir });
    return {
        catalogId: 'main',
        sourceLocale: 'en-GB',
        sourceUnits: project.sourceUnits,
        targets: project.targets,
        targetFiles: project.targetFiles,
        revisions,
        skills: [],
        providers: providers(),
        registryDir: project.registryDir,
        projectDir: dir,
        runtime: new StubRuntime(),
        runId: 'run_test',
        createdAt: '2026-01-01T00:00:00.000Z',
        ...opts,
    };
}

/** Runtime wrapper recording every planned unit; delegates to inner. */
function trackingRuntime(inner: TranslationRuntime): { runtime: TranslationRuntime; planned: string[] } {
    const planned: string[] = [];
    const runtime: TranslationRuntime = {
        execute: (plan: RunPlan, ctx: RuntimeContext) => {
            for (const l of plan.languages) {
                for (const b of l.batches) {
                    for (const u of b) planned.push(`${l.locale}:${u.unitId}`);
                }
            }
            return inner.execute(plan, ctx);
        },
    };
    return { runtime, planned };
}

function throwingRuntime(): TranslationRuntime {
    return {
        execute: () => {
            throw new Error('worker invoked');
        },
    };
}

function isRunResult(result: EngineRunResult | { runId: string }): result is EngineRunResult {
    return (result as EngineRunResult).status !== undefined;
}

describe('engine: input invariants (review)', () => {
    it('empty providers fail loudly instead of indexing crash', async () => {
        const project = setupProject({ a: 'Hello' }, { 'fr-FR': {} });
        await expect(runSyncEngine({ ...baseInput(project), providers: [] })).rejects.toThrow(
            /at least one provider/
        );
    });

    it('staged work without a target file fails loudly (no ghost revisions)', async () => {
        const project = setupProject({ a: 'Hello' }, { 'fr-FR': {} });
        const input = baseInput(project);
        await expect(
            runSyncEngine({ ...input, targetFiles: {} })
        ).rejects.toThrow(/No target file configured for locale fr-FR/);
        // And nothing was published on the failed run.
        expect(readRegistry({ registryDir: project.registryDir }).revisions).toEqual([]);
    });
});

describe('engine: happy path + report (E-T010/US1)', () => {
    it('translates only NEW keys, publishes one segment, reports complete', async () => {
        const project = setupProject(
            { a: 'Hello', b: 'Bye', c: 'Thanks' },
            { 'fr-FR': {}, 'de-DE': {} }
        );
        // OWN-01: source files are never written by the engine.
        const sourceFile = join(dir, 'en.json');
        writeFileSync(sourceFile, JSON.stringify({ a: 'Hello', b: 'Bye', c: 'Thanks' }, null, 2), 'utf-8');
        const result = await runSyncEngine(baseInput(project));
        expect(isRunResult(result)).toBe(true);
        if (!isRunResult(result)) throw new Error('unreachable');
        expect(JSON.parse(readFileSync(sourceFile, 'utf-8'))).toEqual({ a: 'Hello', b: 'Bye', c: 'Thanks' });
        expect(result.status).toBe('complete');
        expect(result.tmReused).toBe(0);
        expect(result.filesUpdated).toHaveLength(2);
        expect(readJson(project.targetFiles['fr-FR'])['a']).toBe('[fr-FR] Hello');

        const segFiles = segments(project.registryDir);
        expect(segFiles).toHaveLength(1);
        const { revisions } = readRegistry({ registryDir: project.registryDir });
        expect(revisions).toHaveLength(6);
        for (const rev of revisions) {
            expect(rev.origin).toBe('agent');
            expect(rev.model).toBe('gpt-5');
            expect(rev.provider).toBe('openai');
            expect(rev.corePolicyFingerprint).toMatch(/^[0-9a-f]{16}$/);
            expect(rev.glossaryFingerprint).toBeDefined();
            expect(rev.gitCommit).toBeNull();
        }
        const kinds = result.events.map((e) => e.kind);
        for (const expected of ['run-started', 'planning-completed', 'catalog-written', 'registry-updated', 'run-completed']) {
            expect(kinds).toContain(expected);
        }
        expect(result.summaries.map((s) => [s.locale, s.status, s.translated])).toEqual([
            ['fr-FR', 'complete', 3],
            ['de-DE', 'complete', 3],
        ]);
    });

    it('idempotent rerun: zero workers, zero bytes, zero segments (SC-002)', async () => {
        for (let seed = 0; seed < 10; seed++) {
            const project = setupProject({ [`k${seed}`]: `Text ${seed}` }, { 'fr-FR': {} });
            const first = await runSyncEngine(baseInput(project, { runId: `run_a_${seed}` }));
            expect(isRunResult(first)).toBe(true);
            const before = segments(project.registryDir);
            const fileBefore = readFileSync(project.targetFiles['fr-FR'], 'utf-8');
            const tracked = trackingRuntime(new StubRuntime());
            const second = await runSyncEngine(
                baseInput(
                    {
                        ...project,
                        targets: [snap('fr-FR', readJson(project.targetFiles['fr-FR']) as Record<string, string>)],
                    },
                    { runtime: tracked.runtime, runId: `run_b_${seed}` }
                )
            );
            expect(isRunResult(second)).toBe(true);
            if (!isRunResult(second)) throw new Error('unreachable');
            expect(tracked.planned).toEqual([]);
            expect(readFileSync(project.targetFiles['fr-FR'], 'utf-8')).toBe(fileBefore);
            expect(segments(project.registryDir)).toEqual(before);
            expect(second.summaries).toEqual([]);
            expect(second.segmentFile).toBeUndefined();
        }
    });
});

describe('engine: TM reuse without model calls (E-T010/US2)', () => {
    it('cross-key exact match reuses sibling text and parents its revision', async () => {
        const project = setupProject({ a: 'Hello' }, { 'fr-FR': {} });
        await runSyncEngine(baseInput(project, { runId: 'run_1' }));
        // Add key B with identical source text.
        const project2: Project = {
            sourceUnits: [unit('a', 'Hello'), unit('b', 'Hello')],
            targets: [snap('fr-FR', readJson(project.targetFiles['fr-FR']) as Record<string, string>)],
            targetFiles: project.targetFiles,
            registryDir: project.registryDir,
        };
        const tracked = trackingRuntime(new StubRuntime());
        const result = await runSyncEngine(baseInput(project2, { runtime: tracked.runtime, runId: 'run_2' }));
        expect(isRunResult(result)).toBe(true);
        if (!isRunResult(result)) throw new Error('unreachable');
        expect(tracked.planned).toEqual([]);
        expect(result.tmReused).toBe(1);
        expect(readJson(project.targetFiles['fr-FR'])['b']).toBe('[fr-FR] Hello');
        const { revisions } = readRegistry({ registryDir: project.registryDir });
        const bRev = revisions.find((r) => r.keyPath === 'b');
        const aRev = revisions.find((r) => r.keyPath === 'a');
        expect(bRev?.parentIds).toEqual([aRev?.id]);
    });

    it('skill rotation blocks reuse (chain-equality); unit goes to translation', async () => {
        const project = setupProject({ a: 'Hello' }, { 'fr-FR': {} });
        await runSyncEngine(baseInput(project, { runId: 'run_1' }));
        const targets = [snap('fr-FR', readJson(project.targetFiles['fr-FR']) as Record<string, string>)];
        const tracked = trackingRuntime(new StubRuntime());
        const result = await runSyncEngine(
            baseInput({ ...project, targets }, { skills: [skill('s', 'new guidance')], runtime: tracked.runtime, runId: 'run_2' })
        );
        expect(isRunResult(result)).toBe(true);
        if (!isRunResult(result)) throw new Error('unreachable');
        expect(tracked.planned).toEqual(['fr-FR:u-a']);
        expect(result.tmReused).toBe(0);
        const { revisions } = readRegistry({ registryDir: project.registryDir });
        const latest = revisions.filter((r) => r.keyPath === 'a').sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1))[0];
        expect(latest.skillFingerprints?.map((s) => s.id)).toContain('s');
    });

    it('affectedBySkill filters work to skill-stale units (FR-010)', async () => {
        const project = setupProject({ a: 'Hello' }, { 'fr-FR': {} });
        await runSyncEngine(baseInput(project, { runId: 'run_1' }));
        // Run 2: skill added (a goes SKILL_STALE) + brand-new key b.
        const project2: Project = {
            sourceUnits: [unit('a', 'Hello'), unit('b', 'World')],
            targets: [snap('fr-FR', readJson(project.targetFiles['fr-FR']) as Record<string, string>)],
            targetFiles: project.targetFiles,
            registryDir: project.registryDir,
        };
        const tracked = trackingRuntime(new StubRuntime());
        await runSyncEngine(
            baseInput(project2, { skills: [skill('s', 'v1')], runtime: tracked.runtime, runId: 'run_2', affectedBySkill: 's' })
        );
        expect(tracked.planned).toEqual(['fr-FR:u-a']);
    });
});

describe('engine: orphan removal + policies (E-T011/US3)', () => {
    function removedProject(policy?: EngineInput['policies'], targetOnly?: string[]): { project: Project; input: EngineInput } {
        const project = setupProject(
            { keep: 'Keep me' },
            { 'fr-FR': { keep: '[fr-FR] Keep me', gone: 'Stale' }, 'de-DE': { keep: '[de-DE] Keep me', gone: 'Stale' } }
        );
        const input = baseInput(project, {
            runId: 'run_rm',
            ...(policy !== undefined ? { policies: policy } : {}),
            ...(targetOnly !== undefined ? { targetOnly } : {}),
        });
        return { project, input };
    }

    it('default policy removes managed targets and records removals (S10 steps 6-8)', async () => {
        const { project, input } = removedProject();
        const result = await runSyncEngine(input);
        expect(isRunResult(result)).toBe(true);
        if (!isRunResult(result)) throw new Error('unreachable');
        expect(readJson(project.targetFiles['fr-FR'])).not.toHaveProperty('gone');
        expect(readJson(project.targetFiles['de-DE'])).not.toHaveProperty('gone');
        const { removals, revisions } = readRegistry({ registryDir: project.registryDir });
        expect(removals.map((r) => r.keyPath)).toEqual(['gone']);
        expect(removals[0].previousSourceHash).toBeDefined();
        // `keep` had no lineage → adopted as imported alongside the removal.
        expect(revisions.filter((r) => r.origin === 'imported')).toHaveLength(2);
        expect(revisions.some((r) => r.origin === 'agent')).toBe(false);
        expect(result.filesUpdated).toHaveLength(2);
    });

    it('warn-only preserves files and reports warnings with success', async () => {
        const { project, input } = removedProject({ removal: 'warn-only' });
        const before = readFileSync(project.targetFiles['fr-FR'], 'utf-8');
        const result = await runSyncEngine(input);
        expect(isRunResult(result)).toBe(true);
        if (!isRunResult(result)) throw new Error('unreachable');
        expect(readFileSync(project.targetFiles['fr-FR'], 'utf-8')).toBe(before);
        expect(result.status).toBe('complete');
        expect(result.warnings).toEqual(['ORPHANED de-DE gone', 'ORPHANED fr-FR gone']);
        expect(segments(project.registryDir)).toHaveLength(1);
    });

    it('preserve skips silently', async () => {
        const { project, input } = removedProject({ removal: 'preserve' });
        const result = await runSyncEngine(input);
        expect(isRunResult(result)).toBe(true);
        if (!isRunResult(result)) throw new Error('unreachable');
        expect(readJson(project.targetFiles['fr-FR'])).toHaveProperty('gone');
        expect(result.warnings).toEqual([]);
        // No removal, but `keep` adoptions still publish.
        const { revisions } = readRegistry({ registryDir: project.registryDir });
        expect(revisions.every((r) => r.origin === 'imported')).toBe(true);
    });

    it('targetOnly exceptions are preserved and unreported', async () => {
        const project = setupProject(
            { keep: 'Keep me' },
            { 'de-DE': { keep: 'x', 'legal.countrySpecific.note': 'Y' } }
        );
        const result = await runSyncEngine(
            baseInput(project, { runId: 'run_ex', targetOnly: ['legal.countrySpecific.*'] })
        );
        expect(isRunResult(result)).toBe(true);
        if (!isRunResult(result)) throw new Error('unreachable');
        expect(readJson(project.targetFiles['de-DE'])).toHaveProperty('legal.countrySpecific.note');
        expect(result.warnings).toEqual([]);
    });
});

describe('engine: human revisions + adoption + force (E-T011/US4)', () => {
    it('manual edit publishes one parented human revision; rerun publishes nothing', async () => {
        const project = setupProject({ a: 'Hello' }, { 'fr-FR': {} });
        await runSyncEngine(baseInput(project, { runId: 'run_1' }));
        // Developer edits by hand.
        writeFileSync(project.targetFiles['fr-FR'], JSON.stringify({ a: 'Bonjour (hand)' }, null, 2), 'utf-8');
        const targets = [snap('fr-FR', { a: 'Bonjour (hand)' })];
        const second = await runSyncEngine(baseInput({ ...project, targets }, { runId: 'run_2' }));
        expect(isRunResult(second)).toBe(true);
        if (!isRunResult(second)) throw new Error('unreachable');
        expect(readJson(project.targetFiles['fr-FR'])['a']).toBe('Bonjour (hand)');
        let state = readRegistry({ registryDir: project.registryDir });
        const human = state.revisions.find((r) => r.origin === 'human');
        const agent = state.revisions.find((r) => r.origin === 'agent');
        expect(human?.parentIds).toEqual([agent?.id]);
        const count = state.revisions.length;
        // Third run: already recorded → nothing new.
        const third = await runSyncEngine(
            baseInput({ ...project, targets }, { runId: 'run_3' })
        );
        expect(isRunResult(third)).toBe(true);
        state = readRegistry({ registryDir: project.registryDir });
        expect(state.revisions.length).toBe(count);
        expect(third.segmentFile).toBeUndefined();
    });

    it('UNTRACKED targets are adopted as imported, once', async () => {
        const project = setupProject({ a: 'Hello' }, { 'fr-FR': { a: 'Bonjour' } });
        const result = await runSyncEngine(baseInput(project, { runId: 'run_1' }));
        expect(isRunResult(result)).toBe(true);
        const { revisions } = readRegistry({ registryDir: project.registryDir });
        expect(revisions).toHaveLength(1);
        expect(revisions[0].origin).toBe('imported');
        expect(revisions[0].parentIds).toEqual([]);
    });

    it('force regenerates MANUAL units as forced work with no human revision', async () => {
        const project = setupProject({ a: 'Hello' }, { 'fr-FR': {} });
        await runSyncEngine(baseInput(project, { runId: 'run_1' }));
        writeFileSync(project.targetFiles['fr-FR'], JSON.stringify({ a: 'Bonjour (hand)' }, null, 2), 'utf-8');
        const targets = [snap('fr-FR', { a: 'Bonjour (hand)' })];
        const tracked = trackingRuntime(new StubRuntime());
        const result = await runSyncEngine(
            baseInput({ ...project, targets }, { runtime: tracked.runtime, runId: 'run_2', forceRegenerate: true })
        );
        expect(isRunResult(result)).toBe(true);
        expect(tracked.planned).toEqual(['fr-FR:u-a']);
        expect(readJson(project.targetFiles['fr-FR'])['a']).toBe('[fr-FR] Hello');
        const { revisions } = readRegistry({ registryDir: project.registryDir });
        expect(revisions.some((r) => r.origin === 'human')).toBe(false);
        expect(revisions.filter((r) => r.origin === 'agent')).toHaveLength(2);
    });
});

describe('engine: partial success, dry run, validation failure (E-T011/US5-6)', () => {
    it('crashed locale fails while green work persists (partial_success)', async () => {
        const project = setupProject({ a: 'Hello' }, { 'fr-FR': {}, 'de-DE': {} });
        const result = await runSyncEngine(
            baseInput(project, {
                runId: 'run_p',
                runtime: new StubRuntime({ 'de-DE': { kind: 'fail-language', error: 'boom' } }),
            })
        );
        expect(isRunResult(result)).toBe(true);
        if (!isRunResult(result)) throw new Error('unreachable');
        expect(result.status).toBe('partial_success');
        expect(readJson(project.targetFiles['fr-FR'])['a']).toBe('[fr-FR] Hello');
        expect(readJson(project.targetFiles['de-DE'])).toEqual({});
        const { revisions } = readRegistry({ registryDir: project.registryDir });
        expect(revisions.every((r) => r.targetLocale === 'fr-FR')).toBe(true);
        expect(result.summaries.find((s) => s.locale === 'de-DE')?.status).toBe('failed');
    });

    it('dry run reports plans with zero filesystem changes', async () => {
        const project = setupProject(
            { a: 'Hello' },
            { 'fr-FR': { stale: 'Old' } }
        );
        const before = readdirSync(dir).sort();
        const fileBefore = readFileSync(project.targetFiles['fr-FR'], 'utf-8');
        const result = await runSyncEngine(baseInput(project, { runId: 'run_d', dryRun: true }));
        expect(isRunResult(result)).toBe(false);
        const dry = result as { plannedTranslations: number; plannedRemovals: number; tmReuses: number };
        expect(dry.plannedTranslations).toBe(1);
        expect(dry.plannedRemovals).toBe(1);
        expect(readdirSync(dir).sort()).toEqual(before);
        expect(readFileSync(project.targetFiles['fr-FR'], 'utf-8')).toBe(fileBefore);
        expect(existsSync(project.registryDir)).toBe(false);
    });

    it('validation-failed output is excluded from files and registry', async () => {
        const project = setupProject({ good: 'Hello {name}', bad: 'Bye {name}' }, { 'fr-FR': {} });
        const badRuntime = new StubRuntime({
            'fr-FR': {
                kind: 'translate',
                textFor: (unitId, sourceText, locale) =>
                    unitId === 'u-bad' ? 'Au revoir' : `[${locale}] ${sourceText}`,
            },
        });
        const result = await runSyncEngine(baseInput(project, { runId: 'run_v', runtime: badRuntime }));
        expect(isRunResult(result)).toBe(true);
        if (!isRunResult(result)) throw new Error('unreachable');
        // 'bad' drops {name} → invalid; 'good' writes.
        expect(readJson(project.targetFiles['fr-FR'])['good']).toBe('[fr-FR] Hello {name}');
        expect(readJson(project.targetFiles['fr-FR'])).not.toHaveProperty('bad');
        const { revisions } = readRegistry({ registryDir: project.registryDir });
        expect(revisions.map((r) => r.keyPath)).toEqual(['good']);
        expect(result.summaries[0].failed).toBe(1);
    });
});

describe('engine: S10 lifecycle + S7/S8 + legacy + gitCommit (E-T011/FR-014)', () => {
    it('S10: exist → translate → remove → check → sync-clean → recorded → queryable → re-add → reuse → validate → lineage', async () => {
        // 1-2. Source keys exist; translate (sibling k2 shares k1's text).
        const project = setupProject({ k1: 'Same text', k2: 'Same text' }, { 'fr-FR': {} });
        const input1 = baseInput(project, { runId: 'run_1' });
        const r1 = await runSyncEngine(input1);
        expect(isRunResult(r1) && r1.status).toBe('complete');
        // 3. Registry has accepted revisions.
        let state = readRegistry({ registryDir: project.registryDir });
        expect(state.revisions.length).toBeGreaterThan(0);
        // 4. Source key removed (snapshots rebuilt from current files).
        const removed: Project = {
            ...project,
            sourceUnits: project.sourceUnits.filter((u) => u.keyPath === 'k2'),
            targets: [snap('fr-FR', readJson(project.targetFiles['fr-FR']) as Record<string, string>)],
        };
        // 5. check reports ORPHANED.
        const check = runCheck({
            sourceLocale: 'en-GB',
            sourceUnits: removed.sourceUnits,
            targets: [{ locale: 'fr-FR', entries: readJson(project.targetFiles['fr-FR']) as Record<string, string> }],
        });
        expect(check.failed).toBe(true);
        expect(check.issues.some((i) => i.kind === 'orphan' && i.keyPath === 'k1')).toBe(true);
        // 6. Sync removes managed target entries.
        const r2 = await runSyncEngine(baseInput(removed, { runId: 'run_2' }));
        expect(isRunResult(r2)).toBe(true);
        expect(readJson(project.targetFiles['fr-FR'])).not.toHaveProperty('k1');
        // 7. Registry appends removal record.
        state = readRegistry({ registryDir: project.registryDir });
        expect(state.removals.map((r) => r.keyPath)).toContain('k1');
        // 8. Old revisions remain queryable.
        expect(state.revisions.some((r) => r.keyPath === 'k1')).toBe(true);
        // 9. Same key re-added with compatible fingerprint.
        const restored: Project = {
            ...project,
            sourceUnits: [...removed.sourceUnits, unit('k1', 'Same text')],
            targets: [snap('fr-FR', readJson(project.targetFiles['fr-FR']) as Record<string, string>)],
        };
        // 10. Exact reuse via sibling k2 (no model call for k1).
        const tracked = trackingRuntime(throwingRuntime());
        const r3 = await runSyncEngine(baseInput(restored, { runtime: tracked.runtime, runId: 'run_3' }));
        expect(isRunResult(r3)).toBe(true);
        if (!isRunResult(r3)) throw new Error('unreachable');
        expect(tracked.planned).toEqual([]);
        expect(r3.tmReused).toBe(1);
        expect(readJson(project.targetFiles['fr-FR'])['k1']).toBe(
            readJson(project.targetFiles['fr-FR'])['k2']
        );
        // 11. Validation passes.
        const check2 = runCheck({
            sourceLocale: 'en-GB',
            sourceUnits: restored.sourceUnits,
            targets: [{ locale: 'fr-FR', entries: readJson(project.targetFiles['fr-FR']) as Record<string, string> }],
        });
        expect(check2.failed).toBe(false);
        // 12. New revision references prior lineage.
        state = readRegistry({ registryDir: project.registryDir });
        const k1Revs = state.revisions.filter((r) => r.keyPath === 'k1');
        expect(k1Revs.length).toBeGreaterThanOrEqual(2);
        const newest = k1Revs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
        expect(newest.runId).toBe('run_3');
        expect(newest.parentIds.length).toBe(1);
    });

    it('S7: only the new key translates on an uncommitted tree', async () => {
        const project = setupProject({ a: 'Hello' }, { 'fr-FR': {} });
        await runSyncEngine(baseInput(project, { runId: 'run_1' }));
        const project2: Project = {
            sourceUnits: [unit('a', 'Hello'), unit('b', 'World')],
            targets: [snap('fr-FR', readJson(project.targetFiles['fr-FR']) as Record<string, string>)],
            targetFiles: project.targetFiles,
            registryDir: project.registryDir,
        };
        const tracked = trackingRuntime(new StubRuntime());
        await runSyncEngine(baseInput(project2, { runtime: tracked.runtime, runId: 'run_2' }));
        expect(tracked.planned).toEqual(['fr-FR:u-b']);
    });

    it('S8: identical inputs yield identical artifacts', async () => {
        const build = (): { project: Project; input: EngineInput } => {
            const d = mkdtempSync(join(tmpdir(), 'trn-det-'));
            const file = join(d, 'fr-FR.json');
            writeFileSync(file, JSON.stringify({}), 'utf-8');
            const project: Project = {
                sourceUnits: [unit('a', 'Hello')],
                targets: [snap('fr-FR', {})],
                targetFiles: { 'fr-FR': file },
                registryDir: join(d, '.translatron'),
            };
            return {
                project,
                input: {
                    catalogId: 'main',
                    sourceLocale: 'en-GB',
                    sourceUnits: project.sourceUnits,
                    targets: project.targets,
                    targetFiles: project.targetFiles,
                    revisions: [],
                    skills: [],
                    providers: providers(),
                    registryDir: project.registryDir,
                    projectDir: d,
                    runtime: new StubRuntime(),
                    runId: 'run_det',
                    createdAt: '2026-01-01T00:00:00.000Z',
                },
            };
        };
        const first = build();
        const second = build();
        try {
            await runSyncEngine(first.input);
            await runSyncEngine(second.input);
            expect(readFileSync(first.project.targetFiles['fr-FR'], 'utf-8')).toBe(
                readFileSync(second.project.targetFiles['fr-FR'], 'utf-8')
            );
            const segA = readdirSync(join(first.project.registryDir, 'segments'));
            const segB = readdirSync(join(second.project.registryDir, 'segments'));
            expect(segA).toEqual(segB);
            expect(readFileSync(join(first.project.registryDir, 'segments', segA[0]), 'utf-8')).toBe(
                readFileSync(join(second.project.registryDir, 'segments', segB[0]), 'utf-8')
            );
        } finally {
            rmSync(first.input.projectDir, { recursive: true, force: true });
            rmSync(second.input.projectDir, { recursive: true, force: true });
        }
    });

    it('legacy prompts flow into worker materials; gitCommit null outside repos', async () => {
        const project = setupProject({ a: 'Hello' }, { 'fr-FR': {} });
        let captured: RuntimeContext | null = null;
        const passthrough: TranslationRuntime = {
            execute: (plan, ctx) => {
                captured = ctx;
                return new StubRuntime().execute(plan, ctx);
            },
        };
        const result = await runSyncEngine(
            baseInput(project, {
                runId: 'run_leg',
                runtime: passthrough,
                legacyPrompts: { brandVoice: 'playful', glossary: { hello: 'bonjour' } },
            })
        );
        expect(isRunResult(result)).toBe(true);
        expect(captured).not.toBeNull();
        const skills = (captured as unknown as RuntimeContext).materials[0].skills;
        expect(skills.map((s) => s.id)).toContain('legacy-project');
        expect((captured as unknown as RuntimeContext).materials[0].glossary['hello']).toBe('bonjour');
        const { revisions } = readRegistry({ registryDir: project.registryDir });
        expect(revisions[0].gitCommit).toBeNull();
    });
});
