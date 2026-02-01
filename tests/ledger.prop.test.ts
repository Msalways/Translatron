import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { translatronxLedger, SyncStatusType } from '../src/ledger/index';
import { rmSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('Ledger Property Tests', () => {
    const testDir = join(process.cwd(), 'temp-ledger-tests');
    const ledgerPath = join(testDir, 'test.sqlite');
    let ledger: translatronxLedger;

    beforeEach(() => {
        if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
        mkdirSync(testDir, { recursive: true });
        ledger = new translatronxLedger(ledgerPath);
    });

    afterEach(() => {
        if (ledger) ledger.close();
        if (existsSync(testDir)) {
            try {
                rmSync(testDir, { recursive: true, force: true });
            } catch (e) {
                console.warn('Failed to cleanup test dir:', e);
            }
        }
    });

    it('should maintain consistent source hashes across updates', () => {
        const keyArb = fc.string({ minLength: 1 });
        const hashArb = fc.string({ minLength: 1 });

        fc.assert(
            fc.property(fc.array(fc.tuple(keyArb, hashArb), { minLength: 1 }), (entries) => {
                for (const [key, hash] of entries) {
                    ledger.updateSourceHash(key, hash);
                }

                for (const [key, hash] of entries) {
                    // Last one wins for the same key
                    const lastHash = entries.filter(e => e[0] === key).pop()![1];
                    expect(ledger.getSourceHash(key)).toBe(lastHash);
                }
            })
        );
    });

    it('should maintain consistent sync status across updates', () => {
        const keyArb = fc.string({ minLength: 1 });
        const langArb = fc.string({ minLength: 2, maxLength: 2 });
        const targetHashArb = fc.string({ minLength: 1 });
        const statusArb = fc.constantFrom<SyncStatusType>('CLEAN', 'DIRTY', 'FAILED', 'MANUAL', 'SKIPPED');

        fc.assert(
            fc.property(fc.array(fc.record({
                key: keyArb,
                lang: langArb,
                hash: targetHashArb,
                status: statusArb
            }), { minLength: 1 }), (records) => {
                for (const rec of records) {
                    ledger.updateSyncStatus(rec.key, rec.lang, rec.hash, rec.status);
                }

                for (const rec of records) {
                    const lastRec = records.filter(r => r.key === rec.key && r.lang === rec.lang).pop()!;
                    const status = ledger.getSyncStatus(rec.key, rec.lang);
                    expect(status).not.toBeNull();
                    expect(status?.target_hash).toBe(lastRec.hash);
                    expect(status?.status).toBe(lastRec.status);
                }
            })
        );
    });
});
