/**
 * Retry policy as code (Epic 005 middleware).
 *
 * Transient provider failures (429/5xx/timeouts) retry with backoff inside
 * `modelRetry` budget; the fallback chain rotates per attempt. Deterministic
 * failures (validation, schema) never retry here — they route to the Epic 006
 * repair flow instead.
 */
export const RETRY_BUDGETS = {
    /** Model/invoke retries for transient failures. */
    modelRetry: 3,
    /** Translation repair attempts per batch (Epic 006). */
    repair: 2,
    /** Reviewer escalations per batch (Epic 006). */
    review: 1,
} as const;

const TRANSIENT_PATTERNS = [
    /\b429\b/,
    /rate.?limit/i,
    /\b5\d\d\b/,
    /timeout|timed out/i,
    /econnreset|econnrefused|enotfound|socket hang up/i,
    /overloaded|try again|temporarily unavailable/i,
];

export function isTransientError(error: unknown): boolean {
    const text = error instanceof Error ? `${error.message} ${(error as { code?: unknown }).code ?? ''}` : String(error);
    return TRANSIENT_PATTERNS.some((pattern) => pattern.test(text));
}

export interface RetryOptions {
    maxRetries?: number;
    baseDelayMs?: number;
    sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Run fn with exponential backoff on transient errors only. */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
    const maxRetries = options.maxRetries ?? RETRY_BUDGETS.modelRetry;
    const sleep = options.sleep ?? defaultSleep;
    let attempt = 0;
    for (;;) {
        try {
            return await fn();
        } catch (error) {
            if (!isTransientError(error) || attempt >= maxRetries) throw error;
            attempt += 1;
            await sleep((options.baseDelayMs ?? 200) * 2 ** (attempt - 1));
        }
    }
}
