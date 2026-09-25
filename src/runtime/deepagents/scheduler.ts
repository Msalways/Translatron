/**
 * Code-enforced concurrency scheduler (Epic 008, E5).
 *
 * Three semaphore layers plus per-provider caps:
 *   languages → batches-per-language → global model calls → provider calls
 *
 * Effective concurrency is `min(language, batch, global, provider)` (R&D §8).
 * The LLM never decides topology or parallelism — these counters do.
 * Every semaphore tracks its peak for tests (`observed()`).
 */
import type { ExecutionLimits } from '../../core/domain.js';

export class Semaphore {
    private activeCount = 0;
    private waiters: Array<() => void> = [];
    private peak = 0;

    constructor(readonly max: number) {
        if (!Number.isInteger(max) || max < 1) {
            throw new Error(`Semaphore max must be a positive integer, got ${max}`);
        }
    }

    get active(): number {
        return this.activeCount;
    }

    get maxObserved(): number {
        return this.peak;
    }

    async acquire(): Promise<() => void> {
        if (this.activeCount < this.max) {
            this.activeCount += 1;
            this.peak = Math.max(this.peak, this.activeCount);
            return () => this.release();
        }
        await new Promise<void>((resolve) => {
            this.waiters.push(resolve);
        });
        this.activeCount += 1;
        this.peak = Math.max(this.peak, this.activeCount);
        return () => this.release();
    }

    private release(): void {
        this.activeCount -= 1;
        const next = this.waiters.shift();
        if (next !== undefined) next();
    }

    async withLock<T>(fn: () => Promise<T>): Promise<T> {
        const release = await this.acquire();
        try {
            return await fn();
        } finally {
            release();
        }
    }
}

export interface SchedulerLimits {
    maxLanguages: number;
    maxBatchesPerLanguage: number;
    maxGlobalModelCalls: number;
    providerCaps?: Record<string, number>;
}

/** Provider prefix of a `"provider:model"` string (`openai` of `openai:gpt-5`). */
export function providerOfModel(model: string): string {
    const separator = model.indexOf(':');
    return separator > 0 ? model.substring(0, separator) : 'unknown';
}

/**
 * Effective model-call concurrency per R&D §8:
 * `min(language, batch, global, provider)`.
 */
export function effectiveModelConcurrency(limits: SchedulerLimits, provider?: string): number {
    const caps = [limits.maxLanguages, limits.maxBatchesPerLanguage, limits.maxGlobalModelCalls];
    if (provider !== undefined) {
        const providerCap = limits.providerCaps?.[provider];
        if (providerCap !== undefined) caps.push(providerCap);
    }
    return Math.min(...caps);
}

export class ConcurrencyScheduler {
    private readonly language: Semaphore;
    private readonly global: Semaphore;
    private readonly batches = new Map<string, Semaphore>();
    private readonly providers = new Map<string, Semaphore>();

    constructor(private readonly limits: SchedulerLimits) {
        this.language = new Semaphore(limits.maxLanguages);
        this.global = new Semaphore(limits.maxGlobalModelCalls);
    }

    static fromExecutionLimits(limits: ExecutionLimits): ConcurrencyScheduler {
        return new ConcurrencyScheduler({
            maxLanguages: limits.maxLanguages,
            maxBatchesPerLanguage: limits.maxBatchesPerLanguage,
            maxGlobalModelCalls: limits.maxGlobalModelCalls,
            ...(limits.providerCaps !== undefined ? { providerCaps: { ...limits.providerCaps } } : {}),
        });
    }

    private batchSemaphore(locale: string): Semaphore {
        let semaphore = this.batches.get(locale);
        if (semaphore === undefined) {
            semaphore = new Semaphore(this.limits.maxBatchesPerLanguage);
            this.batches.set(locale, semaphore);
        }
        return semaphore;
    }

    private providerSemaphore(provider: string): Semaphore {
        let semaphore = this.providers.get(provider);
        if (semaphore === undefined) {
            semaphore = new Semaphore(this.limits.providerCaps?.[provider] ?? this.limits.maxGlobalModelCalls);
            this.providers.set(provider, semaphore);
        }
        return semaphore;
    }

    /** One language branch at a time, up to `maxLanguages`. */
    withLanguageSlot<T>(fn: () => Promise<T>): Promise<T> {
        return this.language.withLock(fn);
    }

    /** Batches within one language, up to `maxBatchesPerLanguage`. */
    withBatchSlot<T>(locale: string, fn: () => Promise<T>): Promise<T> {
        return this.batchSemaphore(locale).withLock(fn);
    }

    /**
     * One model call: gated by the global cap AND the provider cap.
     * Repair/retry calls go through here too, so repair storms stay capped.
     */
    withModelCall<T>(provider: string, fn: () => Promise<T>): Promise<T> {
        return this.global.withLock(() => this.providerSemaphore(provider).withLock(fn));
    }

    /** Peak concurrency observed per layer (tests + diagnostics). */
    observed(): {
        languages: number;
        global: number;
        batches: Record<string, number>;
        providers: Record<string, number>;
    } {
        const batches: Record<string, number> = {};
        for (const [locale, semaphore] of this.batches) batches[locale] = semaphore.maxObserved;
        const providers: Record<string, number> = {};
        for (const [provider, semaphore] of this.providers) providers[provider] = semaphore.maxObserved;
        return {
            languages: this.language.maxObserved,
            global: this.global.maxObserved,
            batches,
            providers,
        };
    }
}
