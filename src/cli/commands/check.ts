/**
 * Deterministic translation check (Epic 010, H4/CLI-01; orphans Epic 013).
 *
 * Pure function over source + target catalogs: missing keys, orphaned
 * (extra) target keys, empty targets, and Epic 006 validator failures
 * (placeholders always; ICU/markup when the source uses them). No LLM, no
 * network, no writes — safe as a CI gate.
 * Exit code: 0 when clean, 1 when error-level issues are found.
 */
import type { SourceUnit } from '../../core/domain.js';
import { findTargetOnlyKeys } from '../../core/coverage.js';
import { containsIcu, validateIcu } from '../../validation/icu.js';
import { extractTagNames, validateMarkup } from '../../validation/markup.js';
import { validatePlaceholders } from '../../validation/placeholders.js';
import { deriveState } from '../../core/reconciler.js';
import type { TranslationRevision } from '../../core/domain.js';
import { computeHash } from '../../utils/hash.js';

export const CHECK_EXIT_CLEAN = 0;
export const CHECK_EXIT_ISSUES = 1;

export type CheckIssueKind = 'missing' | 'empty' | 'placeholder' | 'icu' | 'markup' | 'orphan' | 'source-stale' | 'skill-stale' | 'context-stale';

export type OrphanSeverity = 'error' | 'warn';

export interface CheckIssue {
    keyPath: string;
    locale: string;
    kind: CheckIssueKind;
    message: string;
}

export interface CheckInput {
    sourceLocale: string;
    sourceUnits: SourceUnit[];
    targets: Array<{ locale: string; entries: Record<string, string> }>;
    /** Exception globs exempt from orphan reporting (config `catalogs.targetOnly`). */
    targetOnly?: string[];
    /** Orphan severity; default `error`. Config knob deferred to config-v3. */
    orphanSeverity?: OrphanSeverity;
    /** Skip provenance-dependent stale checks while retaining catalog checks. */
    catalogsOnly?: boolean;
    /** Registry state enables provenance-dependent stale checks. */
    revisions?: TranslationRevision[];
    currentSkills?: Map<string, Map<string, string>>;
}

export interface CheckResult {
    sourceLocale: string;
    issues: CheckIssue[];
    /** Warn-level findings: reported, never fail the gate. */
    warnings: CheckIssue[];
    checkedKeys: number;
    failed: boolean;
}

/** Validate every source key in every target catalog. Deterministic. */
export function runCheck(input: CheckInput): CheckResult {
    const issues: CheckIssue[] = [];
    const warnings: CheckIssue[] = [];
    const locales = input.targets.map((target) => target.locale).sort();
    const entriesByLocale = new Map(input.targets.map((target) => [target.locale, target.entries]));
    const revisionsByIdentity = new Map<string, TranslationRevision[]>();
    for (const revision of input.revisions ?? []) {
        if (revision.catalogId !== 'main' || revision.sourceLocale !== input.sourceLocale) continue;
        const identity = `${revision.targetLocale}\0${revision.keyPath}`;
        const list = revisionsByIdentity.get(identity) ?? [];
        list.push(revision);
        revisionsByIdentity.set(identity, list);
    }
    for (const unit of input.sourceUnits) {
        for (const locale of locales) {
            const text = entriesByLocale.get(locale)?.[unit.keyPath];
            const revisions = revisionsByIdentity.get(`${locale}\0${unit.keyPath}`) ?? [];
            if (text === undefined) {
                issues.push({ keyPath: unit.keyPath, locale, kind: 'missing', message: 'MISSING' });
                continue;
            }
            if (!input.catalogsOnly && revisions.length > 0) {
                const state = deriveState({
                    identity: { catalogId: 'main', keyPath: unit.keyPath, sourceLocale: input.sourceLocale, targetLocale: locale },
                    sourceUnit: unit,
                    currentTargetHash: computeHash(text),
                    revisions,
                    currentSkills: input.currentSkills?.get(locale) ?? new Map(),
                    skillsAvailable: input.currentSkills !== undefined,
                    currentContextFingerprint: unit.context === undefined ? undefined : computeHash(unit.context),
                    isFailed: false,
                    isConflict: false,
                    needsReview: false,
                });
                const staleKind = state === 'SOURCE_STALE' ? 'source-stale' : state === 'SKILL_STALE' ? 'skill-stale' : state === 'CONTEXT_STALE' ? 'context-stale' : undefined;
                if (staleKind !== undefined) issues.push({ keyPath: unit.keyPath, locale, kind: staleKind, message: state });
            }
            if (text.trim() === '' && unit.sourceText.trim() !== '') {
                issues.push({ keyPath: unit.keyPath, locale, kind: 'empty', message: 'empty translation' });
                continue;
            }
            for (const error of validatePlaceholders({ sourceText: unit.sourceText, translatedText: text, keyPath: unit.keyPath })) {
                issues.push({ keyPath: unit.keyPath, locale, kind: 'placeholder', message: error.message });
            }
            if (containsIcu(unit.sourceText) || containsIcu(text)) {
                for (const error of validateIcu({ sourceText: unit.sourceText, translatedText: text, keyPath: unit.keyPath })) {
                    issues.push({ keyPath: unit.keyPath, locale, kind: 'icu', message: error.message });
                }
            }
            if (extractTagNames(unit.sourceText).length > 0) {
                for (const error of validateMarkup({ sourceText: unit.sourceText, translatedText: text, keyPath: unit.keyPath })) {
                    issues.push({ keyPath: unit.keyPath, locale, kind: 'markup', message: error.message });
                }
            }
        }
    }
    // Orphaned target keys: present in targets, absent from source, unexcepted.
    // Catalog checks run regardless of this flag; only stale-state checks above are skipped.
    void input.catalogsOnly;
    const orphans = findTargetOnlyKeys({
        sourceUnits: input.sourceUnits,
        targets: input.targets,
        ...(input.targetOnly !== undefined ? { except: input.targetOnly } : {}),
    });
    const orphanIssues = orphans.map((orphan) => ({
        keyPath: orphan.keyPath,
        locale: orphan.locale,
        kind: 'orphan' as const,
        message: 'ORPHANED',
    }));
    if ((input.orphanSeverity ?? 'error') === 'error') {
        issues.push(...orphanIssues);
    } else {
        warnings.push(...orphanIssues);
    }
    return {
        sourceLocale: input.sourceLocale,
        issues,
        warnings,
        checkedKeys: input.sourceUnits.length,
        failed: issues.length > 0,
    };
}

/** Key-grouped report in the R&D §34 shape, plus the §P6 orphan block. */
export function formatCheckReport(result: CheckResult, locales: string[]): string {
    const lines: string[] = [];
    const validationIssues = result.issues.filter((issue) => issue.kind !== 'orphan');
    const orphanErrors = result.issues.filter((issue) => issue.kind === 'orphan');
    if (!result.failed && result.warnings.length === 0) {
        return `All translations valid (${result.checkedKeys} keys × ${locales.length} locales)\n`;
    }
    if (validationIssues.length > 0) {
        lines.push('Translation validation failed', '');
        const byKey = new Map<string, CheckIssue[]>();
        for (const issue of validationIssues) {
            const list = byKey.get(issue.keyPath) ?? [];
            list.push(issue);
            byKey.set(issue.keyPath, list);
        }
        for (const keyPath of [...byKey.keys()].sort()) {
            lines.push(keyPath, '');
            const issues = byKey.get(keyPath) ?? [];
            const byLocale = new Map(issues.map((issue) => [issue.locale, issue]));
            for (const locale of [...locales].sort()) {
                const issue = byLocale.get(locale);
                lines.push(issue === undefined ? `  ${locale}   ✓` : `  ${locale}   ${issue.message}`);
            }
            lines.push('');
        }
    }
    if (orphanErrors.length > 0) {
        orphanBlock(lines, orphanErrors, result.sourceLocale, false);
    }
    if (result.warnings.length > 0) {
        orphanBlock(lines, result.warnings, result.sourceLocale, true);
    }
    lines.push(`${result.issues.length} issue${result.issues.length === 1 ? '' : 's'}\n`);
    return lines.join('\n');
}

/** P6 orphan block: per-key affected locales, source-locale trailer, sync hint. */
function orphanBlock(lines: string[], issues: CheckIssue[], sourceLocale: string, isWarning: boolean): void {
    lines.push(
        isWarning ? 'Orphaned translation keys detected (warnings, not failing)' : 'Orphaned translation keys detected',
        ''
    );
    const byKey = new Map<string, CheckIssue[]>();
    for (const issue of issues) {
        const list = byKey.get(issue.keyPath) ?? [];
        list.push(issue);
        byKey.set(issue.keyPath, list);
    }
    const keyPaths = [...byKey.keys()].sort();
    for (const keyPath of keyPaths) {
        lines.push(keyPath, '');
        const keyIssues = [...(byKey.get(keyPath) ?? [])].sort((a, b) => (a.locale < b.locale ? -1 : 1));
        for (const issue of keyIssues) {
            lines.push(`  ${issue.locale}   ${issue.message}`);
        }
        lines.push('');
    }
    lines.push(
        keyPaths.length === 1
            ? `Source key no longer exists in ${sourceLocale}.`
            : `Source keys no longer exist in ${sourceLocale}.`,
        'Run:',
        '  translatronx sync',
        ''
    );
}
