# Data Model: Skills System

**Epic**: 009-D-skills | **Source**: `src/skills/`

| Item | Shape | Notes |
|---|---|---|
| `LoadedSkill` | `{ id, scope: global\|language\|domain, locales, docPath, content, resources, glossary, examples, fingerprint, selector? }` | `selector = { keys?, catalog?, locales? }`, domain only |
| `DomainSelector` | `{ keys?: glob[], catalog?: string, locales?: string[] }` | all present fields must match |
| `SkillsConfig` | `{ skillsDir?, extraPaths? }` | default `./translatron/skills`; missing dir = zero skills |
| Resolution order | global (id) → language (bare tag before region, then id) → domain (id) | deterministic, never LLM |
| `currentSkillMap` | `Map<id, fingerprint>` per locale (union) | reconciler SKILL_STALE input |
| `toAppliedSkills` | `LoadedSkill[] → AppliedSkill[]` | revision provenance |
| `SkillResourceStore` | `{ getSkillResource(skillId, path) }` | path-escape safe; backs worker tool |
| `skillMaterialForLocale` | `{ skills: [{id, content}], glossary }` | compiler merges TM examples |

Perf: 100-skill load 206ms (one-time disk I/O); 100× resolve+map+glossary 39ms (< 200ms).
