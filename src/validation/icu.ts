/**
 * ICU MessageFormat validator (Epic 006, F3).
 *
 * Two layers:
 *  1. Syntax: braces balance; `{arg, type, ...}` blocks use a known type and
 *     every plural/select block provides an `other` branch.
 *  2. Skeleton match: the target must declare the same argument skeleton
 *     (names + types, order-insensitive) as the source — a translation may
 *     reorder or reword branches but must not drop or invent arguments.
 *
 * This is a strict subset check, not a full ICU parser: anything the
 * skeleton extractor cannot parse is reported, never silently accepted.
 */
import type { ValidationError } from './issues.js';

const KNOWN_TYPES = new Set(['plural', 'select', 'selectordinal', 'number', 'date', 'time']);

export interface IcuSkeleton {
    args: Array<{ name: string; type: string }>;
}

function fail(keyPath: string, message: string): ValidationError {
    return { type: 'ICU_MISMATCH', message: `${message} in ${keyPath}`, field: keyPath };
}

/** Split top-level comma parts of `{...}` respecting nested braces. */
function splitTopLevel(inner: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = '';
    for (const char of inner) {
        if (char === '{') depth += 1;
        else if (char === '}') depth -= 1;
        if (char === ',' && depth === 0) {
            parts.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    parts.push(current);
    return parts.map((p) => p.trim());
}

/** Extract top-level `{...}` blocks with balance checking. */
function topLevelBlocks(text: string): { blocks: string[]; balanced: boolean } {
    const blocks: string[] = [];
    let depth = 0;
    let start = -1;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '{') {
            if (depth === 0) start = i;
            depth += 1;
        } else if (char === '}') {
            depth -= 1;
            if (depth < 0) return { blocks, balanced: false };
            if (depth === 0 && start >= 0) {
                blocks.push(text.substring(start, i + 1));
                start = -1;
            }
        }
    }
    return { blocks, balanced: depth === 0 };
}

/** Parse one `{arg, type, options}` block; returns null when malformed. */
function parseBlock(block: string): { name: string; type: string; hasOther: boolean } | null {
    const inner = block.substring(1, block.length - 1);
    const parts = splitTopLevel(inner);
    if (parts.length < 2) return { name: parts[0] ?? '', type: 'simple', hasOther: true };
    const name = parts[0];
    const type = parts[1];
    if (name === '' || type === '') return null;
    if (!KNOWN_TYPES.has(type)) return null;
    if (parts.length === 2) return { name, type, hasOther: true };
    const optionsText = parts.slice(2).join(',');
    const hasOther = /(^|[\s{])other\s*\{/.test(optionsText);
    return { name, type, hasOther };
}

export function extractIcuSkeleton(text: string, keyPath: string): { skeleton: IcuSkeleton; errors: ValidationError[] } {
    const errors: ValidationError[] = [];
    const args: IcuSkeleton['args'] = [];
    const { blocks, balanced } = topLevelBlocks(text);
    if (!balanced) {
        errors.push(fail(keyPath, 'Unbalanced braces'));
        return { skeleton: { args }, errors };
    }
    for (const block of blocks) {
        const parsed = parseBlock(block);
        if (parsed === null) {
            errors.push(fail(keyPath, `Malformed ICU block ${block}`));
            continue;
        }
        if ((parsed.type === 'plural' || parsed.type === 'select' || parsed.type === 'selectordinal') && !parsed.hasOther) {
            errors.push(fail(keyPath, `Missing 'other' branch in ${block}`));
        }
        args.push({ name: parsed.name, type: parsed.type });
    }
    return { skeleton: { args }, errors };
}

export interface IcuCheck {
    sourceText: string;
    translatedText: string;
    keyPath: string;
}

/** Validate target ICU syntax + skeleton match against the source. */
export function validateIcu(check: IcuCheck): ValidationError[] {
    const source = extractIcuSkeleton(check.sourceText, check.keyPath);
    const target = extractIcuSkeleton(check.translatedText, check.keyPath);
    const errors: ValidationError[] = [...target.errors];
    if (source.errors.length > 0) {
        // A broken source is a content problem, not a translation failure.
        return errors;
    }
    const expected = new Map(source.skeleton.args.map((a) => [`${a.name}:${a.type}`, a]));
    const actual = new Map(target.skeleton.args.map((a) => [`${a.name}:${a.type}`, a]));
    for (const key of expected.keys()) {
        if (!actual.has(key)) {
            errors.push(fail(check.keyPath, `Missing ICU argument ${key}`));
        }
    }
    for (const key of actual.keys()) {
        if (!expected.has(key)) {
            errors.push(fail(check.keyPath, `Unexpected ICU argument ${key}`));
        }
    }
    return errors;
}

/** True when either side contains ICU-like `{...}` blocks. */
export function containsIcu(text: string): boolean {
    return topLevelBlocks(text).blocks.length > 0;
}
