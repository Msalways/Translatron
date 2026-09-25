import { describe, expect, it } from 'vitest';
import { LANGCHAIN_PROVIDERS, PROVIDER_BY_ID, langChainPrefix } from '../../src/providers/catalog.js';
import { buildV3Scaffold } from '../../src/cli/init.js';

describe('provider catalog (v3 default)', () => {
    it('covers every LangChain initChatModel prefix plus compatibility profiles', () => {
        const ids = LANGCHAIN_PROVIDERS.map((provider) => provider.id);
        expect(ids).toEqual(expect.arrayContaining([
            'openai', 'anthropic', 'azure_openai', 'cohere', 'google',
            'google-vertexai', 'google-vertexai-web', 'google-genai', 'ollama',
            'mistralai', 'mistral', 'groq', 'bedrock', 'aws', 'deepseek',
            'xai', 'cerebras', 'fireworks', 'together', 'perplexity',
        ]));
        expect(PROVIDER_BY_ID.get('nvidia')?.package).toBe('@langchain/openai');
        expect(langChainPrefix('nvidia')).toBe('openai');
        expect(langChainPrefix('openrouter')).toBe('openai');
        expect(langChainPrefix('local')).toBe('openai');
    });

    it('keeps auth metadata for API keys, endpoints, cloud credentials, and local models', () => {
        expect(PROVIDER_BY_ID.get('openai')?.apiKeyEnv).toBe('OPENAI_API_KEY');
        expect(PROVIDER_BY_ID.get('nvidia')?.baseUrlEnv).toBe('NVIDIA_BASE_URL');
        expect(PROVIDER_BY_ID.get('azure_openai')?.requiredEnv).toContain('AZURE_OPENAI_API_VERSION');
        expect(PROVIDER_BY_ID.get('google-vertexai')?.auth).toBe('cloud-credentials');
        expect(PROVIDER_BY_ID.get('ollama')?.auth).toBe('no-key');
    });

    it('generates TS provider config for NVIDIA using process.env', () => {
        const scaffold = buildV3Scaffold('nvidia');
        expect(scaffold.file).toBe('translatronx.config.ts');
        expect(scaffold.content).toContain("name: 'nvidia'");
        expect(scaffold.content).toContain('type: \'nvidia\'');
        expect(scaffold.content).toContain('apiKey: process.env.NVIDIA_API_KEY');
        expect(scaffold.content).toContain('baseUrl: process.env.NVIDIA_BASE_URL ?? \'https://integrate.api.nvidia.com/v1\'');
    });
});
