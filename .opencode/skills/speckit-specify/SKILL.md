---
name: speckit-specify
description: Create or update the feature specification from a natural language feature description. Use when defining WHAT to build before planning.
---

# Speckit Specify

Bridge skill for Spec-Kit command `speckit.specify`.

Source of truth: `.opencode/commands/speckit.specify.md` — follow it exactly.

## When to use

User wants to spec a Translatron vNext epic (A-K) or any feature. Produces `specs/<prefix>-<slug>/spec.md` + quality checklist.

## Procedure

1. Read `.opencode/commands/speckit.specify.md` and follow all steps (short name, feature dir via `.specify/init-options.json`, copy `.specify/templates/spec-template.md`, load `.specify/memory/constitution.md` if present).
2. Focus on WHAT/WHY, no tech stack. Max 3 `[NEEDS CLARIFICATION]` markers.
3. Write `spec.md` + `checklists/requirements.md`, persist `.specify/feature.json`.
4. Report feature dir, spec path, checklist results, readiness for `/speckit.clarify` or `/speckit.plan`.
