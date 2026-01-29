import { type ValidationPipeline, type ValidationResult, type ValidationError, type ValidationWarning, type TranslationResult, type SourceUnit } from '../types/index';
import { extractPlaceholders } from '../utils/hash';

/**
 * Multi-stage validation pipeline for translation quality
 */
export class TranslationValidationPipeline implements ValidationPipeline {
    constructor(
        private config: {
            preservePlaceholders?: boolean;
            maxLengthRatio?: number;
            preventSourceLeakage?: boolean;
            brandNames?: string[];
        } = {}
    ) { }

    async validate(result: TranslationResult, sourceUnit: SourceUnit): Promise<ValidationResult> {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];
        let confidence = 1.0;

        // Stage 1: Structural validation
        if (!result.translatedText || result.translatedText.trim().length === 0) {
            errors.push({
                type: 'EMPTY_TRANSLATION',
                message: 'Translation is empty',
            });
            return { isValid: false, errors, warnings, confidence: 0 };
        }

        // Stage 2: Placeholder preservation
        if (this.config.preservePlaceholders !== false) {
            const placeholderErrors = this.validatePlaceholders(sourceUnit, result);
            errors.push(...placeholderErrors);
            if (placeholderErrors.length > 0) {
                confidence *= 0.5;
            }
        }

        // Stage 3: Semantic validation
        const semanticWarnings = this.validateSemantics(sourceUnit, result);
        warnings.push(...semanticWarnings);
        if (semanticWarnings.length > 0) {
            confidence *= 0.8;
        }

        // Stage 4: Source leakage detection
        if (this.config.preventSourceLeakage !== false) {
            const leakageDetected = this.detectSourceLeakage(sourceUnit, result);
            if (leakageDetected) {
                errors.push({
                    type: 'SOURCE_LEAKAGE',
                    message: 'Translation appears to be in source language',
                });
                confidence *= 0.3;
            }
        }

        // Stage 5: Brand name protection
        if (this.config.brandNames && this.config.brandNames.length > 0) {
            const brandWarnings = this.validateBrandNames(sourceUnit, result);
            warnings.push(...brandWarnings);
        }

        const isValid = errors.length === 0;
        return { isValid, errors, warnings, confidence };
    }

    /**
     * Validate that all placeholders are preserved
     */
    private validatePlaceholders(sourceUnit: SourceUnit, result: TranslationResult): ValidationError[] {
        const errors: ValidationError[] = [];
        const sourcePlaceholders = new Set(sourceUnit.placeholders);
        const translatedPlaceholders = new Set(extractPlaceholders(result.translatedText));

        // Check for missing placeholders
        for (const placeholder of sourcePlaceholders) {
            if (!translatedPlaceholders.has(placeholder)) {
                errors.push({
                    type: 'MISSING_PLACEHOLDER',
                    message: `Missing placeholder: ${placeholder}`,
                    field: placeholder,
                });
            }
        }

        // Check for extra placeholders
        for (const placeholder of translatedPlaceholders) {
            if (!sourcePlaceholders.has(placeholder)) {
                errors.push({
                    type: 'EXTRA_PLACEHOLDER',
                    message: `Unexpected placeholder: ${placeholder}`,
                    field: placeholder,
                });
            }
        }

        return errors;
    }

    /**
     * Validate semantic properties like length ratio
     */
    private validateSemantics(sourceUnit: SourceUnit, result: TranslationResult): ValidationWarning[] {
        const warnings: ValidationWarning[] = [];
        const maxLengthRatio = this.config.maxLengthRatio || 3;

        const sourceLength = sourceUnit.sourceText.length;
        const translatedLength = result.translatedText.length;
        const ratio = translatedLength / sourceLength;

        if (ratio > maxLengthRatio) {
            warnings.push({
                type: 'LENGTH_RATIO_EXCEEDED',
                message: `Translation is ${ratio.toFixed(1)}x longer than source (max: ${maxLengthRatio}x)`,
            });
        }

        return warnings;
    }

    /**
     * Detect if translation leaked source language
     */
    private detectSourceLeakage(sourceUnit: SourceUnit, result: TranslationResult): boolean {
        // Simple heuristic: check if translation is identical or very similar to source
        const normalizedSource = sourceUnit.sourceText.toLowerCase().trim();
        const normalizedTranslation = result.translatedText.toLowerCase().trim();

        if (normalizedSource === normalizedTranslation) {
            return true;
        }

        // Check for high similarity (>80% of words match)
        const sourceWords = new Set(normalizedSource.split(/\s+/));
        const translationWords = new Set(normalizedTranslation.split(/\s+/));

        let matchCount = 0;
        for (const word of sourceWords) {
            if (translationWords.has(word)) {
                matchCount++;
            }
        }

        const similarity = matchCount / sourceWords.size;
        return similarity > 0.8;
    }

    /**
     * Validate that brand names are preserved
     */
    private validateBrandNames(sourceUnit: SourceUnit, result: TranslationResult): ValidationWarning[] {
        const warnings: ValidationWarning[] = [];
        const brandNames = this.config.brandNames || [];

        for (const brandName of brandNames) {
            const sourceHasBrand = sourceUnit.sourceText.includes(brandName);
            const translationHasBrand = result.translatedText.includes(brandName);

            if (sourceHasBrand && !translationHasBrand) {
                warnings.push({
                    type: 'MISSING_BRAND_NAME',
                    message: `Brand name "${brandName}" not preserved in translation`,
                    field: brandName,
                });
            }
        }

        return warnings;
    }
}
