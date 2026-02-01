import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { IncrementalTranslationPlanner, ManualOverrideDetector } from '../src/planner/index';
import { TranslatronLedger } from '../src/ledger/index';
import { SourceUnit } from '../src/types/index';
import { rmSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('Planner Property Tests', () => {
    const baseTestDir = join(process.cwd(), 'temp-planner-tests');

    beforeEach(() => {
        if (!existsSync(baseTestDir)) mkdirSync(baseTestDir, { recursive: true });
    });

    afterEach(() => {
        // No global cleanup to avoid EBUSY, individual tests handle their own
    });

    it('should only include dirty or new units in the plan', async () => {
        const testDir = join(baseTestDir, `plan-dirty_${Math.random().toString(36).substr(2, 9)}`);
        if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
        mkdirSync(testDir, { recursive: true });

        const keyArb = fc.string({ minLength: 1 });
        const textArb = fc.string({ minLength: 1 });

        await fc.assert(
            fc.asyncProperty(fc.uniqueArray(fc.record({ key: keyArb, text: textArb }), { selector: v => v.key, minLength: 1 }), async (units) => {
                // Use a fresh ledger for each iteration to avoid collisions
                const itLedgerPath = join(testDir, `test_${Math.random().toString(36).substr(2, 9)}.sqlite`);
                const itLedger = new TranslatronLedger(itLedgerPath);
                const planner = new IncrementalTranslationPlanner(itLedger);

                try {
                    const sourceUnits: SourceUnit[] = units.map(u => ({
                        unitId: u.key,
                        keyPath: u.key,
                        sourceText: u.text,
                        sourceHash: u.text, // Simplified
                        placeholders: [],
                        sourceFile: 'test.json',
                        schemaVersion: 1
                    }));

                    // First run: all units should be included
                    const plan1 = await planner.createPlan(sourceUnits, [{ language: 'French', shortCode: 'fr' }]);
                    expect(plan1.totalUnits).toBe(sourceUnits.length);

                    // Simulate successful translation
                    for (const unit of sourceUnits) {
                        itLedger.updateSourceHash(unit.keyPath, unit.sourceHash);
                        itLedger.updateSyncStatus(unit.keyPath, 'fr', 'some-target-hash', 'CLEAN');
                    }

                    // Second run: no units should be included if nothing changed
                    const plan2 = await planner.createPlan(sourceUnits, [{ language: 'French', shortCode: 'fr' }]);
                    expect(plan2.totalUnits).toBe(0);

                    // Change one unit
                    if (sourceUnits.length > 0) {
                        // Update the actual unit in the array
                        const originalText = sourceUnits[0].sourceText;
                        sourceUnits[0].sourceText = originalText + ' changed';
                        sourceUnits[0].sourceHash = originalText + '_new';

                        const plan3 = await planner.createPlan(sourceUnits, [{ language: 'French', shortCode: 'fr' }]);
                        expect(plan3.totalUnits).toBe(1);
                        expect(plan3.batches[0].sourceUnits[0].keyPath).toBe(sourceUnits[0].keyPath);
                    }
                } finally {
                    itLedger.close();
                }
            })
        );

        // Individual test cleanup
        if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
    });

    it('should respect manual overrides', () => {
        const testDir = join(baseTestDir, `manual_${Math.random().toString(36).substr(2, 9)}`);
        if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
        mkdirSync(testDir, { recursive: true });

        fc.assert(
            fc.property(fc.string({ minLength: 1 }), fc.string({ minLength: 1 }), (key, hash) => {
                // Use a fresh ledger for each iteration to avoid collisions
                const itLedgerPath = join(testDir, `test_${Math.random().toString(36).substr(2, 9)}.sqlite`);
                const itLedger = new TranslatronLedger(itLedgerPath);
                const detector = new ManualOverrideDetector(itLedger);

                try {
                    // Not overridden by default
                    expect(detector.isManualOverride(key, 'fr', hash)).toBe(false);

                    // Mark as manual
                    detector.markAsManualOverride(key, 'fr', hash);
                    expect(detector.isManualOverride(key, 'fr', hash)).toBe(true);

                    // Status remains manual even if hash changes (once marked, it's sticky until reset)
                    expect(detector.isManualOverride(key, 'fr', 'new-hash')).toBe(true);
                } finally {
                    itLedger.close();
                }
            })
        );

        if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
    });
});
