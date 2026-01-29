import { type ProviderConfig } from '../config/schema';
import { type LLMProvider } from '../types/index';
import { OpenAIProvider } from './openai-provider';
import { AnthropicProvider } from './anthropic-provider';
import { GroqProvider } from './groq-provider';

/**
 * Provider factory to create LLM providers from configuration
 */
export class ProviderFactory {
    /**
     * Create an LLM provider from configuration
     */
    static createProvider(config: ProviderConfig): LLMProvider {
        switch (config.type) {
            case 'openai':
                if (!config.apiKey) {
                    throw new Error('OpenAI API key is required');
                }
                return new OpenAIProvider({
                    apiKey: config.apiKey,
                    model: config.model,
                    temperature: config.temperature,
                    maxRetries: config.maxRetries,
                    baseUrl: config.baseUrl,
                });

            case 'anthropic':
                if (!config.apiKey) {
                    throw new Error('Anthropic API key is required');
                }
                return new AnthropicProvider({
                    apiKey: config.apiKey,
                    model: config.model,
                    temperature: config.temperature,
                    maxRetries: config.maxRetries,
                });

            case 'groq':
                if (!config.apiKey) {
                    throw new Error('Groq API key is required');
                }
                return new GroqProvider({
                    apiKey: config.apiKey,
                    model: config.model,
                    temperature: config.temperature,
                    maxRetries: config.maxRetries,
                });

            case 'local':
                // Use OpenAI-compatible interface for local models (Ollama, etc.)
                return new OpenAIProvider({
                    apiKey: config.apiKey || 'not-needed',
                    model: config.model,
                    temperature: config.temperature,
                    maxRetries: config.maxRetries,
                    baseUrl: config.baseUrl || 'http://localhost:11434/v1',
                });

            case 'azure-openai':
                if (!config.apiKey) {
                    throw new Error('Azure OpenAI API key is required');
                }
                return new OpenAIProvider({
                    apiKey: config.apiKey,
                    model: config.model,
                    temperature: config.temperature,
                    maxRetries: config.maxRetries,
                    baseUrl: config.baseUrl, // Azure endpoint
                });

            case 'openrouter':
                if (!config.apiKey) {
                    throw new Error('OpenRouter API key is required');
                }
                return new OpenAIProvider({
                    apiKey: config.apiKey,
                    model: config.model,
                    temperature: config.temperature,
                    maxRetries: config.maxRetries,
                    baseUrl: config.baseUrl || 'https://openrouter.ai/api/v1',
                });

            default:
                throw new Error(`Unknown provider type: ${config.type}`);
        }
    }
}

export * from './openai-provider.js';
export * from './anthropic-provider.js';
export * from './groq-provider.js';
