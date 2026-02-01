import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

/**
 * SQLite ledger for tracking translation state and change detection
 */
export class translatronxLedger {
  private db: Database.Database;

  constructor(ledgerPath: string) {
    // Ensure directory exists
    const dir = dirname(ledgerPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Initialize database
    this.db = new Database(ledgerPath);
    this.initializeSchema();
  }

  /**
   * Initialize database schema
   */
  private initializeSchema(): void {
    this.db.exec(`
      -- Source hashes table for change detection
      CREATE TABLE IF NOT EXISTS source_hashes (
        key_path TEXT PRIMARY KEY,
        value_hash TEXT NOT NULL,
        context_sig TEXT,
        last_seen_run TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_hash_lookup 
        ON source_hashes(value_hash, context_sig);

      -- Sync status table for tracking translation state
      CREATE TABLE IF NOT EXISTS sync_status (
        key_path TEXT,
        lang_code TEXT,
        target_hash TEXT,
        status TEXT CHECK(status IN ('CLEAN','DIRTY','FAILED','MANUAL','SKIPPED')),
        model_fingerprint TEXT,
        prompt_version INTEGER,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (key_path, lang_code)
      );

      CREATE INDEX IF NOT EXISTS idx_status_lookup 
        ON sync_status(status, lang_code);

      -- Run history table for audit trail
      CREATE TABLE IF NOT EXISTS run_history (
        run_id TEXT PRIMARY KEY,
        started_at TIMESTAMP,
        finished_at TIMESTAMP,
        model_used TEXT,
        tokens_in INTEGER,
        tokens_out INTEGER,
        cost_estimate_usd REAL,
        config_hash TEXT
      );
    `);
  }

  /**
   * Get source hash for a key path
   */
  getSourceHash(keyPath: string): string | null {
    const stmt = this.db.prepare(`
      SELECT value_hash FROM source_hashes WHERE key_path = ?
    `);
    const row = stmt.get(keyPath) as { value_hash: string } | undefined;
    return row?.value_hash || null;
  }

  /**
   * Update source hash for a key path
   */
  updateSourceHash(keyPath: string, valueHash: string, contextSig?: string, runId?: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO source_hashes (key_path, value_hash, context_sig, last_seen_run)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(key_path) DO UPDATE SET
        value_hash = excluded.value_hash,
        context_sig = excluded.context_sig,
        last_seen_run = excluded.last_seen_run,
        updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(keyPath, valueHash, contextSig || null, runId || null);
  }

  /**
   * Get sync status for a key-language pair
   */
  getSyncStatus(keyPath: string, langCode: string): SyncStatus | null {
    const stmt = this.db.prepare(`
      SELECT * FROM sync_status WHERE key_path = ? AND lang_code = ?
    `);
    const row = stmt.get(keyPath, langCode) as SyncStatus | undefined;
    return row || null;
  }

  /**
   * Update sync status for a key-language pair
   */
  updateSyncStatus(
    keyPath: string,
    langCode: string,
    targetHash: string,
    status: SyncStatusType,
    modelFingerprint?: string,
    promptVersion?: number
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO sync_status (key_path, lang_code, target_hash, status, model_fingerprint, prompt_version)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(key_path, lang_code) DO UPDATE SET
        target_hash = excluded.target_hash,
        status = excluded.status,
        model_fingerprint = excluded.model_fingerprint,
        prompt_version = excluded.prompt_version,
        updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(keyPath, langCode, targetHash, status, modelFingerprint || null, promptVersion || null);
  }

  /**
   * Begin a new run and return run ID
   */
  startRun(modelUsed: string, configHash: string): string {
    const runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const stmt = this.db.prepare(`
      INSERT INTO run_history (run_id, started_at, model_used, config_hash)
      VALUES (?, CURRENT_TIMESTAMP, ?, ?)
    `);
    stmt.run(runId, modelUsed, configHash);
    return runId;
  }

  /**
   * Complete a run with stats
   */
  completeRun(runId: string, tokensIn: number, tokensOut: number, costEstimate: number): void {
    const stmt = this.db.prepare(`
      UPDATE run_history
      SET finished_at = CURRENT_TIMESTAMP,
          tokens_in = ?,
          tokens_out = ?,
          cost_estimate_usd = ?
      WHERE run_id = ?
    `);
    stmt.run(tokensIn, tokensOut, costEstimate, runId);
  }

  /**
   * Get all dirty/new translations for a language
   */
  getDirtyKeys(langCode: string): string[] {
    const stmt = this.db.prepare(`
      SELECT key_path FROM sync_status 
      WHERE lang_code = ? AND status IN ('DIRTY', 'FAILED')
    `);
    const rows = stmt.all(langCode) as { key_path: string }[];
    return rows.map(r => r.key_path);
  }

  /**
   * Clean up old run history (keep last N runs)
   */
  cleanupHistory(keepLast: number = 100): void {
    this.db.exec(`
      DELETE FROM run_history 
      WHERE run_id NOT IN (
        SELECT run_id FROM run_history 
        ORDER BY started_at DESC 
        LIMIT ${keepLast}
      )
    `);
  }

  /**
   * Get the most recent run record
   */
  getLatestRun(): any | null {
    const stmt = this.db.prepare(`
      SELECT * FROM run_history ORDER BY started_at DESC LIMIT 1
    `);
    return stmt.get() || null;
  }

  /**
   * Get aggregate statistics for the project
   */
  getProjectStats(): { total_keys: number; manual_count: number } {
    const totalKeys = this.db.prepare(`SELECT COUNT(DISTINCT key_path) as count FROM source_hashes`).get() as { count: number };
    const manualCount = this.db.prepare(`SELECT COUNT(*) as count FROM sync_status WHERE status = 'MANUAL'`).get() as { count: number };

    return {
      total_keys: totalKeys.count,
      manual_count: manualCount.count
    };
  }

  /**
   * Get status counts per language
   */
  getLanguageStats(langCode: string): { translated: number; failed: number } {
    const translated = this.db.prepare(`
      SELECT COUNT(*) as count FROM sync_status 
      WHERE lang_code = ? AND status = 'CLEAN'
    `).get(langCode) as { count: number };

    const failed = this.db.prepare(`
      SELECT COUNT(*) as count FROM sync_status 
      WHERE lang_code = ? AND status IN ('FAILED', 'DIRTY')
    `).get(langCode) as { count: number };

    return {
      translated: translated.count,
      failed: failed.count
    };
  }

  /**
   * Get failed translation items for retry
   */
  getFailedItems(langCode?: string, _batchId?: string): FailedItem[] {
    let query = `
      SELECT ss.*, sh.value_hash 
      FROM sync_status ss 
      LEFT JOIN source_hashes sh ON ss.key_path = sh.key_path
      WHERE ss.status = 'FAILED'
    `;
    const params: string[] = [];

    if (langCode) {
      query += ` AND ss.lang_code = ?`;
      params.push(langCode);
    }

    const stmt = this.db.prepare(query);
    return stmt.all(...params) as FailedItem[];
  }


  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Execute a transaction
   */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
}

/**
 * Type definitions
 */
export type SyncStatusType = 'CLEAN' | 'DIRTY' | 'FAILED' | 'MANUAL' | 'SKIPPED';

export interface SyncStatus {
  key_path: string;
  lang_code: string;
  target_hash: string;
  status: SyncStatusType;
  model_fingerprint: string | null;
  prompt_version: number | null;
  updated_at: string;
}

export interface FailedItem {
  key_path: string;
  lang_code: string;
  target_hash: string;
  status: SyncStatusType;
  model_fingerprint: string | null;
  prompt_version: number | null;
  updated_at: string;
  value_hash: string | null;
}

