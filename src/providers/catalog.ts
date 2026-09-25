/**
 * LangChain chat-provider catalog.
 *
 * Keep this separate from the runtime: it is safe for config/CLI code to
 * import and contains no framework imports. The package name is the package
 * LangChain's `initChatModel` dynamically imports for that provider.
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';

export type LangChainProviderId =
    | 'openai'
    | 'anthropic'
    | 'azure_openai'
    | 'langsmith'
    | 'cohere'
    | 'google'
    | 'google-vertexai'
    | 'google-vertexai-web'
    | 'google-genai'
    | 'ollama'
    | 'mistralai'
    | 'mistral'
    | 'groq'
    | 'bedrock'
    | 'aws'
    | 'deepseek'
    | 'xai'
    | 'cerebras'
    | 'fireworks'
    | 'together'
    | 'perplexity'
    | 'openrouter'
    | 'nvidia'
    | 'local';

export type AuthPattern =
    | 'api-key'
    | 'api-key-and-endpoint'
    | 'cloud-credentials'
    | 'gateway'
    | 'no-key';

export interface ProviderDescriptor {
    /** Prefix understood by LangChain initChatModel, except compatibility aliases. */
    id: LangChainProviderId;
    package: string;
    className: string;
    defaultModel: string;
    auth: AuthPattern;
    /** Primary env var for a simple API-key provider. */
    apiKeyEnv?: string;
    /** Optional endpoint/base URL env var. */
    baseUrlEnv?: string;
    /** Additional env vars required by cloud/credential providers. */
    requiredEnv?: string[];
    /** Config provider type for existing v2 compatibility. */
    configType: string;
    /** True when this is an OpenAI-compatible endpoint rather than a native package. */
    openAICompatible?: boolean;
}

export const LANGCHAIN_PROVIDERS: readonly ProviderDescriptor[] = [
    { id: 'openai', package: '@langchain/openai', className: 'ChatOpenAI', defaultModel: 'gpt-5', auth: 'api-key', apiKeyEnv: 'OPENAI_API_KEY', baseUrlEnv: 'OPENAI_BASE_URL', configType: 'openai', openAICompatible: true },
    { id: 'anthropic', package: '@langchain/anthropic', className: 'ChatAnthropic', defaultModel: 'claude-sonnet-4-6', auth: 'api-key', apiKeyEnv: 'ANTHROPIC_API_KEY', configType: 'anthropic' },
    { id: 'azure_openai', package: '@langchain/openai', className: 'AzureChatOpenAI', defaultModel: 'gpt-4o', auth: 'api-key-and-endpoint', apiKeyEnv: 'AZURE_OPENAI_API_KEY', baseUrlEnv: 'AZURE_OPENAI_ENDPOINT', requiredEnv: ['AZURE_OPENAI_API_VERSION'], configType: 'azure-openai' },
    { id: 'langsmith', package: '@langchain/openai', className: 'ChatOpenAI', defaultModel: 'gpt-5', auth: 'gateway', apiKeyEnv: 'LANGSMITH_API_KEY', baseUrlEnv: 'LANGSMITH_GATEWAY_URL', configType: 'langsmith', openAICompatible: true },
    { id: 'cohere', package: '@langchain/cohere', className: 'ChatCohere', defaultModel: 'command-r-plus', auth: 'api-key', apiKeyEnv: 'COHERE_API_KEY', configType: 'cohere' },
    { id: 'google', package: '@langchain/google', className: 'ChatGoogle', defaultModel: 'gemini-2.5-flash', auth: 'api-key', apiKeyEnv: 'GOOGLE_API_KEY', configType: 'google' },
    { id: 'google-vertexai', package: '@langchain/google-vertexai', className: 'ChatVertexAI', defaultModel: 'gemini-2.5-flash', auth: 'cloud-credentials', requiredEnv: ['GOOGLE_CLOUD_PROJECT', 'GOOGLE_CLOUD_LOCATION'], configType: 'google-vertexai' },
    { id: 'google-vertexai-web', package: '@langchain/google-vertexai-web', className: 'ChatVertexAI', defaultModel: 'gemini-2.5-flash', auth: 'gateway', apiKeyEnv: 'GOOGLE_API_KEY', configType: 'google-vertexai-web' },
    { id: 'google-genai', package: '@langchain/google-genai', className: 'ChatGoogleGenerativeAI', defaultModel: 'gemini-2.5-flash', auth: 'api-key', apiKeyEnv: 'GOOGLE_GENERATIVE_AI_API_KEY', configType: 'google-genai' },
    { id: 'ollama', package: '@langchain/ollama', className: 'ChatOllama', defaultModel: 'llama3.2', auth: 'no-key', baseUrlEnv: 'OLLAMA_BASE_URL', configType: 'ollama' },
    { id: 'mistralai', package: '@langchain/mistralai', className: 'ChatMistralAI', defaultModel: 'mistral-large-latest', auth: 'api-key', apiKeyEnv: 'MISTRAL_API_KEY', configType: 'mistralai' },
    { id: 'mistral', package: '@langchain/mistralai', className: 'ChatMistralAI', defaultModel: 'mistral-large-latest', auth: 'api-key', apiKeyEnv: 'MISTRAL_API_KEY', configType: 'mistral' },
    { id: 'groq', package: '@langchain/groq', className: 'ChatGroq', defaultModel: 'openai/gpt-oss-120b', auth: 'api-key', apiKeyEnv: 'GROQ_API_KEY', configType: 'groq' },
    { id: 'bedrock', package: '@langchain/aws', className: 'ChatBedrockConverse', defaultModel: 'anthropic.claude-3-5-sonnet-20240620-v1:0', auth: 'cloud-credentials', requiredEnv: ['AWS_REGION'], configType: 'bedrock' },
    { id: 'aws', package: '@langchain/aws', className: 'ChatBedrockConverse', defaultModel: 'anthropic.claude-3-5-sonnet-20240620-v1:0', auth: 'cloud-credentials', requiredEnv: ['AWS_REGION'], configType: 'aws' },
    { id: 'deepseek', package: '@langchain/deepseek', className: 'ChatDeepSeek', defaultModel: 'deepseek-chat', auth: 'api-key', apiKeyEnv: 'DEEPSEEK_API_KEY', baseUrlEnv: 'DEEPSEEK_BASE_URL', configType: 'deepseek' },
    { id: 'xai', package: '@langchain/xai', className: 'ChatXAI', defaultModel: 'grok-4', auth: 'api-key', apiKeyEnv: 'XAI_API_KEY', configType: 'xai' },
    { id: 'cerebras', package: '@langchain/cerebras', className: 'ChatCerebras', defaultModel: 'llama-3.3-70b', auth: 'api-key', apiKeyEnv: 'CEREBRAS_API_KEY', configType: 'cerebras' },
    { id: 'fireworks', package: '@langchain/fireworks', className: 'ChatFireworks', defaultModel: 'accounts/fireworks/models/llama-v3p3-70b-instruct', auth: 'api-key', apiKeyEnv: 'FIREWORKS_API_KEY', configType: 'fireworks' },
    { id: 'together', package: '@langchain/together-ai', className: 'ChatTogetherAI', defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', auth: 'api-key', apiKeyEnv: 'TOGETHER_API_KEY', configType: 'together' },
    { id: 'perplexity', package: '@langchain/perplexity', className: 'ChatPerplexity', defaultModel: 'sonar', auth: 'api-key', apiKeyEnv: 'PERPLEXITY_API_KEY', configType: 'perplexity' },
    { id: 'openrouter', package: '@langchain/openai', className: 'ChatOpenAI', defaultModel: 'openai/gpt-4o-mini', auth: 'api-key-and-endpoint', apiKeyEnv: 'OPENROUTER_API_KEY', baseUrlEnv: 'OPENROUTER_BASE_URL', configType: 'openrouter', openAICompatible: true },
    { id: 'nvidia', package: '@langchain/openai', className: 'ChatOpenAI', defaultModel: 'deepseek-ai/deepseek-v4.1-flash', auth: 'api-key-and-endpoint', apiKeyEnv: 'NVIDIA_API_KEY', baseUrlEnv: 'NVIDIA_BASE_URL', configType: 'nvidia', openAICompatible: true },
    { id: 'local', package: '@langchain/openai', className: 'ChatOpenAI', defaultModel: 'llama3.2', auth: 'no-key', baseUrlEnv: 'OLLAMA_BASE_URL', configType: 'local', openAICompatible: true },
];

export const PROVIDER_BY_ID = new Map(LANGCHAIN_PROVIDERS.map((provider) => [provider.id, provider]));

/** The LangChain prefix used for a provider ID, including compatibility aliases. */
export function langChainPrefix(id: string): string {
    if (id === 'azure-openai') return 'azure_openai';
    if (id === 'openrouter' || id === 'local' || id === 'nvidia') return 'openai';
    return id;
}

export function providerForConfigType(type: string): ProviderDescriptor | undefined {
    return LANGCHAIN_PROVIDERS.find((provider) => provider.configType === type || provider.id === type);
}

export function isProviderInstalled(descriptor: ProviderDescriptor): boolean {
    const projectRequire = createRequire(join(process.cwd(), 'package.json'));
    try {
        projectRequire.resolve(`${descriptor.package}/package.json`);
        return true;
    } catch {
        // Some packages do not export package.json; resolving the entry is the
        // useful fallback and still proves the optional integration exists.
        try {
            projectRequire.resolve(descriptor.package);
            return true;
        } catch {
            return false;
        }
    }
}
