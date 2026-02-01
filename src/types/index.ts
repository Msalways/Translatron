/**
 * Core type definitions for translatronx
 */

/**
 * Target language definition
 */
export interface TargetLanguage {
    language: string;
    shortCode: string;
}

/**
 * A single translatable string with its context and metadata
 */
export interface SourceUnit {
    unitId: string;
    keyPath: string;
    sourceText: string;
    sourceHash: string;
    context?: string;
    placeholders: string[];
    sourceFile: string;
    schemaVersion: number;
}

/**
 * A batch of source units grouped for efficient LLM processing
 */
export interface TranslationBatch {
    batchId: string;
    sourceUnits: SourceUnit[];
    targetLanguage: string;
    deduplicationKey: string;
}

/**
 * A plan containing all batches to be translated
 */
export interface TranslationPlan {
    batches: TranslationBatch[];
    totalUnits: number;
    estimatedCost: number;
}

/**
 * Result from LLM translation call
 */
export interface TranslationResult {
    unitId: string;
    translatedText: string;
    confidence?: number;
    rawResponse?: any;
}

/**
 * Extractor interface for identifying translatable strings
 */
export interface Extractor {
    extract(_sourceFiles: string[], _config: any): Promise<SourceUnit[]>;
}

/**
 * Translation planner interface
 */
export interface TranslationPlanner {
    createPlan(_sourceUnits: SourceUnit[], _targetLanguages: TargetLanguage[]): Promise<TranslationPlan>;
}

/**
 * LLM provider interface
 */
export interface LLMProvider {
    translate(_batch: TranslationBatch, _prompt: PromptTemplate): Promise<TranslationResult[]>;
    getModelFingerprint(): string;
    estimateCost(_batch: TranslationBatch): number;
}

/**
 * Prompt template for LLM translation
 */
export interface PromptTemplate {
    system: string;
    user: string;
    temperature?: number;
    maxTokens?: number;
}

/**
 * Validation result
 */
export interface ValidationResult {
    isValid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
    confidence: number;
}

/**
 * Validation error
 */
export interface ValidationError {
    type: string;
    message: string;
    field?: string;
}

/**
 * Validation warning
 */
export interface ValidationWarning {
    type: string;
    message: string;
    field?: string;
}

/**
 * Validation pipeline interface
 */
export interface ValidationPipeline {
    validate(_result: TranslationResult, _sourceUnit: SourceUnit): Promise<ValidationResult>;
}

/**
 * File writer interface
 */
export interface AtomicWriter {
    writeTranslations(_filePath: string, _translations: Record<string, string>): Promise<void>;
}

/**
 * File operation type
 */
export interface FileOperation {
    type: 'read' | 'write' | 'merge';
    filePath: string;
    content?: any;
    backup?: boolean;
}

/**
 * Run statistics
 */
export interface RunStatistics {
    runId: string;
    startedAt: Date;
    finishedAt?: Date;
    totalUnits: number;
    translatedUnits: number;
    failedUnits: number;
    skippedUnits: number;
    tokensIn: number;
    tokensOut: number;
    costEstimateUsd: number;
    model: string;
}

/**
 * Retry statistics
 */
export interface RetryStatistics {
    recoveredUnits: number;
    remainingFailed: number;
    tokensIn: number;
    tokensOut: number;
}
