/**
 * Init scaffolding (Epic 018).
 *
 * Pure builders so golden tests pin both modes. v3 is the default and writes
 * a TypeScript config so credentials can be selected with `process.env`.
 * `--v2` remains available only as an explicit compatibility escape hatch.
 * Both modes overwrite unconditionally, matching `init` behavior since v1.
 */
import type { translatronxConfig } from '../config/schema.js';
import { PROVIDER_BY_ID, type LangChainProviderId, type ProviderDescriptor } from '../providers/catalog.js';

export interface ScaffoldedConfig {
    file: string;
    content: string;
}

/** Historical v2 template (do not alter bytes without updating goldens). */
export function buildV2Scaffold(config: Partial<translatronxConfig>): ScaffoldedConfig {
    const configContent = `import { defineConfig } from 'translatronx';
                export default defineConfig(${JSON.stringify(config, null, 2)});
                `;
    return { file: 'translatronx.config.ts', content: configContent };
}

/** Default v3 template: TypeScript keeps provider credentials configurable. */
export function buildV3Scaffold(providerId: LangChainProviderId = 'openai'): ScaffoldedConfig {
    const provider = PROVIDER_BY_ID.get(providerId);
    if (provider === undefined) throw new Error(`Unknown provider "${providerId}".`);
    const providerFields = providerConfigFields(provider);
    const content = `import { defineConfig } from 'translatronx';

export default defineConfig({
    sourceLocale: 'en-GB',
    locales: ['fr-FR', 'de-DE'],
    extractors: [{ type: 'json', pattern: './locales/en-GB.json' }],
    providers: [
        {
            name: '${providerId}',
            type: '${provider.configType}',
            model: '${provider.defaultModel}',${providerFields}
        },
    ],
    skills: { dir: './translatron/skills' },
    execution: { maxLanguages: 4, maxGlobalModelCalls: 8 },
});
`;
    return { file: 'translatronx.config.ts', content };
}

function providerConfigFields(provider: ProviderDescriptor): string {
    const fields: string[] = [];
    if (provider.apiKeyEnv !== undefined) fields.push(`            apiKey: process.env.${provider.apiKeyEnv},`);
    if (provider.baseUrlEnv !== undefined) {
        const fallback = provider.id === 'nvidia' ? ` ?? 'https://integrate.api.nvidia.com/v1'` : '';
        fields.push(`            baseUrl: process.env.${provider.baseUrlEnv}${fallback},`);
    }
    if (provider.id === 'azure_openai' || provider.configType === 'azure-openai') {
        fields.push('            apiVersion: process.env.AZURE_OPENAI_API_VERSION,');
    }
    if (provider.id === 'google-vertexai' || provider.id === 'google-vertexai-web') {
        fields.push('            project: process.env.GOOGLE_CLOUD_PROJECT,');
        fields.push('            location: process.env.GOOGLE_CLOUD_LOCATION,');
    }
    if (provider.id === 'bedrock' || provider.id === 'aws') fields.push('            region: process.env.AWS_REGION,');
    return fields.length === 0 ? '' : `\n${fields.join('\n')}`;
}
