import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSyncEngine, type EngineInput, type EngineRunResult } from '../../src/core/compiler.js';
import { StubRuntime } from '../../src/runtime/stub.js';
import type { TranslationRuntime, RuntimeContext } from '../../src/runtime/runtime.js';
import type { RunPlan } from '../../src/core/domain.js';
import { readRegistry } from '../../src/registry/reader.js';
import { explainKey } from '../../src/cli/commands/explain.js';
import { scopedKey } from '../../src/core/reconciler.js';
import { safeValidateConfig } from '../../src/config/schema.js';
import { computeHash } from '../../src/utils/hash.js';
import type { SourceUnit, TargetSnapshot } from '../../src/core/domain.js';
import type { ProviderConfig } from '../../src/config/schema.js';

let dir: string;
beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'trn-rev-'));
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

function baseInput(overrides: Partial<EngineInput> & { source: Record<string, string>; targets: Record<string, Record<string, string>> }): EngineInput {
    const targetFiles: Record<string, string> = {};
    const snapshots: TargetSnapshot[] = [];
    for (const [locale, entries] of Object.entries(overrides.targets)) {
        const file = join(dir, `${locale}.json`);
        writeFileSync(file, JSON.stringify(entries, null, 2), 'utf-8');
        targetFiles[locale] = file;
        snapshots.push(snap(locale, entries));
    }
    const { revisions } = readRegistry({ registryDir: join(dir, '.translatron') });
    const { source: sourceEntries, targets: _targets, ...rest } = overrides;
    void _targets;
    return {
        catalogId: 'main',
        sourceLocale: 'en-GB',
        sourceUnits: Object.entries(sourceEntries).map(([k, v]) => unit(k, v)),
        targets: snapshots,
        targetFiles,
        revisions,
        skills: [],
        providers: providers(),
        registryDir: join(dir, '.translatron'),
        projectDir: dir,
        runtime: new StubRuntime(),
        ...rest,
    };
}

function isRunResult(result: unknown): result is EngineRunResult {
    return (result as EngineRunResult).status !== undefined;
}

describe('review-routing: reviewKeys globs (R-T002/US1)', () => {
    it('NEW legal key routes to review: no write, no revision, no worker plan', async () => {
        const tracked = trackingRuntime(new StubRuntime());
        const result = await runSyncEngine(
            baseInput({
                source: { 'legal.terms': 'Terms apply', 'shop.buy': 'Buy now' },
                targets: { 'fr-FR': {} },
                runtime: tracked.runtime,
                runId: 'run_r1',
                requireReviewFor: ['legal.*'],
            })
        );
        expect(isRunResult(result)).toBe(true);
        if (!isRunResult(result)) throw new Error('unreachable');
        expect(tracked.planned).toEqual(['fr-FR:u-shop.buy']);
        expect(result.skipped.needsReview).toBe(1);
        expect(readRegistry({ registryDir: join(dir, '.translatron') }).revisions.map((r) => r.keyPath)).toEqual(['shop.buy']);
        // Derived state visible through the normal path.
        const explained = explainKey({
            keyPath: 'legal.terms',
            locale: 'fr-FR',
            sourceLocale: 'en-GB',
            catalogId: 'main',
            sourceUnits: [unit('legal.terms', 'Terms apply')],
            targets: [snap('fr-FR', {})],
            revisions: readRegistry({ registryDir: join(dir, '.translatron') }).revisions,
            needsReviewKeys: new Set([scopedKey('fr-FR', 'legal.terms')]),
        });
        expect(explained?.state).toBe('NEEDS_REVIEW');
    });

    it('empty requireReviewFor is a no-op', async () => {
        const tracked = trackingRuntime(new StubRuntime());
        await runSyncEngine(
            baseInput({
                source: { a: 'Hello' },
                targets: { 'fr-FR': {} },
                runtime: tracked.runtime,
                runId: 'run_r0',
                requireReviewFor: [],
            })
        );
        expect(tracked.planned).toEqual(['fr-FR:u-a']);
    });

    it('review wins over force on the same key', async () => {
        // Run 1: translate, then hand-edit to MANUAL.
        const first = baseInput({ source: { a: 'Hello' }, targets: { 'fr-FR': {} }, runId: 'run_f1' });
        await runSyncEngine(first);
        const file = join(dir, 'fr-FR.json');
        writeFileSync(file, JSON.stringify({ a: 'Bonjour (hand)' }, null, 2), 'utf-8');
        const tracked = trackingRuntime(new StubRuntime());
        const result = await runSyncEngine(
            baseInput({
                source: { a: 'Hello' },
                targets: { 'fr-FR': { a: 'Bonjour (hand)' } },
                runtime: tracked.runtime,
                runId: 'run_f2',
                forceRegenerate: true,
                requireReviewFor: ['a'],
            })
        );
        expect(isRunResult(result)).toBe(true);
        if (!isRunResult(result)) throw new Error('unreachable');
        expect(tracked.planned).toEqual([]);
        expect(result.skipped.needsReview).toBe(1);
        expect(readRegistry({ registryDir: join(dir, '.translatron') }).revisions.some((r) => r.origin === 'human')).toBe(false);
    });
});

describe('review-routing: stale-review policy (R-T002/US2)', () => {
    it('source-changed unit derives NEEDS_REVIEW with zero worker calls and no revision', async () => {
        await runSyncEngine(baseInput({ source: { a: 'Hello' }, targets: { 'fr-FR': {} }, runId: 'run_s1' }));
        const tracked = trackingRuntime(new StubRuntime());
        const before = readRegistry({ registryDir: join(dir, '.translatron') }).revisions.length;
        const result = await runSyncEngine(
            baseInput({
                source: { a: 'Hello, changed' },
                targets: { 'fr-FR': { a: '[fr-FR] Hello' } },
                runtime: tracked.runtime,
                runId: 'run_s2',
                policies: { removal: 'remove', stale: 'review' },
            })
        );
        expect(isRunResult(result)).toBe(true);
        if (!isRunResult(result)) throw new Error('unreachable');
        expect(tracked.planned).toEqual([]);
        expect(result.skipped.needsReview).toBe(1);
        expect(readRegistry({ registryDir: join(dir, '.translatron') }).revisions.length).toBe(before);
    });
});

describe('review-routing: config surface (R-T001)', () => {
    function legacyBase() {
        return {
            sourceLanguage: 'en-GB',
            targetLanguages: [{ language: 'French', shortCode: 'fr' }],
            extractors: [{ type: 'json', pattern: './locales/en.json' }],
            providers: [{ name: 'main', type: 'openai', model: 'gpt-5' }],
        };
    }

    it('reviewKeys defaults to [] and parses when set', () => {
        const absent = safeValidateConfig(legacyBase());
        expect(absent.success).toBe(true);
        if (absent.success) expect(absent.data.policies).toBeUndefined();
        const present = safeValidateConfig({ ...legacyBase(), policies: { reviewKeys: ['legal.*'] } });
        expect(present.success).toBe(true);
        if (present.success) {
            expect(present.data.policies?.reviewKeys).toEqual(['legal.*']);
            expect(present.data.policies?.removal).toBe('remove');
        }
    });
});
