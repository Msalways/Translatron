# Tasks: Review Routing

**Input**: `specs/016-review-routing/` (reviewed spec + plan)

- [x] R-T001 Config `policies.reviewKeys` (additive, default []) + matrix test
- [x] R-T002 Engine `requireReviewFor` → resolved `needsReviewKeys` union; stale-`review` conditional re-reconcile; E2E (legal NEW, stale-review, force-vs-review, empty no-op)
- [x] R-T003 Assembly mapping + skipped-line printing in `runV3Sync`; amend 014 assumption; full suite + docs (research/data-model/quickstart); mark tasks
