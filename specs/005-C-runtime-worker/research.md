# Research: Deep Agents Runtime + Language Worker

**Date**: 2026-09-21 | **Epic**: 005-C-runtime-worker

## Framework surface (installed: deepagents 1.14, @langchain/* 1.x, langchain 1.5)

- `createDeepAgent({ model: string, systemPrompt, tools, responseFormat })` —
  model as `"provider:model"` string; agent has `.invoke({messages})`.
- `responseFormat` requires a strategy wrapper: raw zod is rejected by types.
  Used `toolStrategy(schema)` from `langchain` (declared direct dep; accepts
  interop zod v3 schemas). `structuredResponse` read defensively with a
  last-message JSON fallback — `extractWorkerResponse` covers both.
- `createFilesystemMiddleware({ tools: [...] })` exists but is NOT used:
  workers get six hand-built read-only tools instead (no fs mutation at all).
- Installed `zod` stays v3; deepagents types import `zod/v4` types only —
  interop accepted by tsc.

## Decisions

1. Retry-in-code (`withRetry`, transient matchers) rather than framework
   middleware: deterministic, testable without models, no middleware API lock-in.
2. `StubRuntime` mirrors the event stream exactly so compiler/orchestration
   tests never need keys or network.
3. Supervisor is sequential in this epic; LangGraph fan-out arrives in Epic 008
   (the `TranslationRuntime` seam is unchanged by that).
4. `runLanguagesSequential` accepts injected `createWorker` — agent-contract
   tests inject fakes; only `createLanguageWorker` touches the framework.
5. **Live-model dependency (found 2026-09-24)**: `createDeepAgent({model:
   "openai:..."})` resolves via LangChain `initChatModel`, which dynamically
   imports `@langchain/openai` — not previously installed, so every live v3
   run would have crashed at model init (all tests inject fakes, hence
   undetected). Added as a direct dependency. Provider credentials for the
   agent path come from env only (`OPENAI_API_KEY`, `OPENAI_BASE_URL` /
   `OPENAI_API_BASE` honored by ChatOpenAI); per-config `apiKey`/`baseUrl`
   do NOT cross the `TranslationRuntime` seam (worker receives the model
   string alone). NVIDIA works through the OpenAI-compatible endpoint.
