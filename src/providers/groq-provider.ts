import { Groq } from 'groq-sdk';
import { BaseLLMProvider } from './base-provider';
import { type TranslationBatch, type TranslationResult, type PromptTemplate } from '../types/index';

/**
 * Groq provider implementation
 */
export class GroqProvider extends BaseLLMProvider {
    private client: Groq;

    constructor(config: {
        apiKey: string;
        model: string;
        temperature?: number;
        maxRetries?: number;
    }) {
        super(config);
        this.client = new Groq({
            apiKey: config.apiKey,
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
        return `groq:${this.config.model}`;
    }

    estimateCost(batch: TranslationBatch): number {
        // Groq pricing (very low cost, approximate)
        // Input: $0.0001 per 1K tokens, Output: $0.0002 per 1K tokens
        const avgCharsPerUnit = batch.sourceUnits.reduce((sum, u) => sum + u.sourceText.length, 0) / batch.sourceUnits.length;
        const estimatedInputTokens = batch.sourceUnits.length * (avgCharsPerUnit / 4);
        const estimatedOutputTokens = estimatedInputTokens;

        const inputCost = (estimatedInputTokens / 1000) * 0.0001;
        const outputCost = (estimatedOutputTokens / 1000) * 0.0002;

        return inputCost + outputCost;
    }
}
