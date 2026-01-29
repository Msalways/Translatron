/**
 * Prompt management system for translation quality and customization
 */

export interface PromptConfig {
    /** @deprecated Use customContext instead. This field will be removed in v2.0 */
    systemPrompt?: string;
    /** User-configurable prompt content (array for better readability, will be joined with newlines) */
    userPrompt?: string[];
    customContext?: string;
    formatting?: 'formal' | 'casual' | 'technical';
    glossary?: Record<string, string>;
    brandVoice?: string;
}

export interface PromptContext {
    targetLanguage: string;
    targetCode: string;
    sourceUnits?: any[];
    contextInfo?: string;
}

/**
 * Manages translation prompts with defaults and customization
 */
export class PromptManager {
    private config: PromptConfig;

    constructor(config?: PromptConfig) {
        this.config = config || {};
    }

    /**
     * Get the system prompt for translation
     * Always returns the core SDK system prompt with optional customizations
     */
    getSystemPrompt(context: PromptContext): string {
        // Always start with core SDK system prompt
        let prompt = this.getCoreSystemPrompt(context);

        // Add formatting instructions
        if (this.config.formatting) {
            prompt += `\n\n${this.getFormattingInstructions(this.config.formatting)}`;
        }

        // Add glossary terms
        if (this.config.glossary && Object.keys(this.config.glossary).length > 0) {
            prompt += `\n\n${this.getGlossaryInstructions(this.config.glossary)}`;
        }

        // Add brand voice
        if (this.config.brandVoice) {
            prompt += `\n\nBrand voice: ${this.config.brandVoice}`;
        }

        // Add custom context
        if (this.config.customContext) {
            prompt += `\n\n${this.config.customContext}`;
        }

        // Backward compatibility: append deprecated systemPrompt as custom context
        if (this.config.systemPrompt) {
            prompt += `\n\n${this.config.systemPrompt}`;
        }

        return prompt;
    }

    /**
     * Get core SDK system prompt (always used as base)
     */
    private getCoreSystemPrompt(context: PromptContext): string {
        return `You are a professional translator specializing in software localization.

Your task is to translate the provided strings accurately into ${context.targetLanguage} (${context.targetCode}).

CRITICAL RULES:
1. **Preserve all placeholders exactly as they appear** - This includes {variable}, {{variable}}, $variable, %s, %d, and any other template syntax
2. **Maintain the same structure** - Return translations in the exact same JSON array format and order
3. **Context awareness** - Consider the context of UI strings, messages, and technical terms
4. **Natural language** - Produce natural, idiomatic translations that native speakers would use
5. **Consistency** - Maintain consistent terminology throughout all translations
6. **No additions or omissions** - Translate only what is provided, nothing more, nothing less

OUTPUT FORMAT:
Return ONLY a valid JSON array of translated strings in the same order as the input.
Do not include any explanations, comments, or markdown formatting.`;
    }

    /**
     * Get formatting instructions based on style
     */
    private getFormattingInstructions(formatting: 'formal' | 'casual' | 'technical'): string {
        const styles = {
            formal: 'Use formal language and respectful address. Suitable for professional, business, or official contexts.',
            casual: 'Use casual, friendly language. Suitable for consumer apps and informal communication.',
            technical: 'Use precise technical terminology. Prioritize accuracy over naturalness. Keep technical terms in English when appropriate.',
        };

        return `Tone and style: ${styles[formatting]}`;
    }

    /**
     * Get glossary instructions
     */
    private getGlossaryInstructions(glossary: Record<string, string>): string {
        const terms = Object.entries(glossary)
            .map(([source, target]) => `- "${source}" → "${target}"`)
            .join('\n');

        return `GLOSSARY - Use these exact translations for the following terms:\n${terms}`;
    }

    /**
     * Get the current prompt version for tracking
     */
    getPromptVersion(): number {
        // Version 1 is the default system prompt
        // Custom prompts get version 2+
        return this.config.userPrompt || this.config.customContext ? 2 : 1;
    }

    /**
     * Build user prompt from source units
     * Uses custom userPrompt if provided, otherwise defaults to JSON array of source texts
     */
    getUserPrompt(sourceTexts: string[]): string {
        // If custom user prompt is provided, use it
        if (this.config.userPrompt && this.config.userPrompt.length > 0) {
            // Join array with newlines for better readability
            const customPrompt = this.config.userPrompt.join('\n');
            // Append source texts as JSON array
            return `${customPrompt}\n\n${JSON.stringify(sourceTexts, null, 0)}`;
        }

        // Default: just return source texts as JSON array
        return JSON.stringify(sourceTexts, null, 0);
    }
}
