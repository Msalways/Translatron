/**
 * DeepAgentRuntime — the framework behind the seam (Epic 005, C2).
 *
 * The ONLY module allowed to import `deepagents` / `@langchain/*`
 * (boundary-tested). Everything else sees `TranslationRuntime`.
 */
import type { RunPlan } from '../../core/domain.js';
import type { RuntimeContext, RuntimeEvent, TranslationRuntime } from '../runtime.js';
import { runLanguagesParallel, type SupervisorDeps } from './supervisor.js';

export class DeepAgentRuntime implements TranslationRuntime {
    constructor(private readonly deps: SupervisorDeps = {}) {}

    execute(plan: RunPlan, context: RuntimeContext): AsyncIterable<RuntimeEvent> {
        return runLanguagesParallel(plan, context, this.deps);
    }
}
