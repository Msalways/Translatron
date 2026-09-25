# Research: Skills System

**Date**: 2026-09-22 | **Epic**: 009-D-skills

## Layout convention (R&D §10)

```
translatron/skills/
  global/SKILL.md            → scope global, all locales
  languages/ja/SKILL.md      → scope language, locales [ja]
  languages/ja-JP/SKILL.md   → scope language, locales [ja-JP]
  domains/ecommerce/SKILL.md → scope domain, selector from frontmatter
```

Scope/locale inference is positional; frontmatter (`id`, `scope`, `locales`,
`keys`, `catalog`) overrides. Explicit `.md` refs (R&D §12) load as global
skills so existing team docs work unmodified.

## Decisions

1. **Tiny hand-rolled frontmatter parser, no new dep.** Only the five known
   fields, inline `[a, b]` + block lists. Unknown fields/unterminated blocks
   throw with path — deterministic, never guessed.
2. **Uniform locale-affinity rule**: skill locale matches target T iff it
   equals T or `langPart(T)`. Region skills never match bare languages.
3. **Conservative staleness**: the reconciler map unions every
   locale-applicable skill (even key-scoped domains). Over-marks siblings on
   domain rotation instead of risking silent staleness; revisions record only
   actually-applied skills.
4. **Locale-level materials are unions** (key-scoped domains ride along).
   Per-batch skill narrowing is Epic 010 integration scope; planners already
   group by per-unit `skillFingerprint` so the data is ready.
5. **Fingerprint = full sha256 hex** over normalized doc + sorted resources
   (normalization: NFC, LF, trimmed line ends). Canonical key-sorted
   serialization was already proven necessary in Epic 003.
6. **`src/skills` imports nothing from `runtime/` or `migration/`**:
   resource store is a minimal local interface the compiler wires into
   `TranslationToolBackend`; legacy conversion takes a structural param.
   No new dependencies (`fast-glob` reused, Windows slash normalization kept).
7. **v3 `skills:` config schema is Epic 010 scope** — this epic defines
   `SkillsConfig` (skillsDir + extraPaths) for the compiler to consume.
