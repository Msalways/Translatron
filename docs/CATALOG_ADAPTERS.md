# Catalog adapter contract

A configured adapter is loaded once for all extractors. Implement the exported `CatalogAdapter` type from `translatronx`:

```ts
interface CatalogAdapter {
  discover(patterns: string | string[], exclude?: string[]): Promise<string[]>;
  read(files: string[], options: CatalogReadOptions): Promise<NormalizedCatalog[]>;
  write(filePath: string, translations: Record<string, string>, options?: CatalogWriteOptions): Promise<void>;
  applyChanges?(filePath: string, changes: { set?: Record<string, string>; remove?: string[] }, options?: CatalogWriteOptions): Promise<void>;
}
```

`read` returns normalized `SourceUnit` records with stable `keyPath`, source text and source hash. `discover` returns files matching the configured patterns. `write` applies flat key paths to the target catalog. Implement `applyChanges` to support atomic updates and orphan removal in one write; if omitted, Translatron calls `write` when there are no removals and reports an error if an orphan removal is requested.

Configure one custom module with `type: 'custom'` and `module`. The module exports the adapter object as `default` or `adapter`. A configured `typescript` extractor currently fails clearly and can use the same custom adapter contract. JSON projects may omit `module`; Translatron uses `GenericJsonAdapter`.
