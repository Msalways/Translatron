# Feature Specification: Review Routing

**Feature Branch**: `016-review-routing`

**Created**: 2026-09-23

**Status**: Draft

**Input**: Fulfills the 014 deferral (`stale: 'review'`, producer-less `requireReviewFor`). Mechanism: key globs resolve against source keys into the reconciler's existing `needsReviewKeys` input — no new states, no new buckets. Stale-review works by re-running the pure reconciler with augmented keys (cheap: O(keys), 48ms/10k measured).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sensitive keys route to review instead of translation (Priority: P1)

`policies.reviewKeys: ["legal.*", "billing.*"]` — matching units skip translation in every state that would otherwise translate, count into `skipped.needsReview`, and surface as `NEEDS_REVIEW` in `status`/`explain` through the normal derived-state path.

**Why this priority**: Legal/billing strings must never auto-translate in regulated projects.

**Independent Test**: NEW legal key + reviewKeys → no file write, no revision, needsReview count 1, reconciler-derived state visible via `explainKey`.

**Acceptance Scenarios**:

1. **Given** NEW `legal.terms` with `reviewKeys: ["legal.*"]`, **When** the engine runs, **Then** no translation is written or published for it, `skipped.needsReview` is 1, and `explain` reports `NEEDS_REVIEW`.
2. **Given** no `reviewKeys`, **When** the engine runs, **Then** behavior is byte-identical to before (empty set → no-op).

---

### User Story 2 - Stale-review policy re-derives instead of retranslating (Priority: P2)

`policies.stale: 'review'` (new third value) — stale units are collected from the first reconcile pass, added to `needsReviewKeys`, and the pure reconciler re-runs: they derive `NEEDS_REVIEW` instead of translating. Translators see exactly what needs eyes; nothing auto-retranslates.

**Independent Test**: Source-changed unit under `review` → derived NEEDS_REVIEW, zero worker invocations for it, revision history untouched.

**Acceptance Scenarios**:

1. **Given** SOURCE_STALE unit with `stale: 'review'`, **When** the engine runs, **Then** it is skipped with needsReview counted and no new revision publishes.
2. **Given** `stale: 'translate'` (default), **When** the engine runs, **Then** behavior is unchanged.

---

### Edge Cases

- Glob matching reuses `matchesKeyPattern` (third use of the shared dialect; no new glob code).
- `reviewKeys` matching nothing → empty set, zero behavior change.
- reviewKeys + forceRegenerate on the same key → review wins (human-eyes-before-overwrite; force never overrides an explicit review route).
- Warn-level surfacing: policy-routed skips appear in `skipped.needsReview`; the human CLI summary prints skipped lines when nonzero.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Config `policies` MUST gain additive-optional `reviewKeys: string[]` (default `[]`) — G3.
- **FR-002**: Engine MUST accept `requireReviewFor?: string[]` (key globs), resolve them against source keyPaths, and feed the result as reconciler `needsReviewKeys` (union with any caller-provided set) — G3.
- **FR-003**: Engine MUST support `stale: 'review'`: collect stale-reason units from pass one, augment `needsReviewKeys` with their keyPaths (scoped per locale), and re-run `reconcile` before TM/planning — G3.
- **FR-004**: Review-routed units MUST NOT reach TM, planning, workers, files, or revisions; they MUST count in `skipped.needsReview` — G3.
- **FR-005**: `runV3Sync` human output MUST print skipped lines (conflicts/review/preserved) when nonzero; assembly MUST map `policies.reviewKeys` → engine `requireReviewFor` — UX.
- **FR-006**: 014 spec assumption (`stale: 'review'` deferred) MUST be amended to point here on implement.

### Key Entities

- **Review route**: glob → source-key resolution → `needsReviewKeys` → derived `NEEDS_REVIEW`. One mechanism for both stories.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Review-gated NEW/legal/stale units produce zero writes, zero revisions, zero worker calls; counts exact.
- **SC-002**: `explain`/`status` show NEEDS_REVIEW for routed units (derived-state proof, no special-casing).
- **SC-003**: Default configs behave byte-identically (empty globs are no-ops — existing E2E green unchanged).
- **SC-004**: Full suite green; `tsc` clean.

## Assumptions

- Human review *action* (approve/reject UI) remains out of scope — routing + visibility is the deliverable; resolution happens by editing files (→ MANUAL flow) or narrowing globs.
- A dedicated LLM reviewer agent is explicitly NOT built here; `requestReview` repair-hook stays caller-provided.
- Plan/tasks/implement follow only on a positive spec review (user condition).
