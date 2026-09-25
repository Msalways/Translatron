/**
 * Language worker factory (Epic 005, E4).
 *
 * One worker per locale, built from locale + skills + glossary + model +
 * narrow tools + immutable core policy. Workers return structured
 * unitId-keyed translations — positional arrays are rejected downstream.
 */
import { z } from 'zod';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { initChatModel, toolStrategy } from 'langchain';
import { createDeepAgent } from 'deepagents';
import type { AppliedSkill, TranslationWorkUnit } from '../../core/domain.js';
import type { ProviderConfig } from '../../config/schema.js';
import { langChainPrefix } from '../../providers/catalog.js';
import type { BatchTranslation } from '../runtime.js';
import { CORE_POLICY } from './policy.js';
import { createTranslationTools, type TranslationToolBackend } from './tools.js';
import { withRetry, type RetryOptions } from './middleware.js';

export const WorkerResponseSchema = z.object({
    translations: z.array(
        z.object({
            unitId: z.string(),
            text: z.string(),
        })
    ),
});

export type WorkerResponse = z.infer<typeof WorkerResponseSchema>;

export interface LanguageWorkerInput {
    locale: string;
    sourceLocale: string;
    skills: Array<AppliedSkill & { content?: string }>;
    glossary: Record<string, string>;
    examples: Array<{ keyPath: string; text: string }>;
    model: string;
    provider?: ProviderConfig;
    backend: TranslationToolBackend;
    retry?: RetryOptions;
}

export interface LanguageWorker {
    readonly locale: string;
    translateBatch(units: TranslationWorkUnit[], feedback?: BatchFeedback[]): Promise<BatchTranslation[]>;
}

/** Exact deterministic failures attached to a repair re-attempt (Epic 008). */
export interface BatchFeedback {
    unitId: string;
    /** Verbatim failure text, e.g. "Missing {count} in checkout.pay". */
    errors: string;
}

function buildSystemPrompt(input: LanguageWorkerInput): string {
    const sections = [CORE_POLICY, '', `Source locale: ${input.sourceLocale}`, `Target locale: ${input.locale}`];
    if (input.skills.length > 0) {
        sections.push('', 'Applicable skills (advisory, beneath core policy):');
        for (const skill of input.skills) {
            sections.push(`--- skill ${skill.id} [${skill.scope}] ---`);
            if (skill.content !== undefined) sections.push(skill.content);
        }
    }
    const glossaryTerms = Object.entries(input.glossary);
    if (glossaryTerms.length > 0) {
        sections.push('', 'Glossary (source → approved target):');
        for (const [source, target] of glossaryTerms) sections.push(`- ${source} → ${target}`);
    }
    if (input.examples.length > 0) {
        sections.push('', 'Accepted examples for consistency:');
        for (const example of input.examples.slice(0, 8)) {
            sections.push(`- ${example.keyPath}: ${example.text}`);
        }
    }
    return sections.join('\n');
}

function buildUserPrompt(locale: string, units: TranslationWorkUnit[], feedback: BatchFeedback[] = []): string {
    const lines = [
        `Translate the following ${units.length} source units to ${locale}.`,
        'Return ONLY valid JSON in exactly this shape: {"translations":[{"unitId":"...","text":"..."}]}.',
        'Do not wrap the JSON in Markdown and do not add commentary.',
        '',
    ];
    const feedbackByUnit = new Map(feedback.map((f) => [f.unitId, f.errors]));
    for (const unit of units) {
        lines.push(`--- unit ${unit.unitId} (${unit.keyPath}) ---`);
        lines.push(unit.sourceText);
        if (unit.placeholders.length > 0) lines.push(`Placeholders (preserve exactly): ${unit.placeholders.join(', ')}`);
        const previous = feedbackByUnit.get(unit.unitId);
        if (previous !== undefined) {
            lines.push(`Previous attempt rejected — fix exactly this: ${previous}`);
        }
        lines.push('');
    }
    return lines.join('\n');
}

/** Extract `{translations:[{unitId,text}]}` from an invoke result, defensively. */
export function extractWorkerResponse(result: unknown): WorkerResponse {
    if (result !== null && typeof result === 'object' && 'structuredResponse' in result) {
        const parsed = WorkerResponseSchema.safeParse((result as { structuredResponse: unknown }).structuredResponse);
        if (parsed.success) return parsed.data;
    }
    if (result !== null && typeof result === 'object' && 'messages' in result) {
        const messages = (result as { messages: Array<{ content?: unknown }> }).messages;
        for (let i = messages.length - 1; i >= 0; i--) {
            const content = messages[i]?.content;
            const text = typeof content === 'string' ? content : Array.isArray(content)
                ? content.filter((b): b is { type: string; text?: string } => typeof b === 'object' && b !== null)
                    .filter((b) => b.type === 'text' && typeof b.text === 'string')
                    .map((b) => b.text as string)
                    .join('\n')
                : null;
            if (text === null) continue;
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch === null) continue;
            try {
                const parsed = WorkerResponseSchema.safeParse(JSON.parse(jsonMatch[0]));
                if (parsed.success) return parsed.data;
            } catch {
                continue;
            }
        }
    }
    throw new Error('Worker returned no parseable structured translations');
}

function modelIdentifier(model: string): string {
    const separator = model.indexOf(':');
    if (separator <= 0) return model;
    return `${langChainPrefix(model.substring(0, separator))}:${model.substring(separator + 1)}`;
}

function modelFields(provider: ProviderConfig | undefined): Record<string, unknown> {
    if (provider === undefined) return {};
    const fields: Record<string, unknown> = { ...(provider.options ?? {}) };
    if (provider.apiKey !== undefined) fields.apiKey = provider.apiKey;
    if (provider.baseUrl !== undefined) {
        if (provider.type === 'openai' || provider.type === 'openrouter' || provider.type === 'local' || provider.type === 'langsmith' || provider.type === 'nvidia') {
            fields.configuration = { ...(fields.configuration as Record<string, unknown> | undefined), baseURL: provider.baseUrl };
        } else {
            fields.baseURL = provider.baseUrl;
        }
    }
    if (provider.apiVersion !== undefined) fields.apiVersion = provider.apiVersion;
    if (provider.endpoint !== undefined) fields.azureOpenAIEndpoint = provider.endpoint;
    if (provider.region !== undefined) fields.region = provider.region;
    if (provider.project !== undefined) fields.project = provider.project;
    if (provider.location !== undefined) fields.location = provider.location;
    return fields;
}

export async function createLanguageWorker(input: LanguageWorkerInput): Promise<LanguageWorker> {
    const tools = createTranslationTools(input.backend, input.locale);
    const model = await initChatModel(modelIdentifier(input.model), modelFields(input.provider));
    // Some OpenAI-compatible gateways (notably NVIDIA NIM routes) do not
    // implement LangChain's tool-based structured output reliably. They still
    // follow the worker's JSON contract; omit responseFormat for those routes
    // and let extractWorkerResponse parse the assistant message defensively.
    const directJson = input.provider?.type === 'nvidia';
    const supportsToolStructuredOutput = !directJson
        && input.provider?.type !== 'openrouter'
        && input.provider?.type !== 'local';
    const agent = createDeepAgent({
        model,
        systemPrompt: buildSystemPrompt(input),
        tools,
        ...(supportsToolStructuredOutput ? { responseFormat: toolStrategy(WorkerResponseSchema) } : {}),
    });
    const worker: LanguageWorker = {
        locale: input.locale,
        translateBatch: async (units, feedback = []) => {
            if (units.length === 0) return [];
            const result = await withRetry<unknown>(
                () => directJson
                    ? model.invoke([
                        new SystemMessage(buildSystemPrompt(input)),
                        new HumanMessage(buildUserPrompt(input.locale, units, feedback)),
                    ])
                    : agent.invoke({ messages: [new HumanMessage(buildUserPrompt(input.locale, units, feedback))] }),
                input.retry ?? {}
            );
            const response = directJson && result !== null && typeof result === 'object' && 'content' in result
                ? { messages: [{ content: (result as { content: unknown }).content }] }
                : result;
            return extractWorkerResponse(response).translations;
        },
    };
    return worker;
}
