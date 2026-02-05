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
        } catch (error: unknown) {
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
     * Clean LLM output to extract just the JSON part
     * Handles <think> tags, markdown, and extra text
     */
    protected cleanJsonOutput(text: string): string {
        // Remove <think> tags (common in reasoning models)
        let clean = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

        // Extract from markdown code blocks if present
        const codeBlockMatch = clean.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
        if (codeBlockMatch) {
            return codeBlockMatch[1];
        }

        // Find outer JSON array extraction
        // This regex looks for the first '[' and the last ']'
        const start = clean.indexOf('[');
        const end = clean.lastIndexOf(']');

        if (start !== -1 && end !== -1 && end > start) {
            return clean.substring(start, end + 1);
        }

        return clean;
    }

    /**
     * Parse translation response into results
     */
    protected parseTranslationResponse(
        batch: TranslationBatch,
        responseText: string
    ): TranslationResult[] {
        try {
            // Clean the output first
            const jsonString = this.cleanJsonOutput(responseText);

            // Try to parse as JSON array
            const translations = JSON.parse(jsonString);

            if (!Array.isArray(translations)) {
                throw new Error('Response is not an array');
            }

            return batch.sourceUnits.map((unit, idx) => ({
                unitId: unit.unitId,
                translatedText: translations[idx] || '',
                confidence: 1.0,
            }));
        } catch (error) {
            // Fallback: try to extract individual translations if JSON parsing failed
            console.error('Failed to parse response as JSON array:', error);
            console.debug('Raw response:', responseText);
            throw new Error('Invalid translation response format');
        }
    }
}
