import { BaseLLMProvider } from './base-provider';
import { type TranslationBatch, type TranslationResult, type PromptTemplate } from '../types/index';
import OpenAI from 'openai';

/**
 * Azure OpenAI provider implementation
 * Uses native Azure OpenAI API with proper API versioning and deployment configuration
 */
export class AzureOpenAIProvider extends BaseLLMProvider {
    private apiKey: string;
    private baseUrl: string;
    private apiVersion: string;
    private model: string;

    constructor(config: {
        apiKey: string;
        baseUrl: string;
        apiVersion?: string;
        model: string;
        temperature?: number;
        maxRetries?: number;
    }) {
        super(config);
        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl;
        this.apiVersion = config.apiVersion ?? '2024-02-15-preview';
        this.model = config.model;
    }

    async translate(batch: TranslationBatch, prompt: PromptTemplate): Promise<TranslationResult[]> {
        return this.retryWithBackoff(async () => {
            const userPrompt = this.buildTranslationPrompt(batch);

            const client = new OpenAI({
                apiKey: this.apiKey,
                baseURL: this.baseUrl,
                defaultHeaders: {
                    'api-version': this.apiVersion,
                },
                defaultQuery: {
                    'api-version': this.apiVersion,
                },
            })

            const response = await client.chat.completions.create({
                model: this.model,
                messages: [
                    { role: 'system', content: prompt.system },
                    { role: 'user', content: userPrompt },
                ],
                response_format: { type: 'json_object' },
                temperature: this.temperature,
            })
            const content = response.choices[0]?.message?.content || '[]';

            // Extract JSON array from response
            const jsonMatch = content.match(/\[[\s\S]*\]/);
            const jsonString = jsonMatch ? jsonMatch[0] : content;

            return this.parseTranslationResponse(batch, jsonString);
        });
    }

    getModelFingerprint(): string {
        return `azure-openai:${this.model}:${this.apiVersion}`;
    }

    estimateCost(batch: TranslationBatch): number {
        // Azure OpenAI pricing varies by model and region
        // This is a generic estimate based on GPT-4 pricing (adjust as needed)
        // Input: $0.03 per 1K tokens, Output: $0.06 per 1K tokens
        const avgCharsPerUnit = batch.sourceUnits.reduce((sum, u) => sum + u.sourceText.length, 0) / batch.sourceUnits.length;
        const estimatedInputTokens = batch.sourceUnits.length * (avgCharsPerUnit / 4); // ~4 chars per token
        const estimatedOutputTokens = estimatedInputTokens; // Assume similar output size

        const inputCost = (estimatedInputTokens / 1000) * 0.03;
        const outputCost = (estimatedOutputTokens / 1000) * 0.06;

        return inputCost + outputCost;
    }
}
