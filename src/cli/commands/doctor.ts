/**
 * Readiness checks (Epic 010, H5).
 *
 * Pure evaluation of collected project facts: config, catalogs, provider
 * credentials, registry readability, skills, and CI compatibility.
 * Collection (filesystem, env, git) lives in the command; this module
 * decides pass/warn/fail and renders the readiness report.
 */
import { matchesKeyPattern } from '../../skills/resolver.js';
export type DoctorSeverity = 'pass' | 'warn' | 'fail';

export interface DoctorCheck {
    name: string;
    severity: DoctorSeverity;
    detail: string[];
}

export interface DoctorInput {
    configValid: boolean;
    configError?: string;
    sourceFiles: string[];
    targets: Array<{ locale: string; found: boolean; path: string }>;
    credentials: Array<{ provider: string; present: boolean; hint: string }>;
    registryPresent: boolean;
    registryReadable: boolean;
    registryDetail: string;
    skills: Array<{ id: string; scope: string; locales: string[] }>;
    skillWarnings: string[];
    targetLocales: string[];
    /** Source key paths for glob coverage checks (Epic 018; absent = skip silently). */
    sourceKeys?: string[];
    /** Key globs that should match ≥1 source key; zero-matches warn by name. */
    reviewGlobs?: string[];
    /** Target-only exception globs; zero-matches warn by name. */
    targetOnlyGlobs?: string[];
}

export interface DoctorResult {
    checks: DoctorCheck[];
    ready: boolean;
}

/** Evaluate readiness facts. Ready requires zero failures (warnings allowed). */
export function runDoctor(input: DoctorInput): DoctorResult {
    const checks: DoctorCheck[] = [];

    if (!input.configValid) {
        checks.push({
            name: 'Configuration',
            severity: 'fail',
            detail: [input.configError ?? 'Invalid configuration.'],
        });
        return { checks, ready: false };
    }
    checks.push({ name: 'Configuration', severity: 'pass', detail: ['translatronx config is valid'] });

    if (input.sourceFiles.length === 0) {
        checks.push({ name: 'Source catalog', severity: 'fail', detail: ['No source catalog detected.'] });
    } else {
        checks.push({
            name: 'Source catalog detected',
            severity: 'pass',
            detail: input.sourceFiles.slice(0, 5),
        });
    }

    const foundTargets = input.targets.filter((target) => target.found);
    if (foundTargets.length === 0) {
        checks.push({ name: 'Target catalogs', severity: 'fail', detail: ['No target catalogs detected.'] });
    } else {
        checks.push({
            name: `${foundTargets.length} target catalog${foundTargets.length === 1 ? '' : 's'} detected`,
            severity: 'pass',
            detail: [],
        });
    }
    for (const target of input.targets.filter((target) => !target.found)) {
        checks.push({
            name: `Target catalog missing for ${target.locale}`,
            severity: 'warn',
            detail: [`Expected at ${target.path}; it will be created on first sync.`],
        });
    }

    const missing = input.credentials.filter((credential) => !credential.present);
    if (missing.length > 0) {
        checks.push({
            name: 'Provider credentials',
            severity: 'fail',
            detail: missing.map((credential) => `${credential.provider}: ${credential.hint}`),
        });
    } else {
        checks.push({ name: 'Provider credentials found', severity: 'pass', detail: [] });
    }

    if (!input.registryPresent) {
        checks.push({
            name: 'Registry',
            severity: 'warn',
            detail: ['No v3 registry found. Run `translatronx migrate` for v2 projects.'],
        });
    } else if (!input.registryReadable) {
        checks.push({ name: 'Registry', severity: 'fail', detail: [input.registryDetail] });
    } else {
        checks.push({ name: 'Registry readable', severity: 'pass', detail: [input.registryDetail] });
    }

    if (input.skills.length === 0) {
        checks.push({
            name: 'Skills',
            severity: 'warn',
            detail: ['No project skills. This is optional; core policy applies alone.', ...input.skillWarnings],
        });
    } else {
        checks.push({
            name: `${input.skills.length} project skill${input.skills.length === 1 ? '' : 's'}`,
            severity: 'pass',
            detail: [],
        });
        const languageSkills = input.skills.filter((skill) => skill.scope === 'language');
        for (const skill of languageSkills) {
            const locales = skill.locales.length > 0 ? skill.locales.join(', ') : 'all locales';
            checks.push({ name: `${skill.id} language skill (${locales})`, severity: 'pass', detail: [] });
        }
        const uncovered = input.targetLocales.filter(
            (locale) => !languageSkills.some((skill) => skill.locales.length === 0 || skill.locales.includes(locale))
        );
        for (const locale of uncovered) {
            checks.push({
                name: `${locale} has no language-specific skill`,
                severity: 'warn',
                detail: ['This is optional.'],
            });
        }
        for (const warning of input.skillWarnings) {
            checks.push({ name: 'Skill warning', severity: 'warn', detail: [warning] });
        }
    }

    // Glob coverage (Epic 018): patterns matching zero source keys warn by
    // name. Skipped silently on empty projects (no noise) or absent inputs.
    if ((input.sourceKeys ?? []).length > 0) {
        const globGroups: Array<{ label: string; patterns: string[] | undefined }> = [
            { label: 'reviewKeys', patterns: input.reviewGlobs },
            { label: 'targetOnly', patterns: input.targetOnlyGlobs },
        ];
        for (const group of globGroups) {
            for (const pattern of group.patterns ?? []) {
                if (!(input.sourceKeys ?? []).some((key) => matchesKeyPattern(pattern, key))) {
                    checks.push({
                        name: `Glob matches no source keys (${group.label})`,
                        severity: 'warn',
                        detail: [`  Pattern "${pattern}" matches 0 of ${input.sourceKeys?.length ?? 0} source keys.`],
                    });
                }
            }
        }
    }

    const ready = !checks.some((check) => check.severity === 'fail');
    checks.push(
        ready
            ? { name: 'CI-compatible configuration', severity: 'pass', detail: [] }
            : { name: 'CI-compatible configuration', severity: 'fail', detail: ['Resolve failing checks above.'] }
    );

    return { checks, ready: checks.every((check) => check.severity !== 'fail') };
}

/** Render the R&D §33 report. */
export function formatDoctorReport(result: DoctorResult): string {
    const lines = ['Project', ''];
    for (const check of result.checks) {
        const icon = check.severity === 'pass' ? '✓' : check.severity === 'warn' ? '!' : '✗';
        lines.push(`${icon} ${check.name}`);
        for (const detail of check.detail) lines.push(`  ${detail}`);
        lines.push('');
    }
    lines.push(result.ready ? 'Ready.' : 'Not ready.');
    lines.push('');
    return lines.join('\n');
}
