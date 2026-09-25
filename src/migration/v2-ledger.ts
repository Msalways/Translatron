/**
 * Read-only v2 SQLite ledger access (Epic 004).
 *
 * The ONLY module (besides legacy `src/ledger/`) allowed to import
 * `better-sqlite3` — enforced by boundary test. Opens the database in
 * readonly mode so migration can never mutate v2 state.
 */
import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';

export interface V2SourceHash {
    keyPath: string;
    valueHash: string;
    contextSig: string | null;
    lastSeenRun: string | null;
}

export interface V2SyncStatus {
    keyPath: string;
    langCode: string;
    targetHash: string | null;
    status: string;
    modelFingerprint: string | null;
    promptVersion: number | null;
}

/** Read-only view over a v2 `.sqlite` ledger. */
export class V2LedgerReader {
    private db: Database.Database;

    constructor(ledgerPath: string) {
        if (!existsSync(ledgerPath)) {
            throw new Error(`v2 ledger not found: ${ledgerPath}`);
        }
        this.db = new Database(ledgerPath, { readonly: true });
    }

    /** All source hashes, keyed lookup-friendly. */
    readSourceHashes(): V2SourceHash[] {
        try {
            return this.db
                .prepare('SELECT key_path AS keyPath, value_hash AS valueHash, context_sig AS contextSig, last_seen_run AS lastSeenRun FROM source_hashes')
                .all() as V2SourceHash[];
        } catch (error) {
            throw new Error(`Cannot read v2 source_hashes: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /** All sync statuses across key × language. */
    readSyncStatuses(): V2SyncStatus[] {
        try {
            return this.db
                .prepare('SELECT key_path AS keyPath, lang_code AS langCode, target_hash AS targetHash, status, model_fingerprint AS modelFingerprint, prompt_version AS promptVersion FROM sync_status')
                .all() as V2SyncStatus[];
        } catch (error) {
            throw new Error(`Cannot read v2 sync_status: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    close(): void {
        this.db.close();
    }
}
