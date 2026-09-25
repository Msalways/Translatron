# Translatron vNext — Deep Agents R&D Architecture

## 1. Product Definition

Translatron vNext becomes:

> **A Git-native, agentic localization compiler that translates incrementally across many languages in parallel, preserves human ownership and provenance, supports optional Markdown language/domain skills, requires no Translatron server, and remains deterministic enough for CI.**

Core promises:

```text
No runtime application dependency
No required localization server
No SQLite shared-state problem
No mandatory Translatron account

Git-native team state
Agentic translation/recovery
Parallel languages
Optional SKILL.md expertise
Translation provenance
Translation memory
Deterministic CI validation
Migration from current Translatron
```

---

## 2. Architecture Boundary

The overall architecture should be:

```text
                        CLI

                         │
                         ▼
              ┌────────────────────┐
              │ Project Discovery  │
              │ Config Resolution  │
              └─────────┬──────────┘
                        │
                        ▼
              ┌────────────────────┐
              │ Catalog Adapters   │
              │ source + targets   │
              └─────────┬──────────┘
                        │
                        ▼
              ┌────────────────────┐
              │ Reconciliation     │
              │ deterministic      │
              └─────────┬──────────┘
                        │
               ┌────────┴─────────┐
               ▼                  ▼
       Shared Registry       Skill Resolver
       Git-native            Markdown/SKILL.md
               │                  │
               └────────┬─────────┘
                        ▼
                Deterministic Plan
                        │
                        ▼
           ┌────────────────────────┐
           │ Supervisor Deep Agent  │
           └────────────┬───────────┘
                        │
            dispatch_language_jobs
                        │
        ┌───────────────┼────────────────┐
        ▼               ▼                ▼
      ja-JP           de-DE            fr-FR
      worker          worker           worker
        │               │                │
     batches          batches          batches
        │               │                │
        └───────────────┼────────────────┘
                        ▼
                deterministic validation
                        │
                ┌───────┴─────────┐
                ▼                 ▼
              PASS              FAILURE
                │                 │
                │          Supervisor repair
                │                 │
                └───────┬─────────┘
                        ▼
                   Atomic writer
                        │
                        ▼
                   Git registry
```

Deep Agents should **not** discover what is missing, determine whether something is manual, or decide which files to modify.

Those are compiler responsibilities.

---

## 3. What We Should Use From Deep Agents

Deep Agents should be used as a reasoning/orchestration harness rather than a replacement for Translatron’s domain logic.

### Modules/capabilities to reuse

| Capability | Use | Translatron responsibility |
|---|---|---|
| `createDeepAgent` | Supervisor and translation worker agents | Wrap behind `AgentRuntime` |
| Skills | Load `SKILL.md` progressively | Decide applicable language/domain skill paths |
| Subagents | Reviewer/research/repair specialization | Decide when delegation is permitted |
| Filesystem middleware | Read skill resources/context | Restrict permissions aggressively |
| Summarization | Long complex agent runs | Probably unnecessary for normal batches |
| LangGraph | Fan-out/fan-in orchestration | Define Translatron workflow |
| Checkpoint API | Recover interrupted run execution | Do **not** confuse with translation registry |
| Streaming | CLI progress | Normalize events to Translatron events |
| Model abstraction | Multiple providers | Translatron config → model runtime |
| Retry middleware | Provider/transient failures | Define retry policy |
| Model fallback | Provider/model fallback | Define approved fallback chain |
| HITL/interrupt | Optional manual review | CLI interactive mode only |
| Tool/model-call limits | Cost control | Expose safe config defaults |

---

## 4. What We Should NOT Delegate to Deep Agents

These should remain pure deterministic TypeScript:

```text
catalog discovery
catalog parsing
key normalization
source hashing
target hashing

translation completeness
missing key detection
orphan detection

manual edit detection
translation ownership
registry reconciliation

skill applicability
locale inheritance

batch construction
token-budget batching

placeholder validation
ICU validation
HTML/tag validation

atomic writes

registry serialization
Git synchronization

migration
CI exit codes
```

Agentic reasoning should operate inside a deterministic envelope.

---

## 5. Agent Runtime Abstraction

Do not make `deepagents` part of Translatron's public API.

```ts
export interface TranslationRuntime {
  execute(
    plan: RuntimePlan,
    context: RuntimeContext
  ): AsyncIterable<RuntimeEvent>;
}
```

Implementation:

```text
TranslationRuntime
        │
        └── DeepAgentRuntime
```

The rest of Translatron should not know about:

```text
DeepAgentState
LangGraph messages
task tools
middleware internals
LangGraph channels
```

This protects the public API if the framework changes later.

---

## 6. Supervisor Architecture

The supervisor should be one Deep Agent, but it should **not personally execute every language**.

Give it constrained tools:

```ts
dispatchLanguageJobs(...)
inspectLanguageFailure(...)
retryLanguageBatch(...)
requestRepair(...)
requestReview(...)
finalizeRun(...)
```

It receives:

```ts
interface RunPlan {
  runId: string;

  languages: LanguagePlan[];

  totalUnits: number;

  limits: ExecutionLimits;

  policy: RunPolicy;
}
```

Supervisor responsibility:

```text
understand plan
      ↓
dispatch independent work
      ↓
observe summarized outcomes
      ↓
deal only with exceptions
      ↓
finalize
```

---

## 7. Programmatic Parallelism Under Agent Supervision

Do not rely on the LLM to emit one task call per language correctly every time.

Instead, expose a single deterministic tool:

```text
dispatch_language_jobs
```

and let Translatron itself fan out the language work through LangGraph.

```text
Supervisor

    │
    ▼

dispatch_language_jobs(plan)

    │
    ├──────── ja-JP ────────┐
    ├──────── de-DE ────────┤
    ├──────── fr-FR ────────┤
    ├──────── es-ES ────────┤
    └──────── ko-KR ────────┤
                             │
                             ▼
                          aggregate
```

This preserves a supervised architecture without making concurrency depend on model behavior.

---

## 8. Concurrency Model

There should be three concurrency limits:

```ts
execution: {
  maxLanguages: 4,
  maxBatchesPerLanguage: 2,
  maxGlobalModelCalls: 8
}
```

Optionally:

```ts
providers: {
  openai: {
    maxConcurrency: 6
  },

  anthropic: {
    maxConcurrency: 4
  }
}
```

Effective concurrency becomes:

```text
min(
    language concurrency,
    batch concurrency,
    global concurrency,
    provider concurrency
)
```

This must be enforced by code, not by the LLM.

---

## 9. Language Worker

Do not hardcode one class per language.

Use a worker factory:

```ts
createLanguageWorker({
  locale: "ja-JP",
  skills: [...],
  glossary,
  model,
  tools
})
```

Example workload:

```text
Translate batch B-17

Source locale: en-GB
Target locale: ja-JP

18 source units.

Applicable skills:
- global
- ja
- ja-JP
- checkout

Use provided translation memory and glossary.
Return structured translations keyed by unitId.
```

---

## 10. Skills Architecture

Skills are optional.

Zero skills:

```text
Translatron core policy
```

is a valid project.

Advanced layout:

```text
translatron/
  skills/

    global/
      SKILL.md

    languages/
      ja/
        SKILL.md

      ja-JP/
        SKILL.md

      de-DE/
        SKILL.md

    domains/
      ecommerce/
        SKILL.md

      legal/
        SKILL.md
```

---

## 11. Skill Resolution

Translatron should resolve obvious language skills itself.

Example:

```text
target = pt-BR
```

becomes:

```text
global
  +
pt
  +
pt-BR
  +
matching domain skills
```

Do not make an LLM decide whether `pt-BR` should load Portuguese instructions.

Skill selection should be:

```text
deterministic wherever possible
agent-assisted only when semantic selection is necessary
```

---

## 12. Project Markdown as Skills

Support both:

```text
SKILL.md packages
```

and ordinary Markdown references.

Example:

```ts
skills: {
  paths: [
    "./translatron/skills/**/SKILL.md",
    "./docs/localization-guidelines.md"
  ]
}
```

This lets mature teams reuse existing localization guidance.

---

## 13. Skill Fingerprinting

Every applied skill must affect provenance.

```ts
interface AppliedSkill {
  id: string;
  scope: string;
  fingerprint: string;
}
```

Registry example:

```text
checkout.payNow / ja-JP

skills:
  global     fd92...
  ja         10be...
  ja-JP      a813...
  ecommerce  c71d...
```

If `ja-JP/SKILL.md` changes, only translations produced with the old Japanese fingerprint become:

```text
SKILL_STALE
```

They should **not** be overwritten automatically.

---

## 14. Translation Memory

The registry gives Translatron an exact TM.

Before asking an agent:

```text
source fingerprint
+ target locale
+ compatible context
```

lookup.

If exact accepted translation exists:

```text
TM HIT
   ↓
validate
   ↓
reuse
```

No LLM call.

Future fuzzy TM can come later.

---

## 15. Registry Architecture

Canonical state should be a Git-synchronized immutable registry.

Not one giant:

```text
registry.json
```

Not:

```text
registry.sqlite
```

And not one JSON file per key.

Recommended structure:

```text
translatron/registry branch

segments/
  01ABC.trn
  01ABD.trn
  01ABE.trn

snapshots/
  01XYZ.trnsnapshot
```

A run creates one immutable segment.

---

## 16. Registry Record

```ts
interface TranslationRevision {
  id: string;

  catalogId: string;
  keyPath: string;

  sourceLocale: string;
  targetLocale: string;

  sourceHash: string;
  targetHash: string;

  origin:
    | "agent"
    | "human"
    | "imported";

  parentIds: string[];

  model?: string;
  provider?: string;

  corePolicyFingerprint?: string;
  skillFingerprints?: AppliedSkill[];
  glossaryFingerprint?: string;
  contextFingerprint?: string;

  runId: string;

  createdAt: string;
}
```

Retries/tool events do not all need permanent storage.

Registry data should focus on durable translation lineage.

---

## 17. Derived State Model

`status` should mostly become derived state.

The reconciler compares:

```text
source
+
current target
+
latest relevant registry revisions
```

and derives:

| State | Meaning |
|---|---|
| `NEW` | Source exists, target does not |
| `UNTRACKED` | Translation exists but no provenance |
| `CLEAN` | Target matches accepted registry revision |
| `MANUAL` | Target differs from last agent-owned revision |
| `SOURCE_STALE` | Source changed after translation |
| `SKILL_STALE` | Relevant skills changed |
| `CONTEXT_STALE` | Context changed |
| `TARGET_DELETED` | Tracked target removed |
| `ORPHANED` | Source key removed |
| `FAILED` | Latest attempted generation failed |
| `CONFLICT` | Competing human/revision branches |
| `NEEDS_REVIEW` | Policy requires human decision |

---

## 18. Deterministic Planner

Planner flow:

```text
catalog reconciliation
        ↓
derive states
        ↓
apply project policy
        ↓
translation work units
        ↓
group by:
    target locale
    skill fingerprint
    glossary fingerprint
    context class
        ↓
batch by tokens
```

The plan is immutable for the run.

Agents execute it.

They should not rewrite it arbitrarily.

---

## 19. Agentic Planning

There should be two kinds of planning.

### Compiler planning

Always deterministic:

```text
what needs translation?
which languages?
which skills?
which batches?
```

### Agent planning

Only for complex linguistic work:

```text
legal terminology ambiguity
conflicting skill instructions
repeated validation failure
difficult ICU message
strict space constraints
domain research
```

---

## 20. Normal Execution Path

```text
NEW unit
   ↓
TM lookup
   ↓
TM MISS
   ↓
language worker
   ↓
structured translation
   ↓
validator
   ↓
PASS
   ↓
stage output
```

One model operation.

No reviewer.

No supervisor reasoning.

---

## 21. Recovery Execution Path

```text
worker translation
        ↓
validator
        ↓
PLACEHOLDER_MISMATCH
        ↓
failure returned to supervisor
        ↓
repair request
        ↓
worker receives:
"Missing {count}"
        ↓
repair
        ↓
validation
```

Agentic reasoning is used to solve a concrete failure.

---

## 22. Reviewer Subagent

Reviewer should be opt-in or escalation-only.

Use when:

```text
two repairs failed
semantic ambiguity
legal policy
high-risk project rule
translation policy explicitly requires review
```

Do not review every string.

---

## 23. Tools for Translation Agents

Expose only narrow tools:

```text
lookup_translation_memory
lookup_glossary
get_key_context
get_related_translations
get_skill_resource
request_clarification
```

Workers should **not** receive:

```text
git push
delete file
write arbitrary application file
modify registry directly
```

---

## 24. Structured Result

Do not use positional arrays.

Instead of:

```json
[
  "Connexion",
  "Déconnexion"
]
```

use:

```json
{
  "translations": [
    {
      "unitId": "u-193",
      "text": "Connexion"
    },
    {
      "unitId": "u-194",
      "text": "Déconnexion"
    }
  ]
}
```

Validator must verify:

```text
all requested IDs returned
no unknown IDs
no duplicate IDs
all values strings
```

before touching files.

---

## 25. Deterministic Validators

The agent should never be the only validator.

Core validators:

```text
result schema
placeholder preservation
ICU/message syntax
HTML/XML tags
empty output
forbidden transformations
length rules
key coverage
target structure
```

Optional AI quality evaluation can come later.

---

## 26. File Writes

Workers never write catalogs directly.

They return results.

Compiler:

```text
all accepted translations
        ↓
stage in memory
        ↓
one write per target catalog
        ↓
temp file
        ↓
validate complete file
        ↓
atomic rename
```

---

## 27. Partial Success

Parallel languages require explicit partial-success semantics.

Example:

```text
French     COMPLETE
German     COMPLETE
Spanish    COMPLETE
Japanese   FAILED
Korean     COMPLETE
```

Overall run:

```text
PARTIAL_SUCCESS
```

Do not discard successful languages because one locale failed.

Retry:

```bash
translatronx retry --lang ja-JP
```

---

## 28. CLI UX Model

The UX should always answer:

```text
What is happening?
What has completed?
Does the developer need to do anything?
```

---

## 29. `sync` UX

Example:

```text
$ translatronx sync

Translatron

Source
  en-GB
  1,842 keys

Targets
  fr-FR
  de-DE
  ja-JP
  es-ES

Changes
  23 new
   4 source changed
   2 skill stale

Translation memory
  11 exact matches

Work required
  18 source units
  72 language translations

Starting 4 language workers...

fr-FR  ████████████████████  18/18  ✓
de-DE  ████████████████████  18/18  ✓
ja-JP  ███████████████░░░░░  14/18  repairing 1
es-ES  ████████████████████  18/18  ✓
```

Then:

```text
Completed

fr-FR  ✓ 18
de-DE  ✓ 18
es-ES  ✓ 18
ja-JP  ✓ 18 (1 repaired)

TM reused        11
LLM translated   61
Repairs           1
Failed            0

Files updated
  locales/fr-FR.json
  locales/de-DE.json
  locales/es-ES.json
  locales/ja-JP.json
```

---

## 30. Language Completion Events

Create a normalized internal event stream:

```ts
type TranslatronEvent =
  | RunStarted
  | PlanningCompleted
  | LanguageQueued
  | LanguageStarted
  | BatchStarted
  | BatchCompleted
  | ValidationFailed
  | RepairStarted
  | RepairCompleted
  | LanguageCompleted
  | LanguageFailed
  | CatalogWritten
  | RegistryUpdated
  | RunCompleted;
```

The Deep Agent/LangGraph streaming API should feed into this adapter.

CLI should never directly understand LangGraph events.

---

## 31. JSON Output Mode

CI needs a machine-readable mode:

```bash
translatronx sync --json
```

Example:

```json
{
  "runId": "run_...",
  "status": "partial_success",
  "languages": {
    "fr-FR": {
      "status": "complete",
      "translated": 18
    },
    "ja-JP": {
      "status": "failed",
      "translated": 14,
      "failed": 4
    }
  }
}
```

---

## 32. Better Configuration UX

Configuration should have three levels.

### Level 1 — zero/minimal config

```ts
export default defineConfig({
  sourceLocale: "en-GB",

  locales: [
    "fr-FR",
    "de-DE",
    "ja-JP"
  ]
});
```

Environment determines model credentials.

### Level 2 — normal project

```ts
export default defineConfig({
  sourceLocale: "en-GB",

  locales: [
    "fr-FR",
    "de-DE",
    "ja-JP"
  ],

  model: "openai:gpt-5",

  skills: {
    paths: [
      "./translatron/skills"
    ]
  },

  execution: {
    maxLanguages: 4,
    maxGlobalModelCalls: 8
  }
});
```

### Level 3 — advanced

```ts
export default defineConfig({
  // ...

  agents: {
    supervisor: {...},
    translation: {...},
    repair: {...},
    reviewer: {...}
  },

  registry: {...},

  policies: {...}
});
```

Most developers should never need Level 3.

---

## 33. `doctor`

Add:

```bash
translatronx doctor
```

Example:

```text
Project

✓ Source catalog detected
  locales/en-GB.json

✓ 4 target catalogs detected

✓ Provider credentials found

✓ Registry remote accessible

✓ 3 project skills
✓ ja-JP language skill
✓ de-DE language skill

! fr-FR has no language-specific skill
  This is optional.

✓ CI-compatible configuration

Ready.
```

---

## 34. `check`

`check` stays deterministic:

```bash
translatronx check
```

No LLM.

No agent.

No writes.

Example:

```text
Translation validation failed

checkout.payNow

  fr-FR   ✓
  de-DE   ✓
  ja-JP   MISSING
  es-ES   ✓

account.delete.confirmation

  de-DE   placeholder `{name}` missing

2 issues
```

Exit non-zero.

---

## 35. `status`

`status` becomes provenance-oriented.

```text
$ translatronx status

Keys                         1,842
Translations                 7,368

Agent generated              6,101
Imported                     1,021
Human owned                    246

Clean                        7,301
Skill stale                     32
Source stale                    14
Needs review                     6
Failed                           15
```

---

## 36. `explain`

Add:

```bash
translatronx explain checkout.payNow --lang ja-JP
```

Output:

```text
checkout.payNow
Target: ja-JP

Current state
  CLEAN

Source
  Pay now

Origin
  agent

Applied skills
  global@73aa
  ja@b51c
  ja-JP@7fc1
  ecommerce@f89d

Model
  ...

Translation memory
  no exact reuse

Validation
  placeholders   pass
  structure      pass

Revision
  tr_01...
```

---

## 37. Registry Conflict UX

Do not expose raw Git conflicts.

Show semantic conflicts:

```text
Translation conflict

auth.login / fr-FR

Two human revisions exist for the same source:

1. Se connecter
2. Connexion au compte

Current file:
Se connecter

Use current file as resolution?

  Y confirm
  n cancel
```

Then record a resolution revision.

---

## 38. Skill Change UX

```text
$ translatronx status

Skill changed
  languages/ja-JP/SKILL.md

437 translations were generated using
the previous skill fingerprint.

No translations were modified automatically.

Run:

  translatronx sync --affected-by-skill ja-JP
```

---

## 39. Migration UX

Current users need a first-class migration command.

```bash
translatronx migrate
```

Dry run by default.

It reads:

```text
old SQLite
source catalogs
target catalogs
legacy config
```

Example:

```text
Translatron 2 → 3 migration

Source keys              4,280
Translations            12,411

Agent/LLM tracked         8,803
Manual                    1,126
Imported/unknown          2,456
Failed                       26

Database/file mismatch       14

No changes made.
```

Then:

```bash
translatronx migrate --apply
```

---

## 40. Backward Compatibility

Keep:

```text
sync
check
status
retry
import
context
```

through the migration period.

Old:

```ts
prompts: {
  formatting,
  glossary,
  brandVoice,
  customContext
}
```

normalizes internally into:

```text
legacy project skill
+
glossary layer
```

Old provider config normalizes to the new model runtime.

`ledgerPath` becomes deprecated.

Existing locale files remain unchanged.

---

## 41. Traceability Model

Every requirement should receive a stable ID.

Recommended categories:

```text
CORE
REG
AGENT
SKILL
PAR
VAL
CLI
UX
MIG
COMPAT
PERF
SEC
TEST
```

---

## 42. Requirements Traceability Matrix

| ID | Requirement | Architecture |
|---|---|---|
| CORE-01 | Detect new/missing translations deterministically | Reconciler |
| CORE-02 | Preserve manual edits | Reconciler + registry |
| REG-01 | Team-shared provenance | Git registry |
| REG-02 | No SQLite canonical dependency | Registry segments |
| REG-03 | Rebuild disposable local indexes | Registry snapshot |
| AGENT-01 | Use Deep Agents runtime | AgentRuntime |
| AGENT-02 | Agent handles linguistic reasoning only | Compiler boundary |
| SKILL-01 | Optional Markdown skills | Skill resolver |
| SKILL-02 | Optional locale skills | Locale hierarchy |
| SKILL-03 | Track skill fingerprints | Registry |
| PAR-01 | Translate languages concurrently | LangGraph fan-out |
| PAR-02 | One supervisor oversees run | Supervisor Deep Agent |
| PAR-03 | Global/provider concurrency limits | Scheduler |
| VAL-01 | Deterministic validation | Validator pipeline |
| VAL-02 | Agentic repair after deterministic failure | Repair flow |
| CLI-01 | CI-safe `check` | CLI |
| CLI-02 | Machine-readable output | Event/report layer |
| UX-01 | Language-level progress | Event stream |
| UX-02 | Explain translation provenance | `explain` |
| MIG-01 | Migrate v2 SQLite | Migrator |
| COMPAT-01 | Read v2 config | Config adapter |
| PERF-01 | TM before model call | TM index |
| SEC-01 | Restrict agent filesystem/tools | Agent sandbox |

---

# Deep Task Breakdown

## Epic A — Architecture Foundation

### A1 — Define canonical domain model

Traceability: `CORE-01`, `CORE-02`, `REG-01`

Deliver:

```text
TranslationIdentity
TranslationRevision
SourceUnit
TargetSnapshot
ReconciledTranslation
RunPlan
LanguagePlan
TranslationWorkUnit
```

Acceptance:

- domain types contain no Deep Agents types;
- no SQLite types leak into v3 core.

### A2 — Implement reconciliation engine

Traceability: `CORE-01`, `CORE-02`

Implement states:

```text
NEW
UNTRACKED
CLEAN
MANUAL
SOURCE_STALE
SKILL_STALE
CONTEXT_STALE
TARGET_DELETED
ORPHANED
CONFLICT
FAILED
```

Tests required for every transition.

### A3 — Build catalog abstraction

```ts
interface CatalogAdapter {
  discover(...): Promise<Catalog[]>;
  read(...): Promise<NormalizedCatalog>;
  write(...): Promise<void>;
}
```

Initial adapter:

```text
generic-json
```

---

## Epic B — Git Registry

### B1 — Registry format specification

Traceability: `REG-01`, `REG-02`

Define versioned `.trn` segment format.

### B2 — Immutable revision writer

Create one segment per successful/partial run.

### B3 — Registry reader/indexer

Build:

```text
identity → revision graph
```

in memory/local disposable cache.

### B4 — Git synchronization

Implement:

```text
fetch
read remote head
merge additive records
push
retry on non-fast-forward
```

No human Git conflict.

### B5 — Snapshot/compaction

Periodically compact registry state.

### B6 — Corruption recovery

Verify segment checksum.

Ignore/recover incomplete local cache.

Never silently discard durable revision.

---

## Epic C — Deep Agents Runtime

### C1 — Introduce `TranslationRuntime`

Traceability: `AGENT-01`

No Deep Agents references outside runtime package.

### C2 — Implement `DeepAgentRuntime`

Use Deep Agents behind the runtime boundary.

### C3 — Core system policy

Create immutable Translatron policy.

Users cannot replace it.

### C4 — Structured translation response

Replace positional response handling.

### C5 — Model resolver

```text
legacy provider config
      ↓
new model runtime configuration
```

Direct provider wrappers can be deprecated after compatibility period.

---

## Epic D — Skill System

### D1 — Skill discovery

Traceability: `SKILL-01`

Recognize:

```text
translatron/skills/**/SKILL.md
```

### D2 — Markdown reference skills

Allow explicit arbitrary `.md` paths.

### D3 — Locale resolution

Traceability: `SKILL-02`

```text
pt-BR
  ↓
pt
  ↓
pt-BR
```

### D4 — Domain scopes

Allow skill matching by:

```text
key path
catalog
namespace
locale
```

### D5 — Skill fingerprint

Hash normalized contents/resources.

### D6 — Resource bundles

Allow:

```text
SKILL.md
glossary.csv
examples.json
references/
```

---

## Epic E — Parallel Orchestration

### E1 — Build `RunPlan`

Traceability: `PAR-01`

Group work by locale.

### E2 — Supervisor Deep Agent

Traceability: `PAR-02`

Tools:

```text
dispatch_language_jobs
inspect_failures
retry_batch
request_repair
finalize
```

### E3 — LangGraph fan-out

Programmatically launch language branches.

### E4 — Language worker factory

Build dynamic workers from:

```text
locale
model
skills
tools
policy
```

### E5 — Concurrency scheduler

Traceability: `PAR-03`

Implement semaphores for:

```text
languages
batches
global
provider
```

### E6 — Fan-in aggregator

Combine structured results.

Supervisor receives summaries rather than every translation.

### E7 — Partial success

Persist successful work even when one locale fails.

---

## Epic F — Validation and Recovery

### F1 — Structured-result validator

Exact IDs.

No duplicates.

No missing results.

### F2 — Placeholder validator

### F3 — ICU validator

### F4 — Markup validator

HTML/XML/React placeholders as appropriate.

### F5 — Repair workflow

Traceability: `VAL-02`

Exact deterministic failure supplied to repair worker.

### F6 — Retry budget

Example:

```text
model retry: 3
translation repair: 2
review escalation: 1
```

Prevent loops.

---

## Epic G — Translation Memory

### G1 — Exact match index

```text
source fingerprint
+
target locale
+
context compatibility
```

### G2 — Accepted-revision policy

Manual accepted translations can become stronger TM candidates than old model-generated results.

### G3 — Batch example retrieval

Retrieve a small set of compatible examples for worker context.

---

## Epic H — CLI/UX

### H1 — Event bus

Implement normalized `TranslatronEvent`.

### H2 — Progress renderer

Language-level bars.

### H3 — Batch details in verbose mode

### H4 — `--json`

Machine-consumable output.

### H5 — `doctor`

Configuration and readiness checks.

### H6 — `explain`

Trace provenance and skills.

### H7 — improved `status`

Show:

```text
origin
state
coverage
skills stale
manual
failures
```

---

## Epic I — Migration

### I1 — v2 ledger reader

Read-only.

### I2 — Legacy classification

Map:

```text
CLEAN + model → agent revision
CLEAN + no model → imported/unknown
MANUAL → human revision
FAILED → failure metadata
```

### I3 — Verify DB against actual files

Never trust old ledger blindly.

### I4 — Dry-run report

Mandatory default.

### I5 — Atomic migration

Registry created first.

Validate.

Only then mark migration complete.

### I6 — Retain backup

Never delete v2 SQLite automatically.

---

## Epic J — Backward Compatibility

### J1 — Config adapter

Old config → new config.

### J2 — Legacy prompt adapter

Old prompt settings → synthetic project skill.

### J3 — Legacy CLI commands

Keep aliases/behavior.

### J4 — Deprecation warnings

Clear but non-blocking.

---

## Epic K — Testing

Test layers:

```text
domain unit tests
property tests
registry synchronization tests
concurrent writer tests
migration fixtures
agent contract tests
provider integration tests
CLI snapshot tests
full fixture repositories
failure/recovery tests
```

Particularly important scenarios:

```text
two developers generate simultaneously
two human edits diverge
registry push races
worker crashes
provider 429
skill changes mid-branch
source changes after manual override
migration with stale SQLite
CI fresh clone
10-language parallel sync
```

---

## Deep Agents Technical Risk

Use deterministic orchestration for concurrency topology and Deep Agents inside the topology.

Recommended boundary:

```text
LangGraph / Translatron graph
    = orchestration

Deep Agent
    = intelligence inside worker

Skills
    = language/domain expertise

Registry
    = provenance

Validators
    = correctness
```

Do not make correctness depend on an unconstrained supervisor inventing the execution graph.

---

## Performance Model

Normal workload:

```text
catalog scan            O(keys)
registry reconciliation O(keys)
TM lookup               ~O(1) indexed
model calls             only unresolved changed units
languages               parallel
validation              local/parallel
```

Ideal cost path:

```text
unchanged
→ 0 model calls

exact TM
→ 0 model calls

normal new translation
→ 1 model call

validation repair
→ 2 model calls

difficult escalation
→ 3+ only when necessary
```

This is what keeps the redesign optimized despite becoming agentic.

---

## What Should Not Be in v3.0

Avoid scope explosion.

Do not start with:

```text
skill marketplace
hosted dashboard
fuzzy vector TM
screenshots/vision
translation reviewer UI
fully autonomous research agents
remote async agents
ten provider-specific optimizations
```

Build the runtime foundation first.

---

## Proposed v3.0 Scope

```text
Git registry
v2 migration
catalog reconciler
Deep Agents runtime
supervisor
parallel languages
language workers
optional SKILL.md
locale-specific skills
exact translation memory
deterministic validation
repair flow
new CLI events/progress
doctor
explain
backward-compatible config
```

---

## Proposed Package Structure

```text
src/

  cli/
    commands/
      sync.ts
      check.ts
      status.ts
      doctor.ts
      explain.ts
      migrate.ts
      retry.ts

    renderer/
      progress.ts
      json.ts

  core/
    compiler.ts
    reconciler.ts
    planner.ts
    events.ts

  catalogs/
    adapter.ts
    generic-json.ts

  registry/
    registry.ts
    reader.ts
    writer.ts
    git-sync.ts
    snapshot.ts
    schema.ts

  runtime/
    runtime.ts

    deepagents/
      runtime.ts
      supervisor.ts
      worker.ts
      models.ts
      tools.ts
      middleware.ts

  skills/
    resolver.ts
    loader.ts
    fingerprint.ts
    types.ts

  memory/
    translation-memory.ts

  validation/
    result.ts
    placeholders.ts
    icu.ts
    markup.ts

  migration/
    v2-ledger.ts
    migrate.ts
    config-adapter.ts

  config/
    schema.ts
    loader.ts
    legacy.ts

  utils/
```

---

## Architecture Decision Records

Before implementation, create:

```text
ADR-001  Deep Agents as reasoning runtime
ADR-002  LangGraph programmatic orchestration
ADR-003  Git-native immutable registry
ADR-004  No SQLite canonical state
ADR-005  Optional SKILL.md language expertise
ADR-006  Deterministic reconciliation
ADR-007  Structured worker output
ADR-008  Agent exception-driven supervision
ADR-009  Exact-TM-first execution
ADR-010  v2 compatibility and migration
```

---

## Recommended First Engineering Milestone

Do **not** start by integrating Deep Agents.

Start with:

```text
Domain model
   ↓
reconciler
   ↓
registry format
   ↓
migration
```

Then:

```text
TranslationRuntime interface
   ↓
DeepAgent worker
   ↓
single-language translation
```

Then:

```text
parallel graph
   ↓
supervisor
```

Then:

```text
skills
TM
UX
```

If the provenance/reconciliation model is not correct, adding agents will only hide the underlying problem.

---

## Final Architecture Principle

The cleanest division of responsibility is:

```text
Translatron decides WHAT is true
Deep Agents reasons about HOW to translate
LangGraph coordinates WHEN work executes
Skills describe HOW languages/domains behave
Git registry remembers WHAT happened
Validators decide WHAT is acceptable
CLI explains all of it to the developer
```

If that separation is maintained, Translatron can become genuinely agentic **without sacrificing the deterministic compiler and CI behavior that made the original project valuable**.
