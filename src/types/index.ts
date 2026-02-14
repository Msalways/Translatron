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
 * Context metadata for a translation key
 */
export interface ContextMetadata {
    value: string;           // Original source text (for validation)
    context?: string;        // Optional context description
    notes?: string;          // Optional additional notes
    maxLength?: number;      // Optional max length constraint
    tone?: string;           // Optional tone guidance
}

/**
 * Context file structure (mirrors source file with metadata)
 */
export type ContextFile = {
    [key: string]: ContextMetadata | ContextFile;
};

/**
 * A single translatable string with its context and metadata
 */
export interface SourceUnit {
    unitId: string;
    keyPath: string;
    sourceText: string;
    sourceHash: string;
    context?: string;        // Optional context from context file
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
    rawResponse?: unknown;
}

/**
 * Extractor interface for identifying translatable strings
 */
export interface Extractor {
    extract(sourceFiles: string[], config: unknown): Promise<SourceUnit[]>;
}

/**
 * Translation planner interface
 */
export interface TranslationPlanner {
    createPlan(sourceUnits: SourceUnit[], targetLanguages: TargetLanguage[]): Promise<TranslationPlan>;
}

/**
 * LLM provider interface
 */
export interface LLMProvider {
    translate(batch: TranslationBatch, prompt: PromptTemplate): Promise<TranslationResult[]>;
    getModelFingerprint(): string;
    estimateCost(batch: TranslationBatch): number;
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
    validate(result: TranslationResult, sourceUnit: SourceUnit): Promise<ValidationResult>;
}

/**
 * File writer interface
 */
export interface AtomicWriter {
    writeTranslations(filePath: string, translations: Record<string, string>): Promise<void>;
}

/**
 * File operation type
 */
export interface FileOperation {
    type: 'read' | 'write' | 'merge';
    filePath: string;
    content?: unknown;
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
