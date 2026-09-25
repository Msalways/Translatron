/**
 * Target-only key coverage (Epic 013 — key mismatch / missing keys on locales).
 *
 * Finds keys present in target catalogs but absent from the authoritative
 * source catalog (orphaned/extra keys). Pure and deterministic. This module
 * intentionally does NOT touch the reconciler loop: orphan visibility lives
 * here until the v3-compiler program, so `reconciled[]` semantics stay frozen.
 *
 * Returns listings only (`{ locale, keyPath }`, no source text, no
 * translatable payload) — orphaned values structurally cannot reach an LLM.
 */
import { matchesKeyPattern } from '../skills/resolver.js';
import type { SourceUnit } from './domain.js';

export interface OrphanListing {
    locale: string;
    keyPath: string;
}

export interface TargetEntries {
    locale: string;
    entries: Record<string, string>;
}

export interface FindOrphansInput {
    sourceUnits: SourceUnit[];
    targets: TargetEntries[];
    /** Exception globs (config `catalogs.targetOnly`); shared dialect with skills. */
    except?: string[];
}

/**
 * Target keys with no source counterpart and no exception match.
 * Stable order: locale sorted, then keyPath sorted (input-order independent).
 */
export function findTargetOnlyKeys(input: FindOrphansInput): OrphanListing[] {
    const sourceKeys = new Set(input.sourceUnits.map((unit) => unit.keyPath));
    const except = input.except ?? [];
    const orphans: OrphanListing[] = [];
    for (const target of [...input.targets].sort((a, b) => (a.locale < b.locale ? -1 : 1))) {
        for (const keyPath of Object.keys(target.entries).sort()) {
            if (sourceKeys.has(keyPath)) continue;
            if (except.some((pattern) => matchesKeyPattern(pattern, keyPath))) continue;
            orphans.push({ locale: target.locale, keyPath });
        }
    }
    return orphans;
}
