# Translatron vNext — Spec-Kit Workflow

Installed: `github/spec-kit` (opencode commands mode) + local skills bridge in
`.opencode/skills/speckit-*/SKILL.md` (upstream `--skills` flag not yet merged,
so the bridge re-exports each `.opencode/commands/speckit.*.md` as a skill).

PowerShell scripts: `.specify/scripts/powershell/*.ps1`. Templates: `.specify/templates/`.
Specs live in `specs/<prefix>-<slug>/`. Active feature pointer: `.specify/feature.json`.

## The loop (per feature, in order)

```
1. /speckit.constitution  (once, then amend as needed)
2. /speckit.specify       -> specs/<nn>-<slug>/spec.md + checklists/requirements.md
3. /speckit.clarify       (optional, before plan)
4. /speckit.plan          -> plan.md + research.md + data-model.md + contracts/ + quickstart.md
5. /speckit.checklist     (optional, after plan)
6. /speckit.tasks         -> tasks.md
7. /speckit.analyze       (required, before implement — read-only)
8. /speckit.implement     (builds tasks in order)
9. /speckit.converge      (drift check, appends remaining work)
10. /speckit.taskstoissues (optional, gh CLI → GitHub issues)
```

Invoke via slash command (`/speckit.specify ...`) or skill
(`skill: "speckit-specify"`). Same underlying files.

## Step 0 — Constitution (do once)

```
/speckit.constitution Translatron vNext: Git-native agentic localization compiler.
Deterministic compiler envelope; TranslationRuntime boundary (no deepagents/LangGraph
types outside src/runtime/deepagents/); orphan-branch registry translatron/registry
(segments/*.trn + snapshots/*.trnsnapshot); TM exact-match before any LLM call;
structured {unitId,text} output; validators accept; v3.0 breaking with v2 migrate;
skills optional with SKILL_STALE (never auto-overwrite); partial per-language success.
```

## Step 1..11 — vNext epics in milestone order

Run one full loop per epic. Suggested prompts (paste after the command):

| # | Spec dir slug | `/speckit.specify` prompt core |
|---|---|---|
| 01 | `01-A-foundation-domain` | Epic A1: canonical domain model TranslationIdentity/Revision/SourceUnit/TargetSnapshot/ReconciledTranslation/RunPlan/LanguagePlan/WorkUnit, no deepagents/SQLite leaks (CORE-01/02, REG-01) |
| 02 | `02-A-reconciler-catalog` | Epic A2-A3: reconciler deriving NEW/UNTRACKED/CLEAN/MANUAL/SOURCE_STALE/SKILL_STALE/CONTEXT_STALE/TARGET_DELETED/ORPHANED/CONFLICT/FAILED/NEEDS_REVIEW + CatalogAdapter generic-json |
| 03 | `03-B-git-registry` | Epic B1-B6: versioned .trn segments, immutable writer, reader/indexer, git-sync fetch/merge/push retry, snapshot compaction, checksum recovery (REG-01/02/03) |
| 04 | `04-I-migration-compat` | Epic I+J: read-only v2 SQLite reader, legacy classification, DB-vs-files verify, dry-run default, atomic registry-first migrate, config/prompt/CLI compat (MIG-01, COMPAT-01) |
| 05 | `05-C-runtime-worker` | Epic C1-C5: TranslationRuntime interface, DeepAgentRuntime (deepagents+LangGraph), immutable core policy, structured output, model resolver (AGENT-01/02) |
| 06 | `06-F-validation-recovery` | Epic F1-F6: result/placeholder/ICU/markup validators + repair workflow + retry budgets (VAL-01/02) |
| 07 | `07-G-translation-memory` | Epic G1-G3: exact TM index sourceFingerprint+locale+context, accepted-revision priority (PERF-01) |
| 08 | `08-E-parallel-orchestration` | Epic E1-E7: RunPlan, supervisor tools, dispatch_language_jobs fan-out, semaphores (4/2/8), fan-in, PARTIAL_SUCCESS + retry --lang (PAR-01/02/03) |
| 09 | `09-D-skills` | Epic D1-D6: SKILL.md discovery, .md refs, locale fallback, domain scopes, fingerprint → SKILL_STALE (SKILL-01/02/03) |
| 10 | `10-H-cli-ux` | Epic H1-H7: TranslatronEvent bus, progress, --json, doctor, explain, status (CLI-01/02, UX-01/02) |
| 11 | `11-K-testing-hardening` | Epic K: domain/property/registry-race/concurrent-writer/migration/agent-contract/provider/CLI-snapshot/fixture/10-lang matrix (TEST) |

Example:

```
/speckit.specify Epic A1 for Translatron vNext: canonical domain model ...
Source: translatron-vnext-deep-agents-rnd.md sections 15-18 + Epic A1. No implementation details.
```

Then `/speckit.clarify`, `/speckit.plan` (paste tech stack: TypeScript, deepagents JS,
@langchain/langgraph, existing providers/validators), `/speckit.tasks`, `/speckit.analyze`,
`/speckit.implement`.

## Rules

- One feature per `/speckit.specify` call. Spec = WHAT/WHY only; plan = HOW.
- Keep traceability IDs (CORE/REG/AGENT/SKILL/PAR/VAL/CLI/UX/MIG/COMPAT/PERF/SEC/TEST) in FRs and task IDs (`A1-T01`).
- Never skip `analyze` before `implement`. `implement` follows `tasks.md` order only.
- Foundation first: 01→04 before 05→08 (per R&D milestone). Do not start agents before reconciler+registry+migration specs exist.
- Windows: use `powershell` script variant when prompted; run commands from repo root.

## Tracking

- Per-spec progress = `tasks.md` checkboxes.
- Whole-program = `specs/` dirs + `/speckit.taskstoissues` → GitHub issues.
- Drift = `/speckit.converge` appends to `tasks.md`; never edit generated tasks by hand except via specify loop.
