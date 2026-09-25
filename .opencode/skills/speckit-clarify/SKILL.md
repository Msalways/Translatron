---
name: speckit-clarify
description: Clarify underspecified areas in the current spec before planning. Use after specify, before plan.
---

# Speckit Clarify

Bridge skill for Spec-Kit command `speckit.clarify`.

Source of truth: `.opencode/commands/speckit.clarify.md` — follow it exactly.

## Procedure

1. Locate active feature via `.specify/feature.json` → `specs/<feature>/spec.md`.
2. Ask structured clarification questions (max, sequential), update spec in place.
3. Do not touch plan/tasks. Report what was clarified.
