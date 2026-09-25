/**
 * Narrow translation tools for language workers (Epic 005).
 *
 * Workers receive exactly these six read-only tools. They MUST NOT receive
 * git/file-registry mutation, shell, or network tools — enforced by the
 * `TRANSLATION_TOOL_NAMES` allowlist asserted in tests.
 */
import { z } from 'zod';
import { tool } from '@langchain/core/tools';
import type { TranslationToolBackend } from '../runtime.js';

export type { TranslationToolBackend } from '../runtime.js';

export const TRANSLATION_TOOL_NAMES = [
    'lookup_translation_memory',
    'lookup_glossary',
    'get_key_context',
    'get_related_translations',
    'get_skill_resource',
    'request_clarification',
] as const;

export function createTranslationTools(backend: TranslationToolBackend, locale: string) {
    return [
        tool(
            ({ sourceHash }: { sourceHash: string }) =>
                JSON.stringify(backend.lookupMemory(sourceHash, locale)),
            {
                name: 'lookup_translation_memory',
                description: 'Look up accepted translations with the same source fingerprint. Returns JSON array.',
                schema: z.object({ sourceHash: z.string().describe('Source fingerprint to look up') }),
            }
        ),
        tool(
            ({ term }: { term: string }) =>
                backend.lookupGlossaryTerm(term, locale) ?? 'NO_ENTRY',
            {
                name: 'lookup_glossary',
                description: 'Look up the approved target term for a source term.',
                schema: z.object({ term: z.string().describe('Source term to look up') }),
            }
        ),
        tool(
            ({ keyPath }: { keyPath: string }) =>
                backend.getKeyContext(keyPath) ?? 'NO_CONTEXT',
            {
                name: 'get_key_context',
                description: 'Get developer-provided context for a translation key.',
                schema: z.object({ keyPath: z.string().describe('Key path to describe') }),
            }
        ),
        tool(
            ({ keyPath }: { keyPath: string }) =>
                JSON.stringify(backend.getRelatedTranslations(keyPath, locale).slice(0, 5)),
            {
                name: 'get_related_translations',
                description: 'Get up to 5 neighboring accepted translations for consistency.',
                schema: z.object({ keyPath: z.string().describe('Key path to find neighbors for') }),
            }
        ),
        tool(
            ({ skillId, resourcePath }: { skillId: string; resourcePath: string }) =>
                backend.getSkillResource(skillId, resourcePath) ?? 'NOT_FOUND',
            {
                name: 'get_skill_resource',
                description: 'Read a skill bundle resource (glossary.csv, examples.json, references/).',
                schema: z.object({
                    skillId: z.string().describe('Skill id from the worker prompt'),
                    resourcePath: z.string().describe('Resource path inside the skill bundle'),
                }),
            }
        ),
        tool(
            ({ question }: { question: string }) =>
                `Recorded for supervisor review: ${question}`,
            {
                name: 'request_clarification',
                description: 'Record an ambiguity for supervisor/human review. Does not block the batch.',
                schema: z.object({ question: z.string().describe('The ambiguity to record') }),
            }
        ),
    ];
}
