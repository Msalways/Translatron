import OpenAI from 'openai';
import { BaseLLMProvider } from './base-provider';
import { type TranslationBatch, type TranslationResult, type PromptTemplate } from '../types/index';

/**
 * OpenAI provider implementation
 */
export class OpenAIProvider extends BaseLLMProvider {
    private client: OpenAI;

    constructor(config: {
        apiKey: string;
        model: string;
        temperature?: number;
        maxRetries?: number;
        baseUrl?: string;
    }) {
        super(config);
        this.client = new OpenAI({
            apiKey: config.apiKey,
            baseURL: config.baseUrl,
        });
    }

    async translate(batch: TranslationBatch, prompt: PromptTemplate): Promise<TranslationResult[]> {
        return this.retryWithBackoff(async () => {
            const userPrompt = this.buildTranslationPrompt(batch);

            const response = await this.client.chat.completions.create({
                model: this.config.model,
                temperature: this.temperature,
                messages: [
                    { role: 'system', content: prompt.system },
                    { role: 'user', content: userPrompt },
                ],
                response_format: { type: 'json_object' },
            });

            const content = response.choices[0]?.message?.content || '[]';

            // Extract JSON array from response
            const jsonMatch = content.match(/\[[\s\S]*\]/);
            const jsonString = jsonMatch ? jsonMatch[0] : content;

            return this.parseTranslationResponse(batch, jsonString);
        });
    }

    getModelFingerprint(): string {
        return `openai:${this.config.model}`;
    }

    estimateCost(batch: TranslationBatch): number {
        // OpenAI GPT-4 pricing (approximate)
        // Input: $0.03 per 1K tokens, Output: $0.06 per 1K tokens
        const avgCharsPerUnit = batch.sourceUnits.reduce((sum, u) => sum + u.sourceText.length, 0) / batch.sourceUnits.length;
        const estimatedInputTokens = batch.sourceUnits.length * (avgCharsPerUnit / 4); // ~4 chars per token
        const estimatedOutputTokens = estimatedInputTokens; // Assume similar output size

        const inputCost = (estimatedInputTokens / 1000) * 0.03;
        const outputCost = (estimatedOutputTokens / 1000) * 0.06;

        return inputCost + outputCost;
    }
}
