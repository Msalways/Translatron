# Implementation Plan: Skills System

**Branch**: `009-D-skills` | **Date**: 2026-09-21 | **Spec**: `spec.md`

**Input**: `specs/009-D-skills/spec.md`

## Summary

Skill discovery (`SKILL.md` glob + explicit `.md` refs), deterministic locale
fallback + domain scopes, sha256 fingerprinting over normalized content +
resources, bundle loader, provenance integration. No new deps (`fast-glob` exists).

## Technical Context

**Language/Version**: TypeScript 5 ESM

**Primary Dependencies**: fast-glob (existing), node:crypto

**Storage**: Files under `translatron/skills/`; fingerprints in registry revisions

**Testing**: vitest + skill-tree fixtures

**Target Platform**: Node >= 18

**Project Type**: compiler

**Performance Goals**: 100-skill resolve < 200ms; fingerprint cache per run

**Constraints**: Resolution deterministic (never LLM); zero skills valid; stale never auto-writes

**Scale/Scope**: ~500 lines + fixtures

## Constitution Check

- I: PASS (applicability deterministic).
- IV: PASS (SKILL_STALE, provenance fingerprints).

## Project Structure

```text
src/
└── skills/
    ├── types.ts        # Skill, AppliedSkill, scopes
    ├── loader.ts       # read + parse SKILL.md/.md + bundles
    ├── resolver.ts     # locale fallback + domain matching
    ├── fingerprint.ts  # normalize + hash
    └── index.ts
tests/
├── unit/skills.test.ts
└── fixtures/skills/    # global/lang/region/domain trees
```

## Complexity Tracking

No violations.
