import { type LLMProvider, type TranslationBatch, type TranslationResult, type PromptTemplate } from '../types/index';

/**
 * Base provider with common functionality
 */
export abstract class BaseLLMProvider implements LLMProvider {
    protected maxRetries: number;
    protected temperature: number;

    constructor(
        protected config: {
            model: string;
            temperature?: number;
            maxRetries?: number;
        }
    ) {
        this.maxRetries = config.maxRetries ?? 3;
        this.temperature = config.temperature ?? 0.3;
    }

    abstract translate(batch: TranslationBatch, prompt: PromptTemplate): Promise<TranslationResult[]>;
    abstract getModelFingerprint(): string;
    abstract estimateCost(batch: TranslationBatch): number;

    /**
     * Retry logic with exponential backoff
     */
    protected async retryWithBackoff<T>(
        fn: () => Promise<T>,
        attempt: number = 0
    ): Promise<T> {
        try {
            return await fn();
        } catch (error: any) {
            if (attempt >= this.maxRetries) {
                throw error;
            }

            // Exponential backoff: 1s, 2s, 4s, etc.
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));

            return this.retryWithBackoff(fn, attempt + 1);
        }
    }

    /**
     * Build prompt for translation batch
     */
    protected buildTranslationPrompt(batch: TranslationBatch): string {
        const items = batch.sourceUnits.map((unit, idx) => {
            return `${idx + 1}. [${unit.keyPath}]: "${unit.sourceText}"`;
        }).join('\n');

        return `Translate the following strings to ${batch.targetLanguage}. Preserve all placeholders exactly as they appear. Return a JSON array with the same order.\n\n${items}`;
    }

    /**
     * Parse translation response into results
     */
    protected parseTranslationResponse(
        batch: TranslationBatch,
        responseText: string
    ): TranslationResult[] {
        try {
            // Try to parse as JSON array
            const translations = JSON.parse(responseText);

            if (!Array.isArray(translations)) {
                throw new Error('Response is not an array');
            }

            return batch.sourceUnits.map((unit, idx) => ({
                unitId: unit.unitId,
                translatedText: translations[idx] || '',
                confidence: 1.0,
            }));
        } catch (error) {
            // Fallback: try to extract individual translations
            console.error('Failed to parse response as JSON array:', error);
            throw new Error('Invalid translation response format');
        }
    }
}
