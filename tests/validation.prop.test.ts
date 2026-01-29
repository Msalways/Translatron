import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { TranslationValidationPipeline } from '../src/validation/index';

describe('Validation Pipeline Property Tests', () => {
    it('should pass structural validation for non-empty strings', async () => {
        const pipeline = new TranslationValidationPipeline({
            preservePlaceholders: false,
            maxLengthRatio: 10,
            preventSourceLeakage: false,
        });

        await fc.assert(
            fc.asyncProperty(fc.string({ minLength: 1 }), async (text) => {
                const result = await pipeline.validate(
                    { unitId: '1', translatedText: text, confidence: 1 },
                    { unitId: '1', keyPath: 'k', sourceText: 'source', sourceHash: 'h', placeholders: [], sourceFile: 'f', schemaVersion: 1 }
                );
                expect(result.isValid).toBe(true);
            })
        );
    });

    it('should fail structural validation for empty strings', async () => {
        const pipeline = new TranslationValidationPipeline({});
        const result = await pipeline.validate(
            { unitId: '1', translatedText: '', confidence: 1 },
            { unitId: '1', keyPath: 'k', sourceText: 'source', sourceHash: 'h', placeholders: ['{v}'], sourceFile: 'f', schemaVersion: 1 }
        );
        expect(result.isValid).toBe(false);
        expect(result.errors[0].message).toContain('Translation is empty');
    });

    it('should detect placeholder degradation', async () => {
        const pipeline = new TranslationValidationPipeline({
            preservePlaceholders: true,
        });

        await fc.assert(
            fc.asyncProperty(fc.string({ minLength: 1 }).map(s => s.replace(/[^a-z]/g, 'x')), async (placeholder) => {
                const p = `{${placeholder}}`;
                const sourceText = `Hello ${p}`;
                const result = await pipeline.validate(
                    { unitId: '1', translatedText: 'Bonjour', confidence: 1 },
                    { unitId: '1', keyPath: 'k', sourceText, sourceHash: 'h', placeholders: [p], sourceFile: 'f', schemaVersion: 1 }
                );
                expect(result.isValid).toBe(false);
                expect(result.errors[0].message).toContain('Missing placeholder');
            })
        );
    });
});
