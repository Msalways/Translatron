/**
 * Registry home bootstrap (Epic 012 — committed machine-owned folder).
 *
 * Creates `.translatron/{segments,snapshots,meta.json,.gitignore}` on first
 * publishing write. `meta.json` carries static format facts ONLY (no
 * timestamps, versions-that-vary, or random values) so independent
 * bootstraps are byte-identical and merge cleanly. The nested `.gitignore`
 * keeps the disposable `cache/` out of git regardless of the user's root
 * ignore file. Existing files are never overwritten: bootstrap is
 * idempotent and read paths MUST NOT call it (check/status/explain/doctor
 * stay side-effect-free).
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SEGMENTS_DIR, SNAPSHOTS_DIR } from './schema.js';

export const REGISTRY_META_FORMAT = 'translatron-registry' as const;
export const REGISTRY_META_VERSION = 1 as const;
export const REGISTRY_CACHE_DIR = 'cache' as const;

const META_JSON = `${JSON.stringify({ format: REGISTRY_META_FORMAT, version: REGISTRY_META_VERSION }, null, 2)}\n`;

const NESTED_GITIGNORE =
    '# Translatron disposable index — rebuilt automatically, never committed.\n' +
    'cache/\n';

export interface RegistryHome {
    dir: string;
    created: boolean;
}

/** Idempotently ensure the registry home exists. Never overwrites. */
export function ensureRegistryHome(dir: string): RegistryHome {
    let created = false;
    for (const subdir of [SEGMENTS_DIR, SNAPSHOTS_DIR, REGISTRY_CACHE_DIR]) {
        const path = join(dir, subdir);
        if (!existsSync(path)) {
            mkdirSync(path, { recursive: true });
            created = true;
        }
    }
    const metaPath = join(dir, 'meta.json');
    if (!existsSync(metaPath)) {
        writeFileSync(metaPath, META_JSON, 'utf-8');
        created = true;
    }
    const ignorePath = join(dir, '.gitignore');
    if (!existsSync(ignorePath)) {
        writeFileSync(ignorePath, NESTED_GITIGNORE, 'utf-8');
        created = true;
    }
    return { dir, created };
}
