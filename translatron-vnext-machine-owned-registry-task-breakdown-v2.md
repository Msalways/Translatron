# Translatron vNext — Machine-Owned Registry Redesign

## 1. Objective

Redesign Translatron so that:

- developers continue to own and maintain normal i18n translation files;
- Translatron exclusively owns its registry and provenance state;
- registry artifacts are auto-generated and never manually edited;
- the registry remains the durable source of truth for translation history, ownership, lineage, and provenance;
- current application translation files remain the source of truth for what the application actually ships;
- Translatron reconciles the two deterministically;
- developers never need to switch branches, edit registry files, or manually resolve registry Git conflicts;
- CI can validate localization completeness without requiring an LLM call;
- the design supports Deep Agents orchestration, skills, translation memory, and parallel language workers.

---

## 2. Core Ownership Model

### 2.1 Developer-owned artifacts

Developers own:

```text
locales/
  en-GB.json
  fr-FR.json
  de-DE.json
  ja-JP.json

translatron.config.ts

translatron/
  skills/
    ...
```

Developers may:

- add source keys;
- edit source strings;
- manually edit target translations;
- add/remove locale files;
- add/update `SKILL.md` files;
- change project configuration;
- commit and review translation files in normal pull requests.

### 2.2 Translatron-owned artifacts

Translatron owns:

```text
TRN registry revisions
registry snapshots
registry metadata
local disposable indexes/caches
run provenance
translation lineage
```

Humans should never:

```text
create .trn files manually
edit .trn files
rename .trn files
merge .trn files
resolve .trn conflicts
rewrite registry history
```

If a human ever needs to manually resolve a `.trn` Git merge conflict, the registry protocol has failed.

---

## 3. Source-of-Truth Model

There are two different truths.

### Application truth

The current locale files represent what the application ships:

```text
JSON / YAML / TS locale files
```

Example:

```json
{
  "auth.login": "Connexion"
}
```

This is the current application value.

### Registry truth

The Translatron registry represents:

```text
who created the translation
what source version it belongs to
whether it came from an agent, human, or import
which model produced it
which skills were applied
which prompt/core-policy fingerprint was used
which target hash was last generated
revision ancestry
manual override history
conflict history
accepted translation-memory entries
```

### Reconciliation rule

Translatron always reconciles:

```text
CURRENT SOURCE FILES
        +
CURRENT TARGET FILES
        +
TRANSLATRON REGISTRY
        ↓
DERIVED STATE
```

The registry never overrides the current working tree blindly.

---

## 4. Example

Initial source:

```json
{
  "auth.login": "Log in"
}
```

Translatron generates:

```json
{
  "auth.login": "Se connecter"
}
```

Registry records:

```text
key: auth.login
locale: fr-FR
sourceHash: AAA
targetHash: BBB
origin: agent
model: ...
skills: ...
```

Later a developer manually changes:

```json
{
  "auth.login": "Connexion"
}
```

Current target hash becomes `CCC`, while the registry knows the last generated hash is `BBB`.

Reconciliation:

```text
CCC != BBB
    ↓
manual modification detected
    ↓
MANUAL
```

Translatron creates a new immutable registry revision describing the human-owned value. It does **not** overwrite the JSON.

---

## 5. Registry Storage Model

The registry should not be:

```text
registry.json
registry.sqlite
one JSON file per key
one JSON file per translation
```

Recommended model:

```text
refs/translatron/registry
```

This is a machine-managed Git ref. Developers do not checkout this ref. Translatron reads/writes it internally using Git plumbing.

Example registry tree:

```text
segments/
  01KXYZ001.trn
  01KXYZ002.trn
  01KXYZ003.trn

snapshots/
  01KSNAP001.trnsnapshot
```

---

## 6. Immutable Segment Model

One translation run or registry publication creates one immutable segment.

Example:

```text
01KXYZ003.trn
```

It may contain hundreds or thousands of revisions.

Conceptually:

```json
[
  {
    "id": "tr_001",
    "key": "auth.login",
    "locale": "fr-FR",
    "sourceHash": "AAA",
    "targetHash": "BBB",
    "origin": "agent"
  },
  {
    "id": "tr_002",
    "key": "checkout.pay",
    "locale": "de-DE",
    "sourceHash": "DDD",
    "targetHash": "EEE",
    "origin": "agent"
  }
]
```

JSON is only illustrative. The actual `.trn` format may later use CBOR, MessagePack, compressed binary, or a custom versioned binary format.

---

## 7. Registry Invariants

### REG-INV-01 — Machine ownership

Only Translatron writes registry artifacts.

### REG-INV-02 — Immutability

Once a `.trn` segment is published, neither users nor Translatron modify it. Future changes create new segments.

### REG-INV-03 — Append-only publication

Normal registry activity is:

```text
read existing registry
+
append new immutable segment
```

not:

```text
load shared mutable state
+
rewrite shared state
```

### REG-INV-04 — Integrity validation

Every segment must include:

```text
format version
schema version
Translatron version
run ID
checksum
record count
```

Modified/corrupt segments must be rejected.

### REG-INV-05 — Reconstructability

Any disposable local index/cache must be rebuildable from registry segments/snapshots.

### REG-INV-06 — No working-tree dependency

Developers never need to checkout or modify the registry ref.

---

## 8. Git Conflict Avoidance

Two developers may synchronize simultaneously.

Initial registry:

```text
R10
```

Developer A generates `A.trn` and Developer B generates `B.trn`.

A publishes first:

```text
R10
 ↓
R11 + A.trn
```

B tries to publish based on R10. Git rejects the non-fast-forward update.

Translatron automatically:

```text
fetch R11
verify new remote segments
combine remote state + B.trn
create R12
compare-and-swap push
```

Final registry:

```text
R10
 ↓
R11 + A.trn
 ↓
R12 + B.trn
```

No registry file was edited by both developers. Therefore no textual merge conflict occurs.

---

## 9. Semantic Conflicts

Storage conflicts and translation conflicts are different.

Suppose `auth.login / fr-FR` had `Se connecter`.

Developer A changes it to `Connexion` while Developer B independently changes it to `Accéder au compte`.

Registry can safely contain both immutable revisions:

```text
            tr_001
          /        \
       tr_A        tr_B
```

Translatron derives:

```text
CONFLICT
```

The user resolves the translation semantically. Resolution produces another immutable revision:

```text
            tr_001
          /        \
       tr_A        tr_B
          \        /
           tr_R
```

The raw registry files are never manually merged.

---

## 10. Current Branch Workflow

Developers stay on their feature branch.

```bash
git checkout -b feature/checkout
```

Developer adds:

```text
checkout.payNow = "Pay now"
```

Then:

```bash
translatronx sync
```

Translatron:

```text
read current working tree
        ↓
fetch registry ref internally
        ↓
reconcile source + targets + registry
        ↓
detect NEW work
        ↓
translate only required key/language pairs
        ↓
validate
        ↓
write target locale files on current branch
        ↓
generate immutable .trn revision segment
        ↓
publish registry internally
```

The developer never leaves the feature branch.

---

## 11. Translation Planning Example

Before change:

```text
en-GB: 1000 keys
fr-FR: 1000 keys
de-DE: 1000 keys
ja-JP: 1000 keys
```

Developer adds one source key:

```text
checkout.payNow
```

Reconciliation:

```text
checkout.payNow / fr-FR → NEW
checkout.payNow / de-DE → NEW
checkout.payNow / ja-JP → NEW
```

Everything else remains `CLEAN`.

Work plan:

```text
1 source unit
×
3 target locales
=
3 translation operations
```

---

## 12. Registry Record Model

```ts
interface TranslationRevision {
  id: string;

  catalogId: string;
  keyPath: string;

  sourceLocale: string;
  targetLocale: string;

  sourceHash: string;
  targetHash: string;

  origin:
    | "agent"
    | "human"
    | "imported";

  parentIds: string[];

  provider?: string;
  model?: string;

  corePolicyFingerprint?: string;

  skillFingerprints?: Array<{
    id: string;
    fingerprint: string;
  }>;

  glossaryFingerprint?: string;
  contextFingerprint?: string;

  runId: string;
  gitCommit?: string | null;
  createdAt: string;
}
```

---

## 13. Derived Translation States

State should be calculated from files + registry.

| State | Meaning |
|---|---|
| `NEW` | Source exists but target does not |
| `UNTRACKED` | Target exists but registry has no lineage |
| `CLEAN` | Target matches accepted registry revision |
| `MANUAL` | Target differs from latest agent-generated target |
| `SOURCE_STALE` | Source changed since accepted translation |
| `SKILL_STALE` | Applicable skill fingerprint changed |
| `CONTEXT_STALE` | Context changed |
| `TARGET_DELETED` | Registry knows a translation but file value is gone |
| `ORPHANED` | Source key was removed |
| `FAILED` | Latest translation attempt failed |
| `CONFLICT` | Competing valid revisions exist |
| `NEEDS_REVIEW` | Policy requires human review |

### Source-key deletion lifecycle

When a key disappears from the authoritative source catalog, Translatron must treat that as an explicit source-deletion event.

Example:

```text
en-GB previously contained:
  auth.logout

current en-GB:
  auth.logout missing

targets still contain:
  fr-FR.auth.logout
  de-DE.auth.logout
  ja-JP.auth.logout
```

The reconciler derives:

```text
auth.logout / fr-FR → ORPHANED
auth.logout / de-DE → ORPHANED
auth.logout / ja-JP → ORPHANED
```

The default lifecycle is:

```text
source key removed
      ↓
ORPHANED
      ↓
`check` reports/fails on orphaned target entries
      ↓
`sync` removes the corresponding key from managed target catalogs
      ↓
Translatron appends a SOURCE_REMOVED registry event/revision
      ↓
historical translation revisions remain immutable
```

A source-key removal is therefore a state transition, not history destruction.

If the same key later returns with the same or compatible source fingerprint, Translatron may reuse the previous accepted translation through exact translation memory instead of making a new model call.

Target-only keys must be supported as an explicit exception. Projects may configure allowed target-only key patterns, for example:

```ts
catalogs: {
  targetOnly: [
    "legal.countrySpecific.*"
  ]
}
```

Those keys are exempt from orphan cleanup.

The design must distinguish:

```text
SOURCE_REMOVED / ORPHANED
  source key no longer exists
  → target should normally be removed

TARGET_DELETED
  source still exists but target disappeared
  → target should be restored/retranslated according to policy
```

---

## 14. Registry and Deep Agents

The registry is not controlled by Deep Agents.

```text
Deep Agent worker
      ↓
structured result
      ↓
deterministic validation
      ↓
accepted result
      ↓
Translatron registry writer
```

Workers must not have direct registry write access.

---

## 15. Parallel Translation Flow

```text
                SUPERVISOR
                     │
                     ▼
              deterministic plan
                     │
       ┌─────────────┼─────────────┐
       ▼             ▼             ▼
     fr-FR         de-DE         ja-JP
     worker        worker        worker
       │             │             │
       └─────────────┼─────────────┘
                     ▼
                 validation
                     ▼
                  accepted
                     ▼
             locale file writes
                     ▼
          registry segment generation
```

Registry publication happens after accepted deterministic results.

---

## 16. Registry Synchronization UX

Registry synchronization should be invisible during normal usage.

```bash
translatronx sync
```

Output may show:

```text
Registry
  ✓ synchronized
  14 new revisions loaded
```

Likewise `translatronx status` may automatically fetch the latest registry before displaying provenance state.

---

## 17. Registry Commands

Allowed:

```bash
translatronx registry status
translatronx registry verify
translatronx registry sync
translatronx registry repair
```

Not allowed:

```bash
translatronx registry edit
```

Registry changes should happen through domain operations such as translation, manual target edits, migration, conflict resolution, and accepted review.

---

## 18. Registry Integrity UX

If a registry segment was modified:

```text
Registry integrity failure

Segment:
  01KXYZ003.trn

Checksum mismatch.

Registry segments are generated by Translatron and must not be edited.

Run:
  translatronx registry repair
```

The CLI should not silently accept modified machine-owned data.

---

## 19. CI Behavior

### `translatronx check`

Must remain deterministic.

No model calls.

Checks:

```text
missing keys
extra/orphan keys
placeholder mismatches
invalid structures
empty values
catalog completeness
registry integrity
registry/file consistency
```

Registry access may be optional in a `--catalogs-only` mode.

### `translatronx sync`

May:

```text
fetch registry
plan work
invoke agents/providers
write target files
publish provenance
```

---

## 20. Migration From Current SQLite Registry

Current Translatron users must have a safe migration path.

```bash
translatronx migrate
```

Dry-run by default.

Inputs:

```text
v2 SQLite ledger
source locale files
target locale files
v2 configuration
```

Migration must never trust SQLite blindly. It must reconcile SQLite with current files.

Example:

```text
SQLite:
targetHash = BBB
status = CLEAN

File:
targetHash = CCC
```

Migration should produce:

```text
agent/imported revision → BBB
human revision → CCC
```

rather than silently trusting the stale ledger.

---

## 21. Migration Mapping

```text
CLEAN + model fingerprint
    → agent revision

CLEAN + no model fingerprint
    → imported / legacy-unknown

MANUAL
    → human revision

FAILED
    → failure metadata

DIRTY
    → stale/work-required state
```

---

## 22. Migration UX

```text
$ translatronx migrate

Translatron v2 → v3

Source keys                 4,280
Translations               12,411

Agent tracked                8,803
Manual                       1,126
Imported / legacy unknown    2,456
Failed                          26

Registry/file mismatches        14

No changes made.

Run:
  translatronx migrate --apply
```

---

## 23. Backward Compatibility

vNext should keep current commands during migration:

```text
sync
check
status
retry
import
context
```

Old configuration should continue to parse.

Deprecated values such as:

```text
advanced.ledgerPath
```

should be accepted with warnings during the compatibility period.

Existing application locale files must not require migration.

---

## 24. Configuration UX

Minimal config:

```ts
export default defineConfig({
  sourceLocale: "en-GB",
  locales: ["fr-FR", "de-DE", "ja-JP"]
});
```

Normal project:

```ts
export default defineConfig({
  sourceLocale: "en-GB",

  locales: [
    "fr-FR",
    "de-DE",
    "ja-JP"
  ],

  model: "openai:gpt-5",

  skills: {
    paths: [
      "./translatron/skills"
    ]
  },

  execution: {
    maxLanguages: 4,
    maxGlobalModelCalls: 8
  }
});
```

Registry internals should normally require no configuration.

---

## 25. Traceability IDs

Use:

```text
OWN   ownership
REG   registry
REC   reconciliation
GIT   synchronization
CI    continuous integration
MIG   migration
COMP  backward compatibility
AGENT agent runtime integration
PAR   parallel execution
UX    CLI/user experience
SEC   integrity/security
TEST  testing
PERF  performance
```

---

## 26. Requirements Traceability Matrix

| ID | Requirement | Module |
|---|---|---|
| OWN-01 | Developers own application locale files | Catalog layer |
| OWN-02 | Translatron exclusively owns `.trn` artifacts | Registry |
| REG-01 | Registry stores translation provenance | Registry schema |
| REG-02 | Registry segments are immutable | Registry writer |
| REG-03 | Registry is reconstructable | Registry reader/snapshot |
| REG-04 | Registry detects manual overrides | Reconciler |
| GIT-01 | Registry uses dedicated tool-managed Git ref | Git adapter |
| GIT-02 | Developers never checkout registry ref | CLI/Git adapter |
| GIT-03 | Concurrent registry writes resolve automatically | Git sync |
| REC-01 | State derived from source + target + registry | Reconciler |
| REC-02 | Existing clean translations are not regenerated | Planner |
| REC-03 | Manual translations are protected | Reconciler/planner |
| REC-04 | Source-key deletion is tracked, propagated to managed targets, and preserved historically | Reconciler/planner/registry |
| CI-01 | `check` validates without model calls | CLI |
| CI-02 | Missing keys fail CI deterministically | Catalog validator |
| MIG-01 | v2 SQLite migration is supported | Migration |
| MIG-02 | Migration validates SQLite against files | Migration |
| COMP-01 | Existing CLI commands remain usable | CLI compatibility |
| COMP-02 | Existing config remains loadable | Config compatibility |
| AGENT-01 | Agents never write registry directly | Agent boundary |
| PAR-01 | Languages can translate in parallel | Orchestrator |
| UX-01 | Registry activity is invisible during normal usage | CLI |
| SEC-01 | Modified registry segments are rejected | Integrity checker |
| TEST-01 | Concurrent registry publication is tested | Test suite |

---

## 26.1 Requirement: Source-Key Deletion and Target Synchronization

**Requirement ID:** `REC-04`

**User story:** As a developer, when I remove a key from the authoritative source locale, I want Translatron to identify and synchronize the deletion across managed target locales without losing translation history.

### Acceptance criteria

1. WHEN a previously tracked key is absent from the authoritative source catalog, THE reconciler SHALL classify corresponding managed target entries as `ORPHANED`.
2. WHEN `translatronx check` encounters `ORPHANED` managed target entries, THE command SHALL report them deterministically without invoking an LLM.
3. WHEN `translatronx sync` processes `ORPHANED` entries under the default policy, THE compiler SHALL remove those keys from managed target catalogs atomically.
4. WHEN a source key is removed, THE registry SHALL append a machine-generated `SOURCE_REMOVED` revision/event and SHALL NOT rewrite or delete historical translation revisions.
5. WHEN an orphaned target entry originated from a human/manual translation, THE active target key MAY be removed from the managed locale file while its human-owned revision history SHALL remain preserved in the registry.
6. WHEN the same source key later reappears with an exact compatible source fingerprint, THE planner SHOULD reuse a previously accepted historical translation through translation memory before invoking a model.
7. WHEN a target key is explicitly configured as target-only, THE reconciler SHALL exempt it from orphan cleanup.
8. WHEN a source exists but a target is missing, THE reconciler SHALL classify the state as `TARGET_DELETED`, not `ORPHANED`.
9. WHEN a source key deletion and its target removals complete successfully, THE registry SHALL retain enough lineage to explain the previous source, prior translations, removal event, and any future restoration.
10. WHEN CI runs after a successful synchronization, THE source and managed target keyspaces SHALL be consistent except for explicitly configured target-only exceptions.

---

# 27. Full Task Breakdown

## Epic A — Ownership Model

### A1 — Define artifact ownership

Traceability: `OWN-01`, `OWN-02`

Document developer-owned, Translatron-owned, and mixed-ownership artifacts.

Acceptance criteria:

- locale files remain developer-editable;
- `.trn` files are machine-owned only;
- docs explicitly state manual registry edits are unsupported.

### A2 — Add generated-registry metadata

Every `.trn` segment must contain:

```text
generated marker
format version
schema version
Translatron version
run ID
checksum
record count
created timestamp
```

Traceability: `REG-02`, `SEC-01`.

---

## Epic B — Canonical Registry Domain

### B1 — Define `TranslationRevision`

Traceability: `REG-01`.

Include identity, source fingerprint, target fingerprint, origin, parents, model, skills, context, run, and timestamps.

### B2 — Define revision ancestry rules

Rules for:

```text
agent generated
human override
imported
conflict
resolution
```

### B3 — Define registry schema versioning

Implement:

```text
registrySchema
recordSchema
segmentFormat
```

Unknown future versions must fail safely.

---

## Epic C — `.trn` Segment Format

### C1 — Define v1 segment format

Traceability: `REG-02`, `SEC-01`.

Choose an initial internal representation while exposing only `.trn`.

### C2 — Implement encoder

Input:

```text
TranslationRevision[]
```

Output:

```text
TRN segment
```

### C3 — Implement decoder

Must validate header, schema, checksum, record count, and record structure.

### C4 — Implement immutable writer

Writer must refuse to overwrite an existing published segment.

---

## Epic D — Registry Git Ref

### D1 — Define registry ref

Recommended:

```text
refs/translatron/registry
```

Traceability: `GIT-01`, `GIT-02`.

### D2 — Implement registry ref discovery

Determine whether local registry exists, remote registry exists, or initialization is required.

### D3 — Implement ref fetch

Fetch registry without modifying `HEAD`, the working tree, or the current branch.

### D4 — Implement registry tree reader

Read `segments/` and `snapshots/` without checkout.

### D5 — Implement registry commit builder

Create registry commits through Git plumbing/temp trees. Never checkout registry.

---

## Epic E — Conflict-Free Publication

### E1 — Implement compare-and-swap push

Traceability: `GIT-03`.

Algorithm:

```text
fetch current remote registry head
build new commit from that head + local segment
attempt push
```

### E2 — Retry non-fast-forward updates

On rejection:

```text
fetch new head
verify newly arrived segments
rebuild commit
retry
```

Use a bounded retry limit.

### E3 — Test simultaneous publishers

Both developers generate distinct segments.

Expected:

```text
both segments present
no textual merge conflict
no data loss
```

---

## Epic F — Reconciliation Engine

### F1 — Read source catalog snapshot

Normalize catalog ID, key path, source text, source hash, and context.

### F2 — Read target catalog snapshot

Normalize current target values and hashes.

### F3 — Load latest registry view

Build latest accepted lineage per catalog, key, target locale, and source fingerprint.

### F4 — Derive translation state

Traceability: `REC-01`.

Implement:

```text
NEW
UNTRACKED
CLEAN
MANUAL
SOURCE_STALE
SKILL_STALE
CONTEXT_STALE
TARGET_DELETED
ORPHANED
FAILED
CONFLICT
NEEDS_REVIEW
```

### F5 — Detect manual override

Traceability: `REG-04`, `REC-03`.

Rule:

```text
current target hash
!=
last accepted generated target hash
```

Then derive `MANUAL`.

### F6 — Generate human revision automatically

When Translatron observes a manual edit, create a human revision whose parent is the previous generated revision.

### F7 — Detect source-key deletion

Traceability: `REC-04`.

Compare the previous/current registry view and authoritative source snapshot.

When a previously known source key is absent from the current source catalog:

```text
derive ORPHANED for every managed target-locale entry
```

Acceptance criteria:

- deletion is detected without relying on target-file absence;
- deletion works on feature branches and uncommitted working-tree changes;
- historical revisions are never deleted.

### F8 — Resolve target-only-key exceptions

Traceability: `REC-04`.

Allow explicitly configured target-only key patterns.

Acceptance criteria:

- matching target-only keys are not marked `ORPHANED`;
- unmatched target-only keys are still reported;
- configuration is deterministic and testable.

### F9 — Distinguish source deletion from target deletion

Traceability: `REC-04`.

Rules:

```text
source missing + target present
  → ORPHANED / SOURCE_REMOVED

source present + target missing + registry revision exists
  → TARGET_DELETED
```

These states must lead to different planner actions.

---

## Epic G — Planner

### G1 — Build deterministic work plan

Traceability: `REC-02`, `REC-03`.

Only include work requiring translation.

### G2 — Preserve manual translations

Manual values must not regenerate unless policy/explicit command allows it.

### G3 — Support stale policies

For `SOURCE_STALE`, `SKILL_STALE`, and `CONTEXT_STALE`, support project policies such as translate, review, or preserve.

### G4 — Plan orphan removals

Traceability: `REC-04`.

For every `ORPHANED` managed target entry, create a deterministic removal operation instead of a translation operation.

The planner must never send orphaned values to an LLM merely to decide whether they should be deleted.

### G5 — Support source-removal policy

Default:

```text
managed source key removed
  → remove corresponding target entries
```

Optional project policies may support:

```text
remove
warn-only
preserve
```

but the default should keep managed locale keyspaces synchronized with the authoritative source catalog.

---

## Epic H — Deep Agents Boundary

### H1 — Define `TranslationRuntime`

Traceability: `AGENT-01`.

Agents receive work but do not modify Git, registry, or locale files.

### H2 — Structured worker result

Require unit ID, translated text, and optional metadata.

### H3 — Validate worker results deterministically

Only accepted results may become locale-file updates and registry revisions.

---

## Epic I — Parallel Language Execution

### I1 — Group work by locale

Traceability: `PAR-01`.

### I2 — Build supervisor orchestration

One supervisor coordinates language workers.

### I3 — Fan out locale jobs

Run locales in parallel subject to concurrency policy.

### I4 — Fan in results

Supervisor receives summaries, not raw full context from every worker.

### I5 — Support partial success

Successful locale work remains valid when another locale fails.

---

## Epic J — Locale File Writer

### J1 — Stage accepted translations in memory

Workers never write files.

### J2 — Write once per catalog

Avoid per-key rewrite loops.

### J3 — Atomic rename

Use temp file → validation → rename.

### J4 — Preserve unrelated manual values

Never replace untouched translations.

### J5 — Remove orphaned keys atomically

Traceability: `REC-04`.

Apply planner-generated orphan removals during the same staged catalog update used for translations.

Requirements:

- remove only managed keys classified as `ORPHANED`;
- never remove configured target-only exceptions;
- write the target catalog once;
- validate the resulting catalog before atomic rename;
- do not destroy registry history for the removed value.

---

## Epic K — Registry Publication

### K1 — Create revisions from accepted translations

Record origin, model, skills, source hash, target hash, and parent lineage.

### K2 — Generate one segment per run/publication

Not one segment per key.

### K3 — Publish segment automatically

Developer does nothing.

### K4 — Publish observed manual revisions

Manual target edits become registry revisions automatically.

### K5 — Record source-removal revisions

Traceability: `REC-04`.

When a managed source key is removed, append a durable registry event/revision such as:

```text
SOURCE_REMOVED
catalogId
keyPath
previousSourceHash
runId
createdAt
```

Requirements:

- previous translations remain immutable and queryable;
- the source-removal record is machine-generated;
- no historical segment is rewritten;
- a later reintroduction of the source key can reference historical accepted revisions.

### K6 — Support restoration lineage

If a previously removed key returns with an exact compatible source fingerprint and an accepted historical translation exists:

```text
exact TM hit
→ restore/reuse translation
→ validate
→ append a new accepted revision referencing prior lineage
```

No model call is required for an exact compatible reuse.

---

## Epic L — Registry Integrity

### L1 — Check checksums

Traceability: `SEC-01`.

### L2 — Verify ancestry

Reject unknown parent references, invalid revision cycles, invalid schema, and duplicate immutable IDs with different contents.

### L3 — Add `registry verify`

```bash
translatronx registry verify
```

### L4 — Add `registry repair`

Repair only from known-good registry history/snapshots. Never silently rewrite corrupted history.

---

## Epic M — Local Disposable Index

### M1 — Build fast local registry index

May include latest revision by identity, TM lookup map, manual ownership lookup, and skill fingerprint lookup.

### M2 — Mark index as disposable

It must never be source of truth.

### M3 — Rebuild index

Use latest registry snapshot plus newer segments.

### M4 — Recover from local corruption

Delete/rebuild automatically when safe.

---

## Epic N — Translation Memory

### N1 — Exact accepted lookup

Use registry data.

### N2 — Prefer high-quality accepted revisions

Policy may prefer human accepted → reviewed agent → agent generated.

### N3 — Reuse without model calls

Exact compatible TM hit: validate → reuse → record lineage.

---

## Epic O — CLI UX

### O1 — Hide registry mechanics

Traceability: `UX-01`.

Normal commands should simply show registry synchronization status.

### O2 — Improve `sync`

Show detected changes, work planned, per-language progress, TM reuse, repairs, failures, files written, and registry publication.

### O3 — Improve `status`

Show agent generated, human owned, imported, clean, stale, conflicts, and failures.

### O4 — Add `explain`

```bash
translatronx explain auth.login --lang fr-FR
```

Show lineage and ownership.

### O5 — Add registry-specific commands

```text
registry status
registry sync
registry verify
registry repair
```

Do not add registry edit.

---

## Epic P — CI

### P1 — Deterministic `check`

Traceability: `CI-01`, `CI-02`.

No agent call.

### P2 — Validate missing translations

A new source key missing in any required target must fail CI.

### P3 — Validate placeholders/structure

### P4 — Validate registry integrity

Allow `translatronx check --catalogs-only` when registry remote access is unavailable.

### P5 — Add `--json`

Machine-readable CI output.

### P6 — Detect orphaned target keys

Traceability: `REC-04`, `CI-01`.

When a source key is removed but remains in managed target catalogs, `translatronx check` must report it.

Default CI behavior should fail unless the key matches an allowed target-only pattern or project policy explicitly downgrades the condition.

Example:

```text
Orphaned translation keys detected

auth.logout
  fr-FR   ORPHANED
  de-DE   ORPHANED
  ja-JP   ORPHANED

Source key no longer exists in en-GB.
Run:
  translatronx sync
```

### P7 — Verify deletion synchronization

After `translatronx sync`, `check` must confirm:

```text
source key absent
target keys absent
registry source-removal history present
```

---

## Epic Q — Migration

### Q1 — Add v2 SQLite reader

Traceability: `MIG-01`.

Read-only.

### Q2 — Compare v2 ledger to current files

Traceability: `MIG-02`.

### Q3 — Build migration classification

```text
CLEAN + model → agent
CLEAN + no model → imported/legacy unknown
MANUAL → human
FAILED → failure metadata
```

### Q4 — Generate v3 registry segments

### Q5 — Dry-run migration

Default behavior.

### Q6 — Apply migration atomically

### Q7 — Preserve v2 backup

Never automatically delete old SQLite.

---

## Epic R — Backward Compatibility

### R1 — Load v2 config

Traceability: `COMP-02`.

### R2 — Deprecate `ledgerPath`

Warn but do not fail immediately.

### R3 — Normalize legacy prompt config

Convert old prompt options into v3 project policy/skills.

### R4 — Preserve legacy CLI commands

Traceability: `COMP-01`.

---

## Epic S — Testing

### S1 — Unit tests

Registry encoding/decoding.

### S2 — Reconciliation property tests

Every state transition.

### S3 — Concurrent publication tests

Traceability: `TEST-01`.

### S4 — Semantic conflict tests

Two human revisions from the same parent.

### S5 — Corruption tests

Test modified segment, truncated segment, unknown schema, and missing parent.

### S6 — Fresh clone tests

Developer has application files but no local registry cache.

Expected: registry fetched, index rebuilt, status correct.

### S7 — Feature branch tests

Developer adds source key without switching branches.

Expected: only new key translated, target locale files updated on feature branch, registry generated automatically.

### S8 — CI fresh runner tests

`check` must work deterministically.

### S9 — Migration fixtures

Test clean v2 DB, stale DB, manual override, failed translation, partially imported project, and corrupt local DB.

### S10 — Source delete → sync → restore lifecycle

Traceability: `REC-04`.

Test sequence:

```text
1. source key exists
2. target translations exist
3. registry has accepted revisions
4. source key is removed
5. check reports ORPHANED
6. sync removes managed target entries
7. registry appends SOURCE_REMOVED
8. old revisions remain queryable
9. same source key is re-added
10. exact historical translation is reused when compatible
11. validation passes
12. new accepted revision references prior lineage
```

### S11 — Target-only exception tests

Verify:

```text
allowed target-only key
  → preserved

unapproved target-only key
  → ORPHANED/reportable
```

### S12 — Source removal vs target deletion tests

Verify:

```text
source missing + target present → ORPHANED
source present + target missing → TARGET_DELETED
```

The planner must produce different actions for the two cases.

---

## 28. Proposed Package Structure

```text
src/

  core/
    compiler.ts
    reconciler.ts
    planner.ts
    state.ts
    events.ts

  catalogs/
    adapter.ts
    generic-json.ts

  registry/
    schema.ts
    revision.ts
    segment.ts
    encoder.ts
    decoder.ts
    reader.ts
    writer.ts
    index.ts
    snapshot.ts

    git/
      refs.ts
      fetch.ts
      publish.ts
      retry.ts

  runtime/
    runtime.ts

    deepagents/
      runtime.ts
      supervisor.ts
      worker.ts

  skills/
    resolver.ts
    loader.ts
    fingerprint.ts

  memory/
    translation-memory.ts

  validation/
    result.ts
    placeholders.ts
    structure.ts
    registry.ts

  writer/
    atomic-catalog-writer.ts

  migration/
    v2-ledger-reader.ts
    classifier.ts
    migrate.ts

  cli/
    commands/
      sync.ts
      check.ts
      status.ts
      explain.ts
      migrate.ts
      retry.ts

      registry/
        status.ts
        sync.ts
        verify.ts
        repair.ts

    renderer/
      progress.ts
      json.ts

  config/
    schema.ts
    loader.ts
    legacy.ts
```

---

## 29. Recommended Implementation Order

### Phase 1 — Registry foundation

```text
ownership model
translation revision model
TRN format
registry ref
reader/writer
Git publication
concurrent push handling
integrity verification
```

### Phase 2 — Reconciliation

```text
source snapshot
target snapshot
registry view
state derivation
manual detection
planner
```

### Phase 3 — Migration

```text
v2 SQLite reader
reconciliation against current files
dry-run
registry conversion
backward compatibility
```

### Phase 4 — Runtime

```text
TranslationRuntime
DeepAgent runtime
single-language worker
structured results
validation
```

### Phase 5 — Parallel execution

```text
supervisor
language fan-out
concurrency scheduler
partial success
fan-in
```

### Phase 6 — Skills and TM

```text
SKILL.md discovery
locale-specific skills
skill fingerprints
exact translation memory
```

### Phase 7 — UX and CI

```text
progress events
doctor
status
explain
check
JSON output
registry diagnostics
```

---

## 30. Release Acceptance Criteria

vNext should not ship until all of the following are true:

```text
[ ] Developers never need to checkout the registry ref.
[ ] Developers never need to create or edit .trn files.
[ ] Two concurrent Translatron syncs cannot lose registry data.
[ ] Two concurrent syncs do not create human-resolved .trn merge conflicts.
[ ] A fresh clone can reconstruct registry state automatically.
[ ] A corrupted local cache can be rebuilt.
[ ] Current locale files remain normal developer-managed i18n assets.
[ ] Manual target edits are detected and preserved.
[ ] New source keys translate only missing/stale target entries.
[ ] CI can detect missing translations without calling an LLM.
[ ] Registry provenance records model, skills, hashes, and origin.
[ ] Existing v2 SQLite users can migrate safely.
[ ] v2 configuration remains readable during the compatibility window.
[ ] Parallel language translation works under bounded concurrency.
[ ] Agents cannot directly modify locale files or registry history.
[ ] Registry integrity failures are explicit and recoverable.
```

---

## 31. Final Architecture Principle

The redesigned Translatron should have a strict ownership split:

```text
DEVELOPER
    owns:
      source locale files
      target locale files
      manual translations
      config
      skills

TRANSLATRON
    owns:
      provenance
      translation lineage
      generated hashes
      model/skill fingerprints
      registry history
      machine-owned .trn segments
      registry snapshots/indexes

APPLICATION
    reads:
      normal locale files
```

And the key reconciliation rule is:

> **Locale files define what currently exists. The Translatron registry defines what Translatron knows about how it got there.**

That gives Translatron full control over translation provenance and automation without taking ownership away from developers or forcing the application to depend on Translatron at runtime.
