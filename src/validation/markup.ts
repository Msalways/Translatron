/**
 * Markup preservation validator (Epic 006, F4).
 *
 * When the source contains markup (HTML/XML/React-like tags), the target
 * must contain the same tag-name multiset — translations may reorder words
 * but must not drop, invent, or rename tags. Plain-text sources skip
 * silently (no false positives on `<3` style prose).
 */
import type { ValidationError } from './issues.js';

const TAG_PATTERN = /<\/?([A-Za-z][A-Za-z0-9:_.-]*)(\s[^<>]*)?\/?>/g;

export function extractTagNames(text: string): string[] {
    const names: string[] = [];
    for (const match of text.matchAll(TAG_PATTERN)) {
        names.push(match[1].toLowerCase());
    }
    return names.sort();
}

export interface MarkupCheck {
    sourceText: string;
    translatedText: string;
    keyPath: string;
}

export function validateMarkup(check: MarkupCheck): ValidationError[] {
    const expected = extractTagNames(check.sourceText);
    if (expected.length === 0) return [];
    const actual = extractTagNames(check.translatedText);
    const errors: ValidationError[] = [];
    const remaining = [...actual];
    for (const tag of expected) {
        const index = remaining.indexOf(tag);
        if (index < 0) {
            errors.push({
                type: 'MARKUP_MISMATCH',
                message: `Missing <${tag}> in ${check.keyPath}`,
                field: check.keyPath,
            });
        } else {
            remaining.splice(index, 1);
        }
    }
    for (const tag of remaining) {
        errors.push({
            type: 'MARKUP_MISMATCH',
            message: `Unexpected <${tag}> in ${check.keyPath}`,
            field: check.keyPath,
        });
    }
    return errors;
}
