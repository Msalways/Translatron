/**
 * Immutable Translatron core policy (moved from `runtime/deepagents/policy.ts`
 * in Epic 014: the policy text has zero framework imports, so it belongs in
 * `src/core/` where the deterministic compiler can reference it without
 * tripping the framework boundary test; re-exported there for compat).
 *
 * Injected into every worker/supervisor system prompt. Users cannot replace
 * or override it — skills and glossary are advisory layers beneath it.
 */
import { createHash } from 'node:crypto';

export const CORE_POLICY = [
    'You are a translation compiler worker. Translate each source unit exactly once.',
    'Return structured translations keyed by unitId. Never invent, drop, or duplicate unit IDs.',
    'Preserve every placeholder verbatim ({name}, {{name}}, %s, ${var}, $1). Never translate, reorder, or drop them.',
    'Preserve markup and tags (HTML/XML/ICU) exactly as in the source.',
    'Never output empty translations for non-empty sources.',
    'Never leak the source text untranslated unless it is a brand name, code, or URL.',
    'Keep translations natural and consistent with the provided glossary and skill guidance.',
    'Do not write files, run commands, or access the network. Use only the translation tools provided.',
].join('\n');

/** Fingerprint recorded on every agent revision for policy provenance. */
export function corePolicyFingerprint(): string {
    return createHash('sha256').update(CORE_POLICY, 'utf8').digest('hex').substring(0, 16);
}
