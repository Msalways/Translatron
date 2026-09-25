---
name: speckit-plan
description: Create technical implementation plan with chosen tech stack for the current spec. Use after specify/clarify.
---

# Speckit Plan

Bridge skill for Spec-Kit command `speckit.plan`.

Source of truth: `.opencode/commands/speckit.plan.md` — follow it exactly.

## Procedure

1. Resolve feature dir from `.specify/feature.json`, run `.specify/scripts/powershell/setup-plan.ps1` steps per command file.
2. Produce `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md` using `.specify/templates/plan-template.md`.
3. Translatron constraints: deepagents/LangGraph only under `src/runtime/deepagents/`, deterministic core stays pure TS, registry = orphan branch segments.
4. Report plan artifacts and readiness for `/speckit.tasks`.
