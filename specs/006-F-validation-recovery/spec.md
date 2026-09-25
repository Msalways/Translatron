# Feature Specification: Validation + Recovery

**Feature Branch**: `006-F-validation-recovery`

**Created**: 2026-09-21

**Status**: Draft

**Input**: R&D §20–§22, §24–§25 + Epics F1–F6. Traceability: `VAL-01`, `VAL-02`.

## User Scenarios & Testing

### User Story 1 - Bad translations never reach files (Priority: P1)

Placeholder-dropping or malformed ICU output fails deterministically and routes
to repair with the exact failure (`PLACEHOLDER_MISMATCH "Missing {count}"`).

**Why this priority**: Validators, not the agent, decide acceptability.

**Independent Test**: Golden fixtures per validator (placeholders, ICU, markup, schema, length, leakage).

**Acceptance Scenarios**:

1. **Given** a translation missing `{count}`, **When** validated, **Then** it fails with the missing-name error and no write occurs.
2. **Given** repair output restoring `{count}`, **When** revalidated, **Then** it passes and stages.

### User Story 2 - Repair budgets prevent loops (Priority: P2)

Repeated failures escalate reviewer → give up as FAILED after budgets (model
retry 3 / repair 2 / review 1), recorded in the registry.

**Independent Test**: Always-failing fixture stops exactly at budget and marks FAILED.

**Acceptance Scenarios**:

1. **Given** 2 failed repairs, **When** policy requires review, **Then** a reviewer is requested once, not per retry.

### Edge Cases

- Reviewer is opt-in/escalation-only; normal path needs zero reviewer calls.
- HTML/XML/React tags preserved only when source contains markup.

## Requirements

### Functional Requirements

- **FR-001**: Validators MUST cover result schema/IDs, placeholders, ICU, markup, empty output, length, key coverage — `VAL-01`.
- **FR-002**: Repair MUST receive the exact deterministic failure, not a paraphrase — `VAL-02`.
- **FR-003**: Budgets MUST cap model retry, repair, review escalation — Epic F6.
- **FR-004**: Reviewer MUST be escalation-only by default — §22.

## Success Criteria

- **SC-001**: Golden-file validator suite green across all categories.
- **SC-002**: Repair loop converges on fixable fixtures within budget; unfixable → FAILED with metadata.
- **SC-003**: Normal-path E2E performs exactly 1 model call per unit (no reviewer).

## Assumptions

- Existing `TranslationValidationPipeline` extended, not forked, where behavior overlaps.
