/**
 * Legacy classification (Epic 004).
 *
 * Maps v2 ledger rows + actual catalog files to v3 origins. File truth always
 * wins over the ledger: a DB/file mismatch is reported and the file content
 * decides the classification. Missing sources get a stable placeholder hash
 * (documented, never empty — the revision schema requires non-empty hashes).
 *
 * Mapping (R&D Epic I2):
 *   MANUAL                    → human revision
 *   CLEAN + model fingerprint → agent revision
 *   CLEAN without model       → imported revision (unknown provenance)
 *   target exists, no row     → imported revision (unknown provenance)
 *   FAILED                    → failure metadata (no revision emitted)
 *   DIRTY/SKIPPED/other       → imported if a target exists, else missing
 */
import type { SourceUnit, TranslationRevision } from '../core/domain.js';
import { computeHash } from '../utils/hash.js';
import type { V2SyncStatus } from './v2-ledger.js';

export type LegacyClassification = 'agent' | 'human' | 'imported' | 'failed' | 'missing';

export interface TargetFile {
    locale: string;
    /** keyPath → current text in the target catalog. */
    entries: Record<string, string>;
}

export interface ClassifyInput {
    catalogId: string;
    sourceLocale: string;
    sourceUnits: SourceUnit[];
    sourceHashes: Map<string, string>;
    syncRows: V2SyncStatus[];
    targets: TargetFile[];
    migrationRunId: string;
    migratedAt: string;
}

export interface ClassifiedKey {
    keyPath: string;
    locale: string;
    classification: LegacyClassification;
    /** True when the ledger row disagreed with the file on disk. */
    dbFileMismatch: boolean;
    revision?: TranslationRevision;
}

export interface ClassificationResult {
    items: ClassifiedKey[];
    counts: Record<LegacyClassification, number>;
    mismatches: Array<{ keyPath: string; locale: string; detail: string }>;
}

function sourceHashFor(keyPath: string, sourceUnits: Map<string, SourceUnit>, sourceHashes: Map<string, string>): string {
    const unit = sourceUnits.get(keyPath);
    if (unit !== undefined) return unit.sourceHash;
    const stored = sourceHashes.get(keyPath);
    if (stored !== undefined && stored.length > 0) return stored;
    return computeHash(`missing-source:${keyPath}`);
}

export function classifyLegacy(input: ClassifyInput): ClassificationResult {
    const unitsByKey = new Map(input.sourceUnits.map((u) => [u.keyPath, u]));
    const rowsByScope = new Map(input.syncRows.map((r) => [`${r.langCode}${r.keyPath}`, r]));
    const items: ClassifiedKey[] = [];
    const counts: Record<LegacyClassification, number> = {
        agent: 0,
        human: 0,
        imported: 0,
        failed: 0,
        missing: 0,
    };
    const mismatches: ClassificationResult['mismatches'] = [];

    const locales = new Set<string>();
    for (const target of input.targets) locales.add(target.locale);
    for (const row of input.syncRows) locales.add(row.langCode);

    const keyPaths = new Set<string>([
        ...unitsByKey.keys(),
        ...input.targets.flatMap((t) => Object.keys(t.entries)),
        ...input.syncRows.map((r) => r.keyPath),
    ]);

    for (const locale of [...locales].sort()) {
        const target = input.targets.find((t) => t.locale === locale);
        for (const keyPath of [...keyPaths].sort()) {
            const text = target?.entries[keyPath];
            const row = rowsByScope.get(`${locale}${keyPath}`);
            const hasTarget = text !== undefined;

            let classification: LegacyClassification;
            let mismatch = false;
            let detail = '';

            if (row?.status === 'MANUAL') {
                classification = 'human';
                if (hasTarget && row.targetHash !== null && computeHash(text) !== row.targetHash) {
                    // Edited again after being marked manual — still human-owned.
                    mismatch = true;
                    detail = 'target changed after MANUAL mark; file truth kept as human';
                } else if (!hasTarget) {
                    mismatch = true;
                    detail = 'MANUAL row but target entry missing; no revision emitted';
                    classification = 'missing';
                }
            } else if (row?.status === 'FAILED') {
                classification = 'failed';
            } else if (row !== undefined && (row.status === 'CLEAN' || row.status === 'DIRTY' || row.status === 'SKIPPED')) {
                if (!hasTarget) {
                    mismatch = true;
                    detail = `ledger says ${row.status} but target entry missing`;
                    classification = 'missing';
                } else if (row.targetHash !== null && computeHash(text) !== row.targetHash) {
                    // File truth wins: someone edited outside the ledger.
                    mismatch = true;
                    detail = `ledger ${row.status} hash differs from file; file truth kept as human`;
                    classification = 'human';
                } else {
                    classification = row.modelFingerprint !== null && row.modelFingerprint.length > 0 ? 'agent' : 'imported';
                }
            } else if (hasTarget) {
                classification = 'imported';
            } else {
                classification = 'missing';
            }

            if (mismatch) mismatches.push({ keyPath, locale, detail });

            let revision: TranslationRevision | undefined;
            if ((classification === 'agent' || classification === 'human' || classification === 'imported') && hasTarget) {
                revision = {
                    id: `mig-${input.migrationRunId}-${locale}-${unitsByKey.get(keyPath)?.unitId ?? computeHash(keyPath).substring(0, 8)}`,
                    catalogId: input.catalogId,
                    keyPath,
                    sourceLocale: input.sourceLocale,
                    targetLocale: locale,
                    sourceHash: sourceHashFor(keyPath, unitsByKey, input.sourceHashes),
                    targetHash: computeHash(text as string),
                    origin: classification,
                    parentIds: [],
                    ...(row?.modelFingerprint ? { model: row.modelFingerprint } : {}),
                    runId: input.migrationRunId,
                    createdAt: input.migratedAt,
                };
            }

            counts[classification] += 1;
            items.push({ keyPath, locale, classification, dbFileMismatch: mismatch, revision });
        }
    }

    return { items, counts, mismatches };
}
