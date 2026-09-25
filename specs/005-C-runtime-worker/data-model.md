# Data Model: Deep Agents Runtime + Language Worker

**Epic**: 005-C-runtime-worker | **Source**: `src/runtime/`

| Item | Shape | Notes |
|---|---|---|
| `TranslationRuntime` | `{ execute(plan, ctx): AsyncIterable<RuntimeEvent> }` | the seam; stable into Epic 008 |
| `RuntimeContext` | { runId, sourceLocale, model, fallbackModels, materials, maxRepairAttempts } | materials = skills+glossary+examples per locale |
| `LocaleMaterial` | { locale, skills: [{id, content}], glossary, examples } | Epics 007/009 fill these |
| `RuntimeEvent` | run-started / language-started / batch-started / batch-completed / language-completed / language-failed / run-completed | normalized; CLI never sees framework events |
| `BatchTranslation` | { unitId, text } | compiler validates before write |
| `ResolvedModels` | { model, fallbackModels } | `"type:model"` strings; cycle-safe legacy chains |
| `RETRY_BUDGETS` | { modelRetry: 3, repair: 2, review: 1 } | code-enforced |
| `WorkerResponse` | { translations: [{ unitId, text }] } | `toolStrategy` wrapper at framework edge |

New deps: `deepagents`, `@langchain/langgraph`, `@langchain/core`, `langchain`.
