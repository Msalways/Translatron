import { type TranslatronConfig } from '../config/schema';
import { TranslatronLedger } from '../ledger/index';
import { JsonExtractor } from '../extractors/json-extractor';
import { IncrementalTranslationPlanner } from '../planner/index';
import { ProviderFactory } from '../providers/index';
import { TranslationValidationPipeline } from '../validation/index';
import { AtomicFileWriter } from '../file-writer/index';
import { type RunStatistics, type RetryStatistics, type TranslationBatch } from '../types/index';
import { computeHash } from '../utils/hash.js';
import { PromptManager } from '../prompts/index';
import ora from 'ora';
import chalk from 'chalk';

/**
 * Main orchestrator for translation compilation
 */
export class TranslationCompiler {
    private ledger: TranslatronLedger;
    private planner: IncrementalTranslationPlanner;
    private writer: AtomicFileWriter;
    private promptManager: PromptManager;

    constructor(private config: TranslatronConfig) {
        const ledgerPath = config.advanced?.ledgerPath || './.translatron/ledger.sqlite';
        this.ledger = new TranslatronLedger(ledgerPath);
        this.planner = new IncrementalTranslationPlanner(this.ledger);
        this.writer = new AtomicFileWriter();
        this.promptManager = new PromptManager(this.config.prompts);
    }

    /**
     * Synchronize translations (main compilation step)
     */
    async sync(_options: { force?: boolean; verbose?: boolean } = {}): Promise<RunStatistics> {
        const startTime = new Date();
        const spinner = ora('Extracting source strings...').start();

        // TODO: Implement force flag to regenerate manual overrides
        // When _options.force is true, mark all MANUAL status translations as DIRTY


        try {
            // Step 1: Extract source strings
            const extractor = new JsonExtractor();
            const extractorConfig = this.config.extractors[0]; // Use first extractor for now
            const sourceUnits = await extractor.extract([], extractorConfig);

            spinner.succeed(`Extracted ${sourceUnits.length} translatable strings`);

            // Step 2: Update source hashes in ledger
            spinner.start('Updating source hashes...');
            const configHash = computeHash(JSON.stringify(this.config));
            const runId = this.ledger.startRun(this.config.providers[0].model, configHash);

            for (const unit of sourceUnits) {
                this.ledger.updateSourceHash(unit.keyPath, unit.sourceHash, undefined, runId);
            }
            spinner.succeed('Source hashes updated');

            // Step 3: Create translation plan
            spinner.start('Creating translation plan...');
            const plan = await this.planner.createPlan(sourceUnits, this.config.targetLanguages);

            if (plan.batches.length === 0) {
                spinner.succeed(chalk.green('✓ All translations are up to date!'));
                this.ledger.completeRun(runId, 0, 0, 0);
                return {
                    runId,
                    startedAt: startTime,
                    finishedAt: new Date(),
                    totalUnits: sourceUnits.length,
                    translatedUnits: 0,
                    failedUnits: 0,
                    skippedUnits: sourceUnits.length,
                    tokensIn: 0,
                    tokensOut: 0,
                    costEstimateUsd: 0,
                    model: this.config.providers[0].model,
                };
            }

            spinner.succeed(`Created plan: ${plan.batches.length} batches, ~$${plan.estimatedCost.toFixed(4)} estimated cost`);

            // Step 4: Process batches
            const provider = ProviderFactory.createProvider(this.config.providers[0]);
            const validator = new TranslationValidationPipeline(this.config.validation);

            let translatedUnits = 0;
            let failedUnits = 0;
            let totalTokensIn = 0;
            let totalTokensOut = 0;

            spinner.start(`Translating ${plan.totalUnits} strings...`);

            for (const batch of plan.batches) {
                try {
                    // Find the full language name for better context
                    const targetLangObj = this.config.targetLanguages.find(l => l.shortCode === batch.targetLanguage);
                    if (!targetLangObj) continue;

                    const langName = targetLangObj.language;

                    // Get system prompt from prompt manager
                    const systemPrompt = this.promptManager.getSystemPrompt({
                        targetLanguage: langName,
                        targetCode: batch.targetLanguage,
                        sourceUnits: batch.sourceUnits,
                    });

                    // Get user prompt with source texts
                    const sourceTexts = batch.sourceUnits.map(unit => unit.sourceText);
                    const userPrompt = this.promptManager.getUserPrompt(sourceTexts);

                    // Translate batch
                    const results = await provider.translate(batch, {
                        system: systemPrompt,
                        user: userPrompt,
                        temperature: this.config.providers[0].temperature,
                    });

                    // Validate and write results
                    for (let i = 0; i < results.length; i++) {
                        const result = results[i];
                        const sourceUnit = batch.sourceUnits[i];

                        // Validate
                        const validation = await validator.validate(result, sourceUnit);

                        if (!validation.isValid) {
                            console.error(chalk.red(`✗ Validation failed for ${sourceUnit.keyPath}:`), validation.errors);
                            failedUnits++;
                            this.ledger.updateSyncStatus(sourceUnit.keyPath, batch.targetLanguage, '', 'FAILED');
                            continue;
                        }

                        // Write translation using flexible filename
                        const outputFile = AtomicFileWriter.getOutputPath(targetLangObj, this.config.output);
                        const translations = AtomicFileWriter.flatToNested({ [sourceUnit.keyPath]: result.translatedText });

                        await this.writer.writeTranslations(outputFile, translations);

                        // Update ledger
                        const targetHash = computeHash(result.translatedText);
                        this.ledger.updateSyncStatus(
                            sourceUnit.keyPath,
                            batch.targetLanguage,
                            targetHash,
                            'CLEAN',
                            provider.getModelFingerprint(),
                            this.promptManager.getPromptVersion()
                        );

                        translatedUnits++;
                    }

                    // Update token counts (rough estimate)
                    totalTokensIn += batch.sourceUnits.length * 50;
                    totalTokensOut += batch.sourceUnits.length * 50;

                } catch (error) {
                    console.error(chalk.red(`✗ Failed to translate batch ${batch.batchId}:`), error);
                    failedUnits += batch.sourceUnits.length;
                }
            }

            spinner.succeed(chalk.green(`✓ Translated ${translatedUnits} strings, ${failedUnits} failed`));

            // Step 5: Complete run
            const actualCost = provider.estimateCost({ ...plan.batches[0], sourceUnits: sourceUnits.slice(0, translatedUnits) });
            this.ledger.completeRun(runId, totalTokensIn, totalTokensOut, actualCost);

            return {
                runId,
                startedAt: startTime,
                finishedAt: new Date(),
                totalUnits: sourceUnits.length,
                translatedUnits,
                failedUnits,
                skippedUnits: sourceUnits.length - translatedUnits - failedUnits,
                tokensIn: totalTokensIn,
                tokensOut: totalTokensOut,
                costEstimateUsd: actualCost,
                model: this.config.providers[0].model,
            };

        } catch (error) {
            spinner.fail('Translation failed');
            throw error;
        }
    }

    /**
     * Close ledger connection
     */
    close(): void {
        this.ledger.close();
    }

    /**
     * Retry failed translation batches
     */
    async retryFailed(options: { batch?: string; lang?: string; dryRun?: boolean }): Promise<RetryStatistics> {
        const spinner = ora('Identifying failed translations...').start();

        try {
            // Get all failed items from ledger
            const failedItems = this.ledger.getFailedItems(options.lang, options.batch);

            if (failedItems.length === 0) {
                spinner.succeed(chalk.green('✓ No failed translations found'));
                return {
                    recoveredUnits: 0,
                    remainingFailed: 0,
                    tokensIn: 0,
                    tokensOut: 0
                };
            }

            spinner.succeed(`Found ${failedItems.length} failed translations to retry`);

            if (options.dryRun) {
                console.log(chalk.blue('\nDry-run mode - showing what would be retried:'));
                failedItems.forEach(item => {
                    console.log(chalk.gray(`  - ${item.key_path} (${item.lang_code})`));
                });

                return {
                    recoveredUnits: 0,
                    remainingFailed: failedItems.length,
                    tokensIn: 0,
                    tokensOut: 0
                };
            }

            // Group by language for batch processing
            const byLanguage = new Map<string, any[]>();
            failedItems.forEach(item => {
                if (!byLanguage.has(item.lang_code)) {
                    byLanguage.set(item.lang_code, []);
                }
                byLanguage.get(item.lang_code)?.push(item);
            });

            let recoveredUnits = 0;
            let remainingFailed = failedItems.length;
            let totalTokensIn = 0;
            let totalTokensOut = 0;

            // Process each language
            for (const [langCode, items] of byLanguage) {
                const targetLangObj = this.config.targetLanguages.find(l => l.shortCode === langCode);
                const langName = targetLangObj?.language || langCode;

                spinner.start(`Retrying ${items.length} strings for ${langName}...`);

                // Create batch for this language
                const batch: TranslationBatch = {
                    batchId: `retry_${Date.now()}`,
                    sourceUnits: items.map(item => ({
                        unitId: item.key_path,
                        keyPath: item.key_path,
                        sourceText: '', // Would need to load from source
                        sourceHash: item.value_hash,
                        placeholders: [],
                        sourceFile: '',
                        schemaVersion: 1
                    })),
                    targetLanguage: langCode,
                    deduplicationKey: ''
                };

                try {
                    const provider = ProviderFactory.createProvider(this.config.providers[0]);
                    const validator = new TranslationValidationPipeline(this.config.validation);

                    // Get language object for output path
                    const targetLangObj = this.config.targetLanguages.find(l => l.shortCode === langCode);
                    if (!targetLangObj) continue;

                    // Get system prompt
                    const systemPrompt = this.promptManager.getSystemPrompt({
                        targetLanguage: langName,
                        targetCode: langCode,
                        sourceUnits: batch.sourceUnits,
                    });

                    // Get user prompt with source texts
                    const sourceTexts = batch.sourceUnits.map(unit => unit.sourceText);
                    const userPrompt = this.promptManager.getUserPrompt(sourceTexts);

                    // Translate batch
                    const results = await provider.translate(batch, {
                        system: systemPrompt,
                        user: userPrompt,
                        temperature: this.config.providers[0].temperature,
                    });

                    // Process results
                    for (let i = 0; i < results.length; i++) {
                        const translationResult = results[i];
                        const sourceUnit = batch.sourceUnits[i];

                        // Validate
                        const validation = await validator.validate(translationResult, sourceUnit);

                        if (validation.isValid) {
                            // Write translation using flexible filename
                            const outputFile = AtomicFileWriter.getOutputPath(targetLangObj, this.config.output);
                            const translations = AtomicFileWriter.flatToNested({ [sourceUnit.keyPath]: translationResult.translatedText });

                            await this.writer.writeTranslations(outputFile, translations);

                            // Update ledger
                            const targetHash = computeHash(translationResult.translatedText);
                            this.ledger.updateSyncStatus(
                                sourceUnit.keyPath,
                                langCode,
                                targetHash,
                                'CLEAN',
                                provider.getModelFingerprint(),
                                this.promptManager.getPromptVersion()
                            );

                            recoveredUnits++;
                            remainingFailed--;
                        }
                    }

                    // Update token counts (rough estimate)
                    totalTokensIn += batch.sourceUnits.length * 50;
                    totalTokensOut += batch.sourceUnits.length * 50;

                    spinner.succeed(chalk.green(`✓ Retried ${recoveredUnits} strings for ${langName}`));

                } catch (error) {
                    console.error(chalk.red(`✗ Failed to retry batch for ${langName}:`), error);
                }
            }

            return {
                recoveredUnits,
                remainingFailed,
                tokensIn: totalTokensIn,
                tokensOut: totalTokensOut
            };

        } catch (error) {
            spinner.fail('Retry operation failed');
            throw error;
        }
    }
}
