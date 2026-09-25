/**
 * Generic JSON catalog adapter (Epic 002).
 *
 * Reads nested JSON catalogs (objects + arrays) into flat `SourceUnit`s and
 * writes translations back atomically. Pure deterministic TypeScript — no
 * SQLite, no agents, no network.
 */
import { readFileSync, writeFileSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';import fg from 'fast-glob';
import type { SourceUnit } from '../core/domain.js';
import { computeHash, extractPlaceholders, generateUnitId } from '../utils/hash.js';
import type { CatalogAdapter, CatalogReadOptions, CatalogWriteOptions, NormalizedCatalog } from './adapter.js';

const DEFAULT_EXCLUDE = ['**/node_modules/**', '**/dist/**'];

export class GenericJsonAdapter implements CatalogAdapter {
    async discover(patterns: string | string[], exclude?: string[]): Promise<string[]> {
        const list = Array.isArray(patterns) ? patterns : [patterns];
        // fast-glob requires forward slashes, even on Windows.
        const normalized = list.map((p) => p.replace(/\\/g, '/'));
        const ignored = (exclude ?? DEFAULT_EXCLUDE).map((p) => p.replace(/\\/g, '/'));
        return fg(normalized, {
            ignore: ignored,
            absolute: true,
            onlyFiles: true,
        });
    }

    async read(files: string[], options: CatalogReadOptions): Promise<NormalizedCatalog[]> {
        const catalogs: NormalizedCatalog[] = [];
        for (const file of files) {
            const content = readFileSync(file, 'utf-8');
            let data: unknown;
            try {
                data = JSON.parse(content);
            } catch (error) {
                throw new Error(`Catalog parse error in ${file}: ${error instanceof Error ? error.message : String(error)}`);
            }
            const units = this.flatten(data, [], file, options);
            catalogs.push({ locale: options.locale, sourceFile: file, units });
        }
        return catalogs;
    }

    async write(filePath: string, translations: Record<string, string>, options?: CatalogWriteOptions): Promise<void> {
        await this.applyChanges(filePath, { set: translations }, options);
    }

    /**
     * Remove nested keys by key path (Epic 014, J5 orphan cleanup).
     * Missing keys are no-ops; non-object catalogs are refused.
     */
    async removeKeys(filePath: string, keyPaths: string[], options?: CatalogWriteOptions): Promise<void> {
        await this.applyChanges(filePath, { remove: keyPaths }, options);
    }

    /**
     * Single staged update: apply translations AND removals to one catalog in
     * one read → apply → re-parse-validate → rename cycle (J5: write once).
     */
    async applyChanges(
        filePath: string,
        changes: { set?: Record<string, string>; remove?: string[] },
        options?: CatalogWriteOptions
    ): Promise<void> {
        const indent = options?.indent ?? 2;
        const absolute = resolve(filePath);
        let current: Record<string, unknown> = {};
        if (existsSync(absolute)) {
            const raw = readFileSync(absolute, 'utf-8');
            const parsed: unknown = raw.trim().length === 0 ? {} : JSON.parse(raw);
            if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
                throw new Error(`Refusing to merge into non-object catalog: ${filePath}`);
            }
            current = parsed as Record<string, unknown>;
        }
        for (const [keyPath, text] of Object.entries(changes.set ?? {})) {
            setDeep(current, keyPath.split('.'), text);
        }
        for (const keyPath of changes.remove ?? []) {
            deleteDeep(current, keyPath.split('.'));
        }
        const serialized = JSON.stringify(current, null, indent);
        // Validate the resulting catalog before the atomic rename (J5).
        const roundTripped: unknown = JSON.parse(serialized);
        if (roundTripped === null || typeof roundTripped !== 'object' || Array.isArray(roundTripped)) {
            throw new Error(`Staged catalog failed validation: ${filePath}`);
        }
        const tmpPath = `${absolute}.tmp`;
        try {
            writeFileSync(tmpPath, serialized, 'utf-8');
            renameSync(tmpPath, absolute);
        } catch (error) {
            if (existsSync(tmpPath)) unlinkSync(tmpPath);
            throw error;
        }
    }

    private flatten(
        node: unknown,
        keyPath: string[],
        sourceFile: string,
        options: CatalogReadOptions
    ): SourceUnit[] {
        const units: SourceUnit[] = [];
        if (typeof node === 'string') {
            const path = options.keyPrefix
                ? `${options.keyPrefix}.${keyPath.join('.')}`
                : keyPath.join('.');
            units.push({
                unitId: generateUnitId(path, sourceFile),
                keyPath: path,
                sourceText: node,
                sourceHash: computeHash(node),
                context: undefined,
                placeholders: extractPlaceholders(node),
                sourceFile,
                schemaVersion: options.schemaVersion ?? 1,
            });
        } else if (Array.isArray(node)) {
            node.forEach((item, index) => {
                units.push(...this.flatten(item, [...keyPath, index.toString()], sourceFile, options));
            });
        } else if (node !== null && typeof node === 'object') {
            for (const [key, value] of Object.entries(node)) {
                units.push(...this.flatten(value, [...keyPath, key], sourceFile, options));
            }
        }
        // Non-string scalars (numbers, booleans, null) are not translatable — skipped.
        return units;
    }
}

function setDeep(root: Record<string, unknown>, segments: string[], value: string): void {
    let node = root;
    for (let i = 0; i < segments.length - 1; i++) {
        const segment = segments[i];
        const next = node[segment];
        if (next === null || typeof next !== 'object' || Array.isArray(next)) {
            const fresh: Record<string, unknown> = {};
            node[segment] = fresh;
            node = fresh;
        } else {
            node = next as Record<string, unknown>;
        }
    }
    node[segments[segments.length - 1]] = value;
}

/** Delete a nested key by path segments. Missing keys are no-ops. */
function deleteDeep(root: Record<string, unknown>, segments: string[]): void {
    let node = root;
    for (let i = 0; i < segments.length - 1; i++) {
        const next = node[segments[i]];
        if (next === null || typeof next !== 'object' || Array.isArray(next)) return;
        node = next as Record<string, unknown>;
    }
    delete node[segments[segments.length - 1]];
}
