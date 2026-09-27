import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { GenericJsonAdapter } from './generic-json.js';
import type { CatalogAdapter } from './adapter.js';
import type { ExtractorConfig } from '../config/schema.js';

/** Load the configured adapter. JSON is the built-in reference implementation. */
export async function configuredCatalogAdapter(extractors: ExtractorConfig[]): Promise<{ adapter: CatalogAdapter; extractors: ExtractorConfig[] }> {
    const types = [...new Set(extractors.map((item) => item.type))];
    if (types.length !== 1) throw new Error(`Configured extractors use incompatible adapter types: ${types.join(', ')}.`);
    const type = types[0];
    let adapter: CatalogAdapter;
    if (type === 'json') {
        adapter = new GenericJsonAdapter();
    } else if (type === 'custom') {
        if (new Set(extractors.map((item) => item.module)).size !== 1) throw new Error('All custom extractors must use the same adapter module.');
        const modulePath = extractors[0]?.module;
        if (modulePath === undefined) throw new Error('Custom extractor requires "module" exporting a CatalogAdapter.');
        const loaded = await import(pathToFileURL(resolve(process.cwd(), modulePath)).href) as { default?: unknown; adapter?: unknown };
        const candidate = loaded.default ?? loaded.adapter;
        if (!isCatalogAdapter(candidate)) throw new Error(`Custom catalog adapter "${modulePath}" must implement discover(), read(), and write().`);
        adapter = candidate;
    } else {
        throw new Error(`Extractor type "${type}" is not supported by a built-in catalog adapter. Use type: "custom" with a CatalogAdapter module.`);
    }
    return { adapter, extractors };
}

function isCatalogAdapter(value: unknown): value is CatalogAdapter {
    if (value === null || typeof value !== 'object') return false;
    const adapter = value as Record<string, unknown>;
    return ['discover', 'read', 'write'].every((method) => typeof adapter[method] === 'function');
}
