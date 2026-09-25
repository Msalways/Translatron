---
name: speckit-implement
description: Execute all tasks to build the feature according to plan. Use only after analyze passes.
---

# Speckit Implement

Bridge skill for Spec-Kit command `speckit.implement`.

Source of truth: `.opencode/commands/speckit.implement.md` — follow it exactly.

## Rules

- Execute `tasks.md` in order, mark completed, run tests per task.
- Respect Translatron vNext boundaries (core deterministic, runtime isolated, atomic writes).
- Stop on failing validation; report partial success per language where applicable.
