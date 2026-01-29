import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { extractPlaceholders, generateUnitId, computeHash } from '../src/utils/hash';

describe('Hash and Placeholder Property Tests', () => {
    it('should generate consistent unit IDs for the same key and file', () => {
        fc.assert(
            fc.property(fc.string(), fc.string(), (key, file) => {
                const id1 = generateUnitId(key, file);
                const id2 = generateUnitId(key, file);
                expect(id1).toBe(id2);
                expect(id1.length).toBe(16);
            })
        );
    });

    it('should extract common placeholder formats', () => {
        const placeholderFormats = [
            (v: string) => `{${v}}`,
            (v: string) => `{{${v}}}`,
            (v: string) => `\${${v}}`,
        ];

        fc.assert(
            fc.property(fc.string({ minLength: 1, maxLength: 20 }), fc.integer({ min: 0, max: 2 }), (varName, formatIdx) => {
                // Ensure varName doesn't contain characters that break the format
                const safeVar = varName.replace(/[^a-zA-Z0-9_]/g, 'x');
                if (safeVar.length === 0) return true;

                const placeholder = placeholderFormats[formatIdx](safeVar);
                const text = `This is a ${placeholder} test.`;
                const extracted = extractPlaceholders(text);

                expect(extracted).toContain(placeholder);
            })
        );
    });

    it('should generate the same hash for identical content', () => {
        fc.assert(
            fc.property(fc.string(), (content) => {
                expect(computeHash(content)).toBe(computeHash(content));
            })
        );
    });
});
