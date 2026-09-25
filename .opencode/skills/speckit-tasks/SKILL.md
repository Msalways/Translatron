---
name: speckit-tasks
description: Generate actionable task lists for implementation from plan. Use after plan, before implement.
---

# Speckit Tasks

Bridge skill for Spec-Kit command `speckit.tasks`.

Source of truth: `.opencode/commands/speckit.tasks.md` — follow it exactly.

## Procedure

1. Run `.specify/scripts/powershell/setup-tasks.ps1` flow per command file.
2. Generate `tasks.md` from `.specify/templates/tasks-template.md` — checkbox tasks grouped by phase/story, each independently testable.
3. Keep IDs stable (e.g. `A1-T01`) for GitHub issue mapping. Report task count and entry point.
