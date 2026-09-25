/**
 * Skill fingerprinting (Epic 009, D5).
 *
 * sha256 over normalized document content plus sorted bundle resources.
 * Same bytes → same hash; any byte change (doc or resource, added or
 * removed) → new hash. Fingerprints flow into revision provenance and the
 * reconciler's SKILL_STALE comparison — never into file writes.
 */
import { createHash } from 'node:crypto';

/** Normalize Markdown for hashing: NFC, LF endings, trimmed line ends, single trailing newline. */
export function normalizeSkillContent(content: string): string {
    return (
        content
            .normalize('NFC')
            .replace(/\r\n/g, '\n')
            .split('\n')
            .map((line) => line.trimEnd())
            .join('\n')
            .trim() + '\n'
    );
}

/** Fingerprint one skill from its normalized doc + sorted resources. */
export function fingerprintSkill(content: string, resources: Map<string, string> | Record<string, string>): string {
    const entries =
        resources instanceof Map ? [...resources.entries()] : Object.entries(resources);
    const body = [
        `doc:${normalizeSkillContent(content)}`,
        ...entries
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([path, text]) => `resource:${path}:${normalizeSkillContent(text)}`),
    ].join('\n');
    return createHash('sha256').update(body, 'utf8').digest('hex');
}

/** Combined fingerprint of an applied skill set (order-independent). */
export function fingerprintSkillSet(fingerprints: string[]): string {
    return createHash('sha256')
        .update([...fingerprints].sort().join('\n'), 'utf8')
        .digest('hex');
}
