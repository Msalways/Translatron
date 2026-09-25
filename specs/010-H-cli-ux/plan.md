# Implementation Plan: CLI/UX

**Branch**: `010-H-cli-ux` | **Date**: 2026-09-21 | **Spec**: `spec.md`

**Input**: `specs/010-H-cli-ux/spec.md`

## Summary

Normalized event bus + adapter, progress renderer (bars + verbose), `--json`
schema output, `doctor`, `explain`, provenance `status`, deterministic `check`,
semantic conflict UX. Builds on existing commander/chalk/ora/cli-progress.

## Technical Context

**Language/Version**: TypeScript 5 ESM

**Primary Dependencies**: commander, chalk, ora, cli-progress (existing)

**Storage**: N/A (reads registry/catalogs)

**Testing**: vitest snapshots + JSON schema validation

**Target Platform**: Node >= 18

**Project Type**: CLI

**Performance Goals**: Renderer overhead negligible; `check` on 10k keys < 5s

**Constraints**: CLI never imports LangGraph events; `check` no LLM/no writes

**Scale/Scope**: ~800 lines

## Constitution Check

- I: PASS (`check` deterministic gate).
- II: PASS (event adapter isolates framework).

## Project Structure

```text
src/
├── core/events.ts            # TranslatronEvent union + adapter in (Epic 008 or here)
├── cli/
│   ├── commands/
│   │   ├── sync.ts           # (extend) progress + --json
│   │   ├── check.ts          # deterministic validator
│   │   ├── status.ts         # (extend) provenance view
│   │   ├── doctor.ts         # readiness checks
│   │   ├── explain.ts        # key provenance trace
│   │   └── retry.ts          # (extend) --lang
│   └── renderer/
│       ├── progress.ts       # bars
│       └── json.ts           # --json schema output
```

## Complexity Tracking

No violations.
