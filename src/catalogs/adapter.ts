/**
 * Catalog abstraction (Epic 002).
 *
 * Deterministic discovery + reading of translation catalogs. The compiler and
 * reconciler program against `CatalogAdapter`, never against a concrete
 * extractor. Initial implementation: generic nested-JSON catalogs.
 */
import type { SourceUnit } from '../core/domain.js';

/** Normalized in-memory view of one catalog file. */
export interface NormalizedCatalog {
    /** BCP-47-ish locale code the catalog belongs to (e.g. "en-GB"). */
    locale: string;
    /** Absolute or project-relative path the catalog was read from. */
    sourceFile: string;
    /** Flattened translatable units. */
    units: SourceUnit[];
}

/** Options for discovery and reading. */
export interface CatalogReadOptions {
    /** Locale to attribute the catalog to. */
    locale: string;
    /** Optional key prefix prepended to every key path. */
    keyPrefix?: string;
    /** Glob ignore patterns. */
    exclude?: string[];
    /** Schema version stamped on produced units. */
    schemaVersion?: number;
}

/** Source of a catalog file path (used by writers in later epics). */
export interface CatalogWriteOptions {
    /** JSON indent width. */
    indent?: number;
}

export interface CatalogAdapter {
    /** Resolve glob patterns to catalog file paths. */
    discover(patterns: string | string[], exclude?: string[]): Promise<string[]>;
    /** Read + flatten catalog files into normalized units. */
    read(files: string[], options: CatalogReadOptions): Promise<NormalizedCatalog[]>;
    /**
     * Atomically merge flat key-path translations into a JSON catalog
     * (read → deep merge → temp file → rename).
     */
    write(filePath: string, translations: Record<string, string>, options?: CatalogWriteOptions): Promise<void>;
    /** Optional single staged merge/removal operation used by the v3 engine. */
    applyChanges?(filePath: string, changes: { set?: Record<string, string>; remove?: string[] }, options?: CatalogWriteOptions): Promise<void>;
}
