/**
 * v3 sync engine (Epic 014).
 *
 * Deterministic orchestration of one synchronization run:
 *   reconcile → TM-first → plan → runtime.execute → validate →
 *   staged atomic write → revisions → one segment → report.
 *
 * The engine never calls an LLM itself; all linguistic work happens behind
 * the injected `TranslationRuntime`. Pure orchestration + provenance: every
 * decision is derived from files + registry + policy. No `deepagents` /
 * `@langchain` imports here — the boundary tests forbid them.
 */
import { computeHash } from '../utils/hash.js';
import {
    DEFAULT_EXECUTION_LIMITS,
    type ExecutionLimits,
    type ReconciledTranslation,
    type RunPolicy,
    type SourceUnit,
    type TargetSnapshot,
    type TranslationRevision,
    type TranslationWorkUnit,
} from './domain.js';
import { reconcile, latestRevision, scopedKey } from './reconciler.js';
import { buildRunPlan, type PlanLanguageInput } from './planner.js';
import { findTargetOnlyKeys } from './coverage.js';
import { adaptRuntimeEvent, deriveRunStatus, type TranslatronEvent } from './events.js';
import { corePolicyFingerprint } from './policy.js';
import type {
    BatchTranslation,
    LanguageSummary,
    LocaleMaterial,
    RuntimeContext,
    RuntimeEvent,
    TranslationRuntime,
    TranslationToolBackend,
} from '../runtime/runtime.js';
import { resolveLegacyProvider } from '../runtime/models.js';
import type { ProviderConfig } from '../config/schema.js';
import { TranslationMemory, type TmCandidate } from '../memory/translation-memory.js';
import { validateBatchOutput } from '../validation/batch.js';
import {
    currentSkillMap,
    fingerprintAppliedSet,
    glossaryForLocale,
    legacySkillToLoadedSkill,
    matchesKeyPattern,
    resolveSkillsForUnit,
    skillMaterialForLocale,
    skillsForLocale,
    createSkillResourceStore,
    type LoadedSkill,
} from '../skills/index.js';
import { toAppliedSkills } from '../skills/types.js';
import { GenericJsonAdapter } from '../catalogs/generic-json.js';
import { ensureRegistryHome } from '../registry/bootstrap.js';
import { writeSegment } from '../registry/writer.js';
import {
    buildAdoptionRevision,
    buildAgentRevision,
    buildHumanRevision,
    currentGitCommit,
    isAlreadyRecorded,
    revisionId,
} from '../registry/revisions.js';
import type { RemovalRecord } from '../registry/schema.js';


export interface EnginePolicies {
    removal: 'remove' | 'warn-only' | 'preserve';
    stale: 'translate' | 'preserve' | 'review';
}

export interface EngineInput {
    catalogId: string;
    sourceLocale: string;
    sourceUnits: SourceUnit[];
    /** Current file state per locale. */
    targets: TargetSnapshot[];
    /** Locale → catalog file path (for staged writes). */
    targetFiles: Record<string, string>;
    revisions: TranslationRevision[];
    skills: LoadedSkill[];
    /** Legacy v2 prompt fields, converted to a synthetic global skill. */
    legacyPrompts?: {
        systemPrompt?: string;
        userPrompt?: string[];
        customContext?: string;
        formatting?: string;
        brandVoice?: string;
        glossary?: Record<string, string>;
    };
    providers: ProviderConfig[];
    targetOnly?: string[];
    policies?: Partial<EnginePolicies>;
    forceRegenerate?: boolean;
    affectedBySkill?: string;
    dryRun?: boolean;
    conflictKeys?: Set<string>;
    needsReviewKeys?: Set<string>;
    /** Key globs routed to human review (Epic 016; resolved against source keys). */
    requireReviewFor?: string[];
    registryDir: string;
    projectDir: string;
    runtime: TranslationRuntime;
    /** Partial override merged over DEFAULT_EXECUTION_LIMITS (Epic 015). */
    limits?: Partial<ExecutionLimits>;
    runId?: string;
    createdAt?: string;
    maxUnitsPerBatch?: number;
    maxRepairAttempts?: number;
    adapter?: GenericJsonAdapter;
}

export interface EngineRunResult {
    runId: string;
    status: ReturnType<typeof deriveRunStatus>;
    summaries: LanguageSummary[];
    tmReused: number;
    filesUpdated: string[];
    segmentFile?: string;
    skipped: { conflicts: number; needsReview: number; preserved: number };
    /** Non-failing findings (currently: warn-only orphans). */
    warnings: string[];
    events: TranslatronEvent[];
}

export interface EngineDryRun {
    runId: string;
    plannedTranslations: number;
    plannedRemovals: number;
    tmReuses: number;
    languages: string[];
}

const STALE_REASONS = new Set(['source-changed', 'skill-stale', 'context-stale']);

function topSegment(keyPath: string): string {
    const dot = keyPath.indexOf('.');
    return dot < 0 ? keyPath : keyPath.substring(0, dot);
}

function glossaryHash(glossary: Record<string, string>): string {
    const sorted = Object.entries(glossary).sort(([a], [b]) => (a < b ? -1 : 1));
    return computeHash(JSON.stringify(sorted));
}

/** Chain-equality: same skill ids with identical fingerprints (review correction). */
function chainEquals(
    recorded: { id: string; fingerprint: string }[] | undefined,
    current: { id: string; fingerprint: string }[]
): boolean {
    const recordedList = recorded ?? [];
    if (recordedList.length !== current.length) return false;
    const currentById = new Map(current.map((s) => [s.id, s.fingerprint]));
    return recordedList.every((s) => currentById.get(s.id) === s.fingerprint);
}

function legacySkillFromPrompts(prompts: NonNullable<EngineInput['legacyPrompts']>): LoadedSkill | null {
    const lines: string[] = [];
    if (prompts.systemPrompt !== undefined) lines.push(prompts.systemPrompt);
    if (prompts.customContext !== undefined) lines.push(prompts.customContext);
    if (prompts.userPrompt !== undefined) lines.push(prompts.userPrompt.join('\n'));
    if (prompts.formatting !== undefined) lines.push(`Preferred formatting: ${prompts.formatting}.`);
    if (prompts.brandVoice !== undefined) lines.push(`Brand voice: ${prompts.brandVoice}.`);
    const glossary = prompts.glossary ?? {};
    if (lines.length === 0 && Object.keys(glossary).length === 0) return null;
    return legacySkillToLoadedSkill({ content: lines.join('\n'), glossary });
}

interface RunClock {
    runId: string;
    createdAt: string;
    gitCommit: string | null;
}

export async function runSyncEngine(input: EngineInput): Promise<EngineRunResult | EngineDryRun> {
    const runId = input.runId ?? `run_${Date.now()}`;
    const createdAt = input.createdAt ?? new Date().toISOString();
    const policies: EnginePolicies = {
        removal: input.policies?.removal ?? 'remove',
        stale: input.policies?.stale ?? 'translate',
    };
    const run: RunClock = { runId, createdAt, gitCommit: currentGitCommit(input.projectDir) };
    const events: TranslatronEvent[] = [];
    const emit = (event: TranslatronEvent): void => {
        events.push(event);
    };

    const allSkills = [...input.skills];
    const legacy = input.legacyPrompts !== undefined ? legacySkillFromPrompts(input.legacyPrompts) : null;
    if (legacy !== null) allSkills.unshift(legacy);

    const tm = new TranslationMemory(input.revisions);
    const revisionsByIdentity = new Map<string, TranslationRevision[]>();
    for (const rev of input.revisions) {
        const key = `${rev.catalogId}${rev.sourceLocale}${rev.targetLocale}${rev.keyPath}`;
        const list = revisionsByIdentity.get(key);
        if (list === undefined) revisionsByIdentity.set(key, [rev]);
        else list.push(rev);
    }
    const identityRevisions = (locale: string, keyPath: string): TranslationRevision[] =>
        revisionsByIdentity.get(`${input.catalogId}${input.sourceLocale}${locale}${keyPath}`) ?? [];

    const snapshotText = (locale: string, keyPath: string): string | undefined =>
        input.targets.find((t) => t.locale === locale)?.entries[keyPath]?.text;
    const unitByKey = new Map(input.sourceUnits.map((u) => [u.keyPath, u]));
    const glossaryByLocale = new Map<string, Record<string, string>>();
    const glossaryFpByLocale = new Map<string, string>();
    for (const target of input.targets) {
        const merged = glossaryForLocale(allSkills, target.locale);
        glossaryByLocale.set(target.locale, merged);
        glossaryFpByLocale.set(target.locale, glossaryHash(merged));
    }
    const chainFor = (locale: string, keyPath: string) =>
        resolveSkillsForUnit(allSkills, { locale, keyPath, catalogId: input.catalogId });

    // --- 1. Reconcile per locale (locale-specific skill maps) ---
    const locales = input.targets.map((t) => t.locale);
    emit({ kind: 'run-started', runId, languages: locales });
    const translationWork = new Map<string, TranslationWorkUnit[]>();
    const enrichedIndex = new Map<string, TranslationWorkUnit>();
    const reuseTranslations = new Map<string, BatchTranslation[]>();
    const reuseKeys = new Map<string, string>();
    const reuseRevisions: TranslationRevision[] = [];
    const newRevisions: TranslationRevision[] = [];
    let tmReused = 0;
    const skipped = { conflicts: 0, needsReview: 0, preserved: 0 };
    const warnings: string[] = [];

    for (const target of input.targets) {
        const locale = target.locale;
        const routedKeys = new Set<string>();
        for (const unit of input.sourceUnits) {
            if ((input.requireReviewFor ?? []).some((pattern) => matchesKeyPattern(pattern, unit.keyPath))) {
                routedKeys.add(scopedKey(locale, unit.keyPath));
            }
        }
        const baseNeedsReview = new Set([...(input.needsReviewKeys ?? []), ...routedKeys]);
        const reconcileOnce = (needsReview: Set<string>) =>
            reconcile({
                sourceLocale: input.sourceLocale,
                catalogId: input.catalogId,
                sourceUnits: input.sourceUnits,
                targets: [target],
                revisions: input.revisions,
                currentSkills: currentSkillMap(allSkills, locale),
                ...(input.conflictKeys !== undefined ? { conflictKeys: input.conflictKeys } : {}),
                ...(needsReview.size > 0 ? { needsReviewKeys: needsReview } : {}),
            });
        let reconciled = reconcileOnce(baseNeedsReview).reconciled;
        // Stale-review policy: re-derive stale units as NEEDS_REVIEW through
        // the same pure machinery (no parallel skip-bucket).
        if (policies.stale === 'review') {
            const staleKeys = new Set<string>();
            for (const item of reconciled) {
                const reason = reasonFor(item);
                if (reason !== null && STALE_REASONS.has(reason)) {
                    staleKeys.add(scopedKey(locale, item.identity.keyPath));
                }
            }
            if (staleKeys.size > 0) {
                reconciled = reconcileOnce(new Set([...baseNeedsReview, ...staleKeys])).reconciled;
            }
        }
        const pending: TranslationWorkUnit[] = [];
        const reuse: BatchTranslation[] = [];

        for (const item of reconciled) {
            const unit = unitByKey.get(item.identity.keyPath);
            if (item.status === 'CONFLICT') {
                skipped.conflicts += 1;
                continue;
            }
            if (item.status === 'NEEDS_REVIEW') {
                skipped.needsReview += 1;
                continue;
            }
            if (item.status === 'CLEAN' || unit === undefined) continue;
            if (item.status === 'MANUAL') {
                if (input.forceRegenerate === true) {
                    const enriched = enrichUnit(unit, locale, chainFor, 'forced');
                    enrichedIndex.set(`${locale}${unit.unitId}`, enriched);
                    pending.push(enriched);
                } else {
                    publishObserved(item, unit, target, 'human', input, identityRevisions, newRevisions, run);
                }
                continue;
            }
            if (item.status === 'UNTRACKED') {
                publishObserved(item, unit, target, 'imported', input, identityRevisions, newRevisions, run);
                continue;
            }
            const reason = reasonFor(item);
            if (reason === null) continue;
            if (STALE_REASONS.has(reason) && policies.stale === 'preserve') {
                skipped.preserved += 1;
                continue;
            }
            if (input.affectedBySkill !== undefined && reason !== 'skill-stale') continue;
            const enriched = enrichUnit(unit, locale, chainFor, reason);
            enrichedIndex.set(`${locale}${unit.unitId}`, enriched);
            const reused = tryReuse(enriched, unit, locale, input, tm, snapshotText, chainFor, glossaryFpByLocale, run);
            if (reused !== null) {
                reuse.push(reused.translation);
                reuseKeys.set(`${locale}${enriched.unitId}`, unit.keyPath);
                reuseRevisions.push(reused.revision);
                tmReused += 1;
            } else {
                pending.push(enriched);
            }
        }
        translationWork.set(locale, pending);
        reuseTranslations.set(locale, reuse);
        emit({ kind: 'language-queued', locale });
    }

    // --- 2. Orphan removals (coverage, Epic 013) ---
    const orphanTargets = input.targets.map((t) => ({
        locale: t.locale,
        entries: Object.fromEntries(Object.entries(t.entries).map(([k, e]) => [k, e.text] as const)),
    }));
    const orphans = findTargetOnlyKeys({
        sourceUnits: input.sourceUnits,
        targets: orphanTargets,
        except: input.targetOnly ?? [],
    });
    if (policies.removal === 'warn-only') {
        for (const orphan of orphans) {
            warnings.push(`ORPHANED ${orphan.locale} ${orphan.keyPath}`);
        }
    }
    const removalsByLocale = new Map<string, string[]>();
    const removalRecords: RemovalRecord[] = [];
    const seenRemovalKeys = new Set<string>();
    if (policies.removal === 'remove') {
        for (const orphan of orphans) {
            const list = removalsByLocale.get(orphan.locale) ?? [];
            list.push(orphan.keyPath);
            removalsByLocale.set(orphan.locale, list);
            if (!seenRemovalKeys.has(orphan.keyPath)) {
                seenRemovalKeys.add(orphan.keyPath);
                const latest = latestRevision(input.revisions.filter((r) => r.keyPath === orphan.keyPath));
                removalRecords.push({
                    catalogId: input.catalogId,
                    keyPath: orphan.keyPath,
                    sourceLocale: input.sourceLocale,
                    previousSourceHash: latest?.sourceHash ?? 'unknown',
                    runId,
                    createdAt,
                });
            }
        }
    }

    const totalPlanned = [...translationWork.values()].reduce((n, units) => n + units.length, 0);
    emit({ kind: 'planning-completed', runId, totalUnits: totalPlanned, languages: locales });

    if (input.dryRun === true) {
        return {
            runId,
            plannedTranslations: totalPlanned,
            plannedRemovals: [...removalsByLocale.values()].reduce((n, keys) => n + keys.length, 0),
            tmReuses: tmReused,
            languages: locales,
        };
    }

    // --- 3. Plan + runtime (skipped entirely when no translation work) ---
    if (input.providers.length === 0) {
        throw new Error('runSyncEngine requires at least one provider (normalizeConfig guarantees this; direct callers must too).');
    }
    const resolved = resolveLegacyProvider(input.providers[0], input.providers);
    const adapter = input.adapter ?? new GenericJsonAdapter();
    const resourceStore = createSkillResourceStore(allSkills);
    const relatedFor = (locale: string, keyPath: string): Array<{ keyPath: string; text: string }> => {
        const top = topSegment(keyPath);
        const target = input.targets.find((t) => t.locale === locale);
        if (target === undefined) return [];
        return Object.entries(target.entries)
            .filter(([k]) => k !== keyPath && topSegment(k) === top)
            .slice(0, 5)
            .map(([k, e]) => ({ keyPath: k, text: e.text }));
    };
    const toolBackend: TranslationToolBackend = {
        lookupMemory: (sourceHash, locale) => {
            const hit = tm.lookup({ sourceHash, locale });
            if (hit === null) return [];
            const text = snapshotText(locale, hit.revision.keyPath);
            return text === undefined ? [] : [{ text, origin: hit.revision.origin }];
        },
        lookupGlossaryTerm: (term, locale) => glossaryByLocale.get(locale)?.[term] ?? null,
        getKeyContext: (keyPath) => unitByKey.get(keyPath)?.context ?? null,
        getRelatedTranslations: (keyPath, locale) => relatedFor(locale, keyPath),
        getSkillResource: (skillId, resourcePath) => resourceStore.getSkillResource(skillId, resourcePath),
    };
    const materials: LocaleMaterial[] = input.targets.map((t) => {
        const material = skillMaterialForLocale(allSkills, t.locale);
        const examples = tm
            .getExamples(t.locale, 5)
            .map((e) => ({ keyPath: e.revision.keyPath, text: snapshotText(t.locale, e.revision.keyPath) }))
            .filter((e): e is { keyPath: string; text: string } => e.text !== undefined);
        return { locale: t.locale, skills: material.skills, glossary: material.glossary, examples };
    });
    const context: RuntimeContext = {
        runId,
        sourceLocale: input.sourceLocale,
        model: resolved.model,
        provider: input.providers[0],
        fallbackModels: resolved.fallbackModels,
        materials,
        maxRepairAttempts: input.maxRepairAttempts ?? 2,
        toolBackend,
    };
    const languages: PlanLanguageInput[] = [];
    for (const target of input.targets) {
        const units = translationWork.get(target.locale) ?? [];
        if (units.length === 0) continue;
        languages.push({
            locale: target.locale,
            skills: toAppliedSkills(skillsForLocale(allSkills, target.locale)),
            glossaryFingerprint: glossaryFpByLocale.get(target.locale),
            units,
        });
    }
    const runPolicy: RunPolicy = {
        ...(input.forceRegenerate === true ? { forceRegenerate: true } : {}),
        ...(input.affectedBySkill !== undefined ? { affectedBySkill: input.affectedBySkill } : {}),
    };
    const plan = buildRunPlan({
        runId,
        languages,
        limits: { ...DEFAULT_EXECUTION_LIMITS, ...input.limits },
        policy: runPolicy,
        batching: { maxUnitsPerBatch: input.maxUnitsPerBatch ?? 20, maxTokensPerBatch: 8000 },
    });

    const collected = new Map<string, BatchTranslation[]>();
    const crashedLocales = new Set<string>();
    if (plan.languages.length > 0) {
        for await (const event of input.runtime.execute(plan, context)) {
            emit(adaptRuntimeEvent(event));
            const runtimeEvent: RuntimeEvent = event;
            if (runtimeEvent.type === 'batch-completed') {
                const list = collected.get(runtimeEvent.locale) ?? [];
                list.push(...runtimeEvent.translations);
                collected.set(runtimeEvent.locale, list);
            }
            if (runtimeEvent.type === 'language-failed') {
                crashedLocales.add(runtimeEvent.locale);
            }
        }
    }

    // --- 4. Validate runtime output (defense in depth; stubs bypass the graph) ---
    const acceptedRevisions: TranslationRevision[] = [...newRevisions, ...reuseRevisions];
    const filesUpdated: string[] = [];
    const summaries: LanguageSummary[] = [];
    const stagedWrites: Array<{ locale: string; filePath: string; set: Record<string, string>; remove: string[] }> = [];

    for (const target of input.targets) {
        const locale = target.locale;
        const units = translationWork.get(locale) ?? [];
        const reuse = reuseTranslations.get(locale) ?? [];
        const translations = collected.get(locale) ?? [];
        const failures = units.length > 0 ? validateBatchOutput(units, translations) : [];
        const failedIds = new Set(failures.map((f) => f.unitId));
        const accepted = translations.filter((t) => !failedIds.has(t.unitId));
        const failedCount =
            failures.length + (crashedLocales.has(locale) ? units.filter((u) => !failedIds.has(u.unitId)).length : 0);

        // Agent revisions for validated runtime output (parents chain to latest).
        const [provider, ...modelRest] = resolved.model.split(':');
        for (const translation of accepted) {
            const enriched = enrichedIndex.get(`${locale}${translation.unitId}`);
            const unit = enriched !== undefined ? unitByKey.get(enriched.keyPath) : undefined;
            if (enriched === undefined || unit === undefined) continue;
            const chain = chainFor(locale, unit.keyPath);
            acceptedRevisions.push(
                buildAgentRevision({
                    catalogId: input.catalogId,
                    keyPath: unit.keyPath,
                    sourceLocale: input.sourceLocale,
                    targetLocale: locale,
                    sourceHash: unit.sourceHash,
                    targetHash: computeHash(translation.text),
                    runId,
                    createdAt,
                    gitCommit: run.gitCommit,
                    model: modelRest.join(':'),
                    provider,
                    corePolicyFingerprint: corePolicyFingerprint(),
                    skillFingerprints: toAppliedSkills(chain),
                    glossaryFingerprint: glossaryFpByLocale.get(locale) ?? glossaryHash({}),
                    ...(enriched.contextFingerprint !== undefined
                        ? { contextFingerprint: enriched.contextFingerprint }
                        : {}),
                    previous: latestRevision(identityRevisions(locale, unit.keyPath)),
                })
            );
        }

        const setByKey: Record<string, string> = {};
        for (const translation of [...reuse, ...accepted]) {
            const enriched = enrichedIndex.get(`${locale}${translation.unitId}`);
            const keyPath = enriched?.keyPath ?? reuseKeys.get(`${locale}${translation.unitId}`);
            if (keyPath === undefined) continue;
            setByKey[keyPath] = translation.text;
        }
        const removes = removalsByLocale.get(locale) ?? [];
        const filePath = input.targetFiles[locale];
        if (filePath === undefined && (Object.keys(setByKey).length > 0 || removes.length > 0)) {
            // Staged work with nowhere to write would diverge files from
            // registry: fail loudly instead of publishing ghost revisions.
            throw new Error(`No target file configured for locale ${locale} with staged work.`);
        }
        if (filePath !== undefined && (Object.keys(setByKey).length > 0 || removes.length > 0)) {
            stagedWrites.push({ locale, filePath, set: setByKey, remove: removes });
        }
        const translated = reuse.length + accepted.length;
        if (translated > 0 || failedCount > 0 || removes.length > 0) {
            summaries.push({
                locale,
                status: failedCount > 0 ? 'failed' : 'complete',
                translated,
                failed: failedCount,
                batches: plan.languages.find((l) => l.locale === locale)?.batches.length ?? 0,
                // Repair/review counts are not exposed by runtime events;
                // per-unit repair visibility is a recorded runtime follow-up.
                repairs: 0,
                reviews: 0,
            });
        }
    }
    const status = deriveRunStatus(summaries);

    // --- 5. Staged write per locale (translations + removals, one cycle) ---
    for (const staged of stagedWrites) {
        await adapter.applyChanges(staged.filePath, {
            set: staged.set,
            ...(staged.remove.length > 0 ? { remove: staged.remove } : {}),
        });
        filesUpdated.push(staged.filePath);
        emit({ kind: 'catalog-written', locale: staged.locale, file: staged.filePath });
    }

    // --- 6. One segment per run (skip when nothing new) ---
    let segmentFile: string | undefined;
    if (acceptedRevisions.length > 0 || removalRecords.length > 0) {
        ensureRegistryHome(input.registryDir);
        const written = writeSegment({
            registryDir: input.registryDir,
            runId,
            revisions: acceptedRevisions,
            ...(removalRecords.length > 0 ? { removals: removalRecords } : {}),
            createdAt,
        });
        segmentFile = written.fileName;
        emit({ kind: 'registry-updated', segment: written.fileName, revisions: acceptedRevisions.length });
    }
    emit({ kind: 'run-completed', runId, status });

    return {
        runId,
        status,
        summaries,
        tmReused,
        filesUpdated,
        ...(segmentFile !== undefined ? { segmentFile } : {}),
        skipped,
        warnings,
        events,
    };
}

function enrichUnit(
    unit: SourceUnit,
    locale: string,
    chainFor: (locale: string, keyPath: string) => ReturnType<typeof resolveSkillsForUnit>,
    reason: TranslationWorkUnit['reason']
): TranslationWorkUnit {
    const chain = chainFor(locale, unit.keyPath);
    return {
        unitId: unit.unitId,
        keyPath: unit.keyPath,
        sourceText: unit.sourceText,
        placeholders: unit.placeholders,
        ...(unit.context !== undefined ? { contextFingerprint: computeHash(unit.context) } : {}),
        skillFingerprint: fingerprintAppliedSet(chain),
        reason,
    };
}

function reasonFor(item: ReconciledTranslation): TranslationWorkUnit['reason'] | null {
    switch (item.status) {
        case 'NEW':
            return 'new';
        case 'TARGET_DELETED':
            return 'target-deleted';
        case 'SOURCE_STALE':
            return 'source-changed';
        case 'SKILL_STALE':
            return 'skill-stale';
        case 'CONTEXT_STALE':
            return 'context-stale';
        case 'FAILED':
            return 'retry-failed';
        case 'NEEDS_REVIEW':
            return 'needs-review';
        default:
            return null;
    }
}

interface ReuseResult {
    translation: BatchTranslation;
    revision: TranslationRevision;
}

function tryReuse(
    enriched: TranslationWorkUnit,
    unit: SourceUnit,
    locale: string,
    input: EngineInput,
    tm: TranslationMemory,
    snapshotText: (locale: string, keyPath: string) => string | undefined,
    chainFor: (locale: string, keyPath: string) => ReturnType<typeof resolveSkillsForUnit>,
    glossaryFpByLocale: Map<string, string>,
    run: RunClock
): ReuseResult | null {
    const queryContext = enriched.contextFingerprint;
    // Best-first single lookup plus bounded same-hash examples (covers the
    // case where the top candidate's text is gone from current files).
    const pool: TmCandidate[] = [];
    const best = tm.lookup({
        sourceHash: unit.sourceHash,
        locale,
        ...(queryContext !== undefined ? { contextFingerprint: queryContext } : {}),
    });
    if (best !== null) pool.push(best);
    for (const example of tm.getExamples(locale, 5, unit.keyPath)) {
        if (example.revision.sourceHash === unit.sourceHash) pool.push(example);
    }
    const chain = chainFor(locale, unit.keyPath);
    const currentSkills = chain.map((s) => ({ id: s.id, fingerprint: s.fingerprint }));
    const seen = new Set<string>();
    for (const candidate of pool) {
        if (seen.has(candidate.revision.id)) continue;
        seen.add(candidate.revision.id);
        const text = snapshotText(locale, candidate.revision.keyPath);
        if (text === undefined) continue;
        if (!chainEquals(candidate.revision.skillFingerprints, currentSkills)) continue;
        const expectedGlossary = glossaryFpByLocale.get(locale) ?? glossaryHash({});
        const recordedGlossary = candidate.revision.glossaryFingerprint;
        if (recordedGlossary !== undefined ? recordedGlossary !== expectedGlossary : expectedGlossary !== glossaryHash({})) {
            continue;
        }
        const failures = validateBatchOutput([enriched], [{ unitId: enriched.unitId, text }]);
        if (failures.length > 0) continue;
        return {
            translation: { unitId: enriched.unitId, text },
            revision: {
                id: revisionId(run.runId, locale, unit.keyPath, unit.sourceHash, computeHash(text)),
                catalogId: input.catalogId,
                keyPath: unit.keyPath,
                sourceLocale: input.sourceLocale,
                targetLocale: locale,
                sourceHash: unit.sourceHash,
                targetHash: computeHash(text),
                origin: candidate.revision.origin,
                parentIds: [candidate.revision.id],
                ...(candidate.revision.model !== undefined ? { model: candidate.revision.model } : {}),
                ...(candidate.revision.provider !== undefined ? { provider: candidate.revision.provider } : {}),
                corePolicyFingerprint: corePolicyFingerprint(),
                skillFingerprints: toAppliedSkills(chain),
                glossaryFingerprint: expectedGlossary,
                ...(enriched.contextFingerprint !== undefined
                    ? { contextFingerprint: enriched.contextFingerprint }
                    : {}),
                runId: run.runId,
                createdAt: run.createdAt,
                gitCommit: run.gitCommit,
            },
        };
    }
    return null;
}

function publishObserved(
    item: ReconciledTranslation,
    unit: SourceUnit,
    target: TargetSnapshot,
    origin: 'human' | 'imported',
    input: EngineInput,
    identityRevisions: (locale: string, keyPath: string) => TranslationRevision[],
    out: TranslationRevision[],
    run: RunClock
): void {
    const entry = target.entries[unit.keyPath];
    if (entry === undefined) return;
    const history = identityRevisions(item.identity.targetLocale, unit.keyPath);
    if (isAlreadyRecorded(history, entry.targetHash)) return;
    const base = {
        catalogId: input.catalogId,
        keyPath: unit.keyPath,
        sourceLocale: input.sourceLocale,
        targetLocale: item.identity.targetLocale,
        sourceHash: unit.sourceHash,
        targetHash: entry.targetHash,
        runId: run.runId,
        createdAt: run.createdAt,
        gitCommit: run.gitCommit,
    };
    if (origin === 'human') {
        const previous = latestRevision(history.filter((r) => r.origin === 'agent'));
        if (previous === undefined) return;
        out.push(buildHumanRevision({ ...base, previousGeneratedId: previous.id }));
    } else {
        const previous = latestRevision(history);
        out.push(buildAdoptionRevision({ ...base, ...(previous !== undefined ? { previous } : {}) }));
    }
}
