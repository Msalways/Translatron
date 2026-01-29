import Anthropic from '@anthropic-ai/sdk';
import { BaseLLMProvider } from './base-provider';
import { type TranslationBatch, type TranslationResult, type PromptTemplate } from '../types/index';

/**
 * Anthropic (Claude) provider implementation
 */
export class AnthropicProvider extends BaseLLMProvider {
    private client: Anthropic;

    constructor(config: {
        apiKey: string;
        model: string;
        temperature?: number;
        maxRetries?: number;
    }) {
        super(config);
        this.client = new Anthropic({
            apiKey: config.apiKey,
        });
    }

    async translate(batch: TranslationBatch, prompt: PromptTemplate): Promise<TranslationResult[]> {
        return this.retryWithBackoff(async () => {
            const userPrompt = this.buildTranslationPrompt(batch);

            const response = await this.client.messages.create({
                model: this.config.model,
                max_tokens: prompt.maxTokens || 4096,
                temperature: this.temperature,
                system: prompt.system,
                messages: [
                    { role: 'user', content: userPrompt },
                ],
            });

            const content = response.content[0];
            if (content.type !== 'text') {
                throw new Error('Expected text response from Anthropic');
            }

            // Extract JSON array from response
            const jsonMatch = content.text.match(/\[[\s\S]*\]/);
            const jsonString = jsonMatch ? jsonMatch[0] : content.text;

            return this.parseTranslationResponse(batch, jsonString);
        });
    }

    getModelFingerprint(): string {
        return `anthropic:${this.config.model}`;
    }

    estimateCost(batch: TranslationBatch): number {
        // Anthropic Claude pricing (approximate)
        // Input: $0.015 per 1K tokens, Output: $0.075 per 1K tokens (Claude 3 Sonnet)
        const avgCharsPerUnit = batch.sourceUnits.reduce((sum, u) => sum + u.sourceText.length, 0) / batch.sourceUnits.length;
        const estimatedInputTokens = batch.sourceUnits.length * (avgCharsPerUnit / 4);
        const estimatedOutputTokens = estimatedInputTokens;

        const inputCost = (estimatedInputTokens / 1000) * 0.015;
        const outputCost = (estimatedOutputTokens / 1000) * 0.075;

        return inputCost + outputCost;
    }
}
