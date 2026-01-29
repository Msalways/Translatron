import { type SourceUnit, type TranslationPlan, type TranslationBatch, type TranslationPlanner, type TargetLanguage } from '../types/index';
import { TranslatronLedger } from '../ledger/index';
import { computeHash } from '../utils/hash';

/**
 * Translation planner that implements incremental processing
 */
export class IncrementalTranslationPlanner implements TranslationPlanner {
    constructor(private ledger: TranslatronLedger) { }

    /**
     * Create a translation plan based on change detection
     */
    async createPlan(sourceUnits: SourceUnit[], targetLanguages: TargetLanguage[]): Promise<TranslationPlan> {
        const batches: TranslationBatch[] = [];
        let totalUnits = 0;

        for (const lang of targetLanguages) {
            const unitsNeedingTranslation = this.detectChanges(sourceUnits, lang.shortCode);

            if (unitsNeedingTranslation.length === 0) {
                continue; // No changes for this language
            }

            // Create batches for this language
            const langBatches = this.createBatches(unitsNeedingTranslation, lang.shortCode);
            batches.push(...langBatches);
            totalUnits += unitsNeedingTranslation.length;
        }

        // Estimate cost (rough estimate: ~50 tokens per translation)
        const estimatedCost = this.estimateCost(totalUnits);

        return {
            batches,
            totalUnits,
            estimatedCost,
        };
    }

    /**
     * Detect which source units have changed and need translation
     */
    private detectChanges(sourceUnits: SourceUnit[], targetLang: string): SourceUnit[] {
        const needsTranslation: SourceUnit[] = [];

        for (const unit of sourceUnits) {
            // Check if source hash has changed
            const storedHash = this.ledger.getSourceHash(unit.keyPath);
            const sourceChanged = storedHash !== unit.sourceHash;

            // Check sync status
            const syncStatus = this.ledger.getSyncStatus(unit.keyPath, targetLang);

            // Determine if translation is needed
            if (!syncStatus) {
                // New key - needs translation
                needsTranslation.push(unit);
            } else if (syncStatus.status === 'MANUAL') {
                // Manual override - skip unless forced
                continue;
            } else if (sourceChanged) {
                // Source changed - needs re-translation
                needsTranslation.push(unit);
            } else if (syncStatus.status === 'FAILED' || syncStatus.status === 'DIRTY') {
                // Previously failed or dirty - retry
                needsTranslation.push(unit);
            }
            // else: CLEAN and unchanged - skip
        }

        return needsTranslation;
    }

    /**
     * Create batches from units for efficient LLM processing
     */
    private createBatches(units: SourceUnit[], targetLang: string, batchSize: number = 20): TranslationBatch[] {
        const batches: TranslationBatch[] = [];

        for (let i = 0; i < units.length; i += batchSize) {
            const batchUnits = units.slice(i, i + batchSize);
            const batchId = `batch_${targetLang}_${Date.now()}_${i}`;

            // Compute deduplication key from content
            const contentHash = computeHash(
                batchUnits.map(u => u.sourceHash).join('_')
            );

            batches.push({
                batchId,
                sourceUnits: batchUnits,
                targetLanguage: targetLang,
                deduplicationKey: contentHash,
            });
        }

        return batches;
    }

    /**
     * Estimate cost for translation
     * Rough estimate: 50 input tokens + 50 output tokens per unit
     * OpenAI pricing: ~$0.01 per 1K tokens
     */
    private estimateCost(totalUnits: number): number {
        const tokensPerUnit = 100; // 50 input + 50 output (rough estimate)
        const totalTokens = totalUnits * tokensPerUnit;
        const costPer1kTokens = 0.01; // Average across providers
        return (totalTokens / 1000) * costPer1kTokens;
    }
}

/**
 * Manual override detector
 */
export class ManualOverrideDetector {
    constructor(private ledger: TranslatronLedger) { }

    /**
     * Detect if a translation has been manually overridden
     */
    isManualOverride(keyPath: string, langCode: string, currentHash: string): boolean {
        const syncStatus = this.ledger.getSyncStatus(keyPath, langCode);

        if (!syncStatus) {
            return false; // New translation, not an override
        }

        // If status is MANUAL, it's been manually overridden
        if (syncStatus.status === 'MANUAL') {
            return true;
        }

        // If target hash doesn't match and status is CLEAN, it was manually edited
        if (syncStatus.status === 'CLEAN' && syncStatus.target_hash !== currentHash) {
            return true;
        }

        return false;
    }

    /**
     * Mark a translation as manually overridden
     */
    markAsManualOverride(keyPath: string, langCode: string, targetHash: string): void {
        this.ledger.updateSyncStatus(keyPath, langCode, targetHash, 'MANUAL');
    }
}
