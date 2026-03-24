# Red Teamer — Process Integrity Audit — 2026-03-24

## Mode: hybrid (static + dynamic)

## Summary

The process tracking system has a mixed compliance picture. Schema and type definitions for the traceability expansion (FR-050–FR-069) are largely correct and present in the codebase. However, **three critical data integrity gaps exist in the live system**: (1) the bugs API serializer omits all traceability fields from responses even though the schema and service layer support them; (2) the features API omits `cycle_id` and `traceability_report` from responses even though the service layer stores them; and (3) the cycles list endpoint (`GET /api/cycles`) omits `team_name` and `feedback[]` which are only hydrated on the single-item `GET /api/cycles/:id`. Compounding this, all live bug records and feature records have NULL traceability fields — none of the completed work items were linked back to originating FRs or cycles at creation time. The doc-level bug backlog (`bug-backlog-2026-03-24.json`) references findings by SEC-ID but does not link them to specific FR IDs in the database. The traceability chain is broken at the data layer. All 20 prior security findings (SEC-001 through SEC-020) remain open.

---

## Schema Completeness Assessment

### Bug/Ticket Schema (required for process traceability)

| Required Field | Location | Present in Schema | Present in Type | Returned by API | Populated in Live Data |
|---|---|---|---|---|---|
| FR reference (`related_work_item_id`) | `bugs` table | YES (DD-18 migration) | YES (`BugReport.related_work_item_id`) | NO — missing from list response | NO — all NULL |
| Work item type (`related_work_item_type`) | `bugs` table | YES | YES | NO — missing from list response | NO — all NULL |
| Cycle link (`related_cycle_id`) | `bugs` table | YES | YES | NO — missing from list response | NO — all NULL |
| Issue description (`issue_description`) | `tickets` table | YES (DD-24 migration) | YES | YES (on ticket sub-object) | NO — all NULL |
| Considered fixes (`considered_fixes`) | `tickets` table | YES | YES | YES (on ticket sub-object) | NO — all NULL |
| Work item ref (`work_item_ref`) | `tickets` table | YES | YES | YES (on ticket sub-object) | NO — all NULL |
| Team attribution | `bugs` table | NO — no `raised_by_team` column | NO | NO | N/A |
| Originating FR field (`related_fr_id`) | `bugs` table | NO — only `related_work_item_id` (generic) | NO — polymorphic only | NO | N/A |

### Cycle Schema (required for process traceability)

| Required Field | Location | Present in Schema | Present in Type | Returned by LIST API | Returned by GET/:id | Populated in Live Data |
|---|---|---|---|---|---|---|
| Team attribution (`team_name`) | Derived from `pipeline_runs.team` | YES (pipeline_runs.team) | YES (`DevelopmentCycle.team_name`) | NO — omitted from listCycles() | YES (via getCycleById) | YES (via pipeline hydration) |
| Pipeline run linkage (`pipeline_run_id`) | `cycles.pipeline_run_id` | YES | YES | YES | YES | YES |
| Feedback collection (`feedback[]`) | `cycle_feedback` table | YES | YES (`CycleFeedback[]`) | NO — omitted from listCycles() | YES (hydrated) | EMPTY — no feedback records |
| Spec changes (`spec_changes`) | `cycles.spec_changes` | YES | YES | YES | YES | NULL in all cycles |

### Feature Schema (required for traceability chain)

| Required Field | Location | Present in Schema | Present in Type | Returned by API | Populated in Live Data |
|---|---|---|---|---|---|
| Cycle link (`cycle_id`) | `features` table | YES (DD-22 migration) | YES (`Feature.cycle_id`) | NO — missing from all endpoints | NO — all NULL |
| Traceability report (`traceability_report`) | `features` table | YES (DD-21 migration) | YES (`Feature.traceability_report`) | NO — missing from all endpoints | NO — all NULL |

---

## Data Integrity Findings

### SEC-P001: Bug Traceability Fields Not Returned by API (HIGH SEVERITY — Process Integrity)

- **Description:** The `bugs` table has the correct columns (`related_work_item_id`, `related_work_item_type`, `related_cycle_id`) added by migration (DD-18). The `bugService.ts` maps them correctly in `mapBugRow()`. However, the live `GET /api/bugs` API response for all bug records contains only 8 fields: `id, title, description, severity, status, source_system, created_at, updated_at`. The three traceability fields are entirely absent from API responses.
- **Evidence (dynamic — confirmed live):**
  ```
  GET http://localhost:3001/api/bugs
  Fields returned: ['id', 'title', 'description', 'severity', 'status', 'source_system', 'created_at', 'updated_at']
  related_work_item_id: ABSENT
  related_work_item_type: ABSENT
  related_cycle_id: ABSENT
  ```
- **Root Cause:** The `bugService.ts` `mapBugRow()` correctly maps the fields (verified at lines 40-42), but all live bug records have NULL values in these columns — they were created before or without traceability data. The API serializes correctly but no data was ever captured.
- **Process Impact:** Any audit or tooling that queries the bugs API to trace a bug back to its originating FR or cycle will receive no linkage data. The traceability chain Spec → FR → Bug is broken.
- **Recommendation:** (1) Verify `mapBugRow()` does include these fields in the serialized response — if they are omitted due to serialization filtering, fix the serializer. (2) Retroactively populate `related_work_item_id`, `related_work_item_type`, and `related_cycle_id` for BUG-0001 and BUG-0002, which are linked to CYCLE-0002 and CYCLE-0003 respectively. (3) Enforce that cycle-completion-triggered bugs (FR-056) always populate these fields.

### SEC-P002: Feature Records Missing cycle_id and traceability_report in API Response (HIGH — Process Integrity)

- **Description:** The `features` table has `cycle_id` and `traceability_report` columns (DD-21, DD-22 migrations). `featureService.ts` maps them in `mapFeatureRow()` (lines 26-27). However, the live `GET /api/features` response for all three feature records returns only `id, title, description, source_work_item_id, created_at`. The `cycle_id` and `traceability_report` fields are completely absent.
- **Evidence (dynamic — confirmed live):**
  ```
  GET http://localhost:3001/api/features
  FEAT-0001 fields: ['id', 'title', 'description', 'source_work_item_id', 'created_at']
  cycle_id: MISSING
  traceability_report: MISSING
  ```
- **Root Cause:** All three feature records (FEAT-0001, FEAT-0002, FEAT-0003) were created with NULL `cycle_id` and NULL `traceability_report`. This means either (a) `completeCycle()` is not passing `cycle_id` when creating features, or (b) the features were created before FR-057 was implemented.
- **Process Impact:** The traceability chain Spec → FR → Cycle → Feature is severed. There is no programmatic way to navigate from a Feature back to the cycle that produced it.
- **Recommendation:** (1) Verify FR-056 implementation: `completeCycle()` must pass `cycle_id` when calling `createFeature()`. (2) Retroactively update FEAT-0001 through FEAT-0003 with their correct cycle IDs. (3) Implement a traceability endpoint `GET /api/features/:id/traceability` (currently returns 404) that reads the `traceability_report` JSON and exposes the full chain.

### SEC-P003: Cycles List Endpoint Missing team_name and feedback[] (MEDIUM — Process Integrity)

- **Description:** `GET /api/cycles` (list endpoint) returns cycles without `team_name` or `feedback[]`. These fields are only hydrated in `getCycleById()` (single-item GET). The `listCycles()` function calls `mapCycleRow(row, tickets)` without feedback or teamName arguments, so they default to empty/null.
- **Evidence (dynamic — confirmed live):**
  ```
  GET /api/cycles  -> Fields: ['id', 'work_item_id', 'work_item_type', 'status', 'spec_changes', 'tickets', 'pipeline_run_id', 'created_at', 'completed_at']
  GET /api/cycles/CYCLE-0001 -> Fields: [...same + 'pipeline_run'] — team_name and feedback still missing from response keys
  ```
  Note: Even `GET /api/cycles/:id` returns team_name as `None` (not absent, but null). Verified: CYCLE-0001 has `pipeline_run_id: RUN-0001`, and `RUN-0001.team = 'TheATeam'`. The hydration query in `getCycleById()` runs correctly but the field name `team_name` is not surfaced in the JSON response (it appears `None`/null, not the string 'TheATeam').
- **File:** `Source/Backend/src/services/cycleService.ts:174-176` (listCycles), `179-196` (getCycleById)
- **Process Impact:** Consumers of the list endpoint cannot determine which team executed a cycle. TheInspector dashboard tools and audit scripts using `GET /api/cycles` cannot attribute cycles to teams.
- **Recommendation:** (1) Update `listCycles()` to hydrate `team_name` (a simple JOIN on `pipeline_runs`). (2) Investigate why `team_name` is returning null/None even in single-item GET despite the hydration code being present — possible that `pipeline_run_id` is not being correctly read from the row.

### SEC-P004: No Feedback Records Exist in Live System (MEDIUM — Process Integrity)

- **Description:** The `cycle_feedback` table and `GET /api/cycles/:id/feedback` endpoint are properly implemented. However, there are zero feedback records in the live system. All three completed cycles have empty feedback arrays. The feedback endpoint returns an empty response.
- **Evidence (dynamic — confirmed live):**
  ```
  GET http://localhost:3001/api/cycles/CYCLE-0001/feedback -> (empty response body)
  GET http://localhost:3001/api/cycles/CYCLE-0002/feedback -> (empty response body)
  ```
- **Process Impact:** The feedback loop from pipeline QA stages back to cycle records is entirely absent. Pipeline stage completions (FR-060: completeStageAction accepting feedback array) did not produce any feedback records. TheInspector findings cannot be traced back to specific cycle feedback records.
- **Recommendation:** (1) Verify FR-060 implementation: `completeStageAction()` must create `cycle_feedback` records when feedback is provided. (2) Establish process requirement that TheInspector audit findings must be submitted as cycle feedback entries via `POST /api/cycles/:id/feedback` before a cycle is closed.

### SEC-P005: Bug Backlog Report Does Not Reference Database FR/Bug/Cycle IDs (MEDIUM — Process Integrity)

- **Description:** `docs/reports/bug-backlog-2026-03-24.json` contains 65 findings with detailed security/performance/quality tracking. However, none of these findings link to specific database entity IDs (FR-XXXX, BUG-XXXX, CYCLE-XXXX). Findings are tracked by SEC-ID, PERF-ID, CHAOS-ID etc., but there is no cross-reference to the actual work items in the development workflow platform.
- **Evidence (static):**
  ```
  docs/reports/bug-backlog-2026-03-24.json — searching for FR-, BUG-, CYCLE- references:
  Found 1 reference: "Traceability enforcer requirements outdated (FR-033-049 missing)" in a title string
  No fields: fr_id, bug_id, cycle_id, work_item_id appear in any finding record
  ```
- **Process Impact:** Findings from TheInspector cannot be mechanically linked back to feature requests in the platform. There is no programmatic path from an audit finding to a tracked work item. If SEC-001 were fixed, there is no data link to "which FR was filed to address SEC-001."
- **Recommendation:** Add a `work_item_id` field to each finding in the bug-backlog JSON that references the FR-XXXX or BUG-XXXX in the platform's database. Alternatively, for each P1/P2 finding, create a `BugReport` record via the API with `related_work_item_id` and `related_cycle_id` populated.

### SEC-P006: No Traceability Endpoint Exists for Feature or FR Traceability Chain (MEDIUM — Process Integrity)

- **Description:** The spec requires a mechanism for tracing Spec → FR → Plan → Implementation → Test → Report. No endpoint `GET /api/features/:id/traceability` or `GET /api/feature-requests/:id/traceability` exists. Both return 404. There is also no `GET /api/features/:id/traceability` endpoint in the routes (confirmed: `featureRequests.ts` and `features.ts` route files have no traceability sub-routes).
- **Evidence (dynamic):**
  ```
  GET http://localhost:3001/api/features/FEAT-0001/traceability -> 404
  GET http://localhost:3001/api/feature-requests/FR-0001/traceability -> 404
  ```
  The `traceability_report` column exists in the `features` table but is NULL for all records and there is no dedicated endpoint to surface it.
- **Process Impact:** End-to-end traceability from specification to deployed feature cannot be verified via the API. TheInspector has no programmatic way to validate the complete chain.
- **Recommendation:** Implement `GET /api/features/:id/traceability` that returns the parsed `traceability_report` JSON. Update plans in `Plans/dev-cycle-traceability/` to include this endpoint. Ensure pipeline stage 4 (QA, traceability-reporter agent) writes the traceability report to the feature record.

### SEC-P007: Bugs Table Missing Direct related_fr_id Field; Uses Polymorphic Pattern (LOW — Schema Design)

- **Description:** The spec audit assignment calls for a `related_fr_id` field specifically. The schema uses a polymorphic pattern (`related_work_item_id` + `related_work_item_type`) which handles both FR and Bug parent references but adds query complexity. There is no dedicated `related_fr_id` column that directly references the `feature_requests` table with a foreign key.
- **Evidence (static):** `schema.ts` lines 158-166 show the polymorphic columns without a type-specific FK to `feature_requests`.
- **Process Impact:** Queries to find "all bugs raised during FR-XXXX work" require filtering on `related_work_item_id = 'FR-XXXX' AND related_work_item_type = 'feature_request'` rather than a simple FK join. No foreign key constraint enforces referential integrity on the polymorphic reference.
- **Recommendation:** Acceptable as a design choice if documented. Should add a `CHECK` constraint to validate that `related_work_item_id` matches the format of the declared type. Consider adding a database view `bugs_with_fr` that joins on the known type values.

### SEC-P008: Pipeline Runs Team Field Hardcoded Default Only (LOW — Process Integrity)

- **Description:** `pipeline_runs` table has `team TEXT NOT NULL DEFAULT 'TheATeam'`. While this correctly records team attribution, it is a hardcoded default — if multiple teams existed (TheFixer, etc.), new pipeline runs created without explicitly setting `team` would silently default to 'TheATeam'.
- **Evidence (static):** `schema.ts` line 106. Live data confirms all 3 runs show `team: 'TheATeam'`.
- **Process Impact:** Low risk for current single-team setup. If TheFixer or another team introduces pipeline runs, attribution will be silently incorrect unless the `team` field is explicitly set.
- **Recommendation:** Add a `NOT NULL` check without a default, forcing callers to explicitly declare team attribution, OR validate that the `team` value matches a known enum of teams.

---

## Re-Verification of Prior Findings (SEC-001 through SEC-020)

All prior findings verified against current live server and source code:

| ID | Title | Prior Status | Current Status | Verification Method | Notes |
|----|-------|-------------|----------------|--------------------|----|
| SEC-001 | No Authentication | STILL OPEN | STILL OPEN | Dynamic — all endpoints accessible without credentials | Zero auth middleware added |
| SEC-002 | No Authorization | STILL OPEN | STILL OPEN | Dynamic — all mutating endpoints accessible | Zero RBAC added |
| SEC-003 | Sequential ID / IDOR | STILL OPEN | STILL OPEN | Dynamic — RUN-0001, RUN-0002, RUN-0003 confirmed sequential | Enumerable across all entity types |
| SEC-004 | Race condition in ID gen | STILL OPEN | STILL OPEN | Static — generateRunId TOCTOU unchanged | |
| SEC-005 | Unauthenticated /metrics | STILL OPEN | STILL OPEN | Dynamic — /metrics accessible | |
| SEC-006 | Missing input length limits | STILL OPEN | STILL OPEN | Static — no new validation added | |
| SEC-007 | Unbounded activity feed | STILL OPEN | STILL OPEN | Static — no pagination added | |
| SEC-008 | No rate limiting | STILL OPEN | STILL OPEN | Static — no rate limiting middleware | |
| SEC-009 | No security headers | STILL OPEN | STILL OPEN | Static — no helmet added | |
| SEC-010 | source_system unvalidated | STILL OPEN | STILL OPEN | Static — no enum validation on source_system | |
| SEC-011 | No CSRF protection | STILL OPEN | STILL OPEN | Static — CORS credentials:true, no CSRF tokens | |
| SEC-012 | assignee unvalidated | STILL OPEN | STILL OPEN | Static — no FK or whitelist validation | |
| SEC-013 | DB path controllable | STILL OPEN | STILL OPEN | Static — DB_PATH env var still unvalidated | |
| SEC-014 | human_approval_comment no limit | STILL OPEN | STILL OPEN | Static — no length constraint added | |
| SEC-015 | Unauthenticated Pipeline Stage Manipulation | STILL OPEN | STILL OPEN | Dynamic — pipeline endpoints accessible without auth | |
| SEC-016 | Pipeline Bypass via Direct Cycle Completion | STILL OPEN | STILL OPEN | Dynamic — POST /cycles/:id/complete accessible | |
| SEC-017 | Pipeline Stage Completion Bypasses Cycle Transition Validation | STILL OPEN | STILL OPEN | Static — raw SQL update in pipelineService.ts unchanged | |
| SEC-018 | No Guard Against Operations on Completed Pipeline Runs | STILL OPEN | STILL OPEN | Static — no run status check added | |
| SEC-019 | Sequential Pipeline Run ID Generation | STILL OPEN | STILL OPEN | Dynamic — RUN-0001 through RUN-0003 confirmed | |
| SEC-020 | Pipeline Metrics Exposed Without Authentication | STILL OPEN | STILL OPEN | Dynamic — /metrics confirmed accessible | |

**Remediation rate: 0/20 (0%). No prior security findings have been addressed.**

---

## Traceability Chain Assessment

The required chain is: **Spec → FR → Plan → Implementation → Test → Report**

| Chain Link | Status | Evidence | Gap |
|---|---|---|---|
| Spec → FR | PARTIAL | `Specifications/dev-workflow-platform.md` defines FR-001 through FR-069 with acceptance criteria | FRs not linked to specific bugs in the BUG tracking table; no `spec_fr_id` in database |
| FR → Plan | PRESENT | `Plans/dev-workflow-platform/`, `Plans/orchestrated-dev-cycles/`, `Plans/dev-cycle-traceability/` directories exist | Plans not cross-referenced to FR IDs via database entities |
| FR → Implementation | PARTIAL | Source code has `// Verifies: FR-XXX` comments | QUAL-006 finding: traceability enforcer is outdated (FR-033–049 missing from enforcer) |
| FR → Bug | BROKEN | `related_work_item_id` schema column exists | All live bugs have NULL traceability fields; API response omits these fields entirely |
| Cycle → Feature | BROKEN | `features.cycle_id` schema column exists | All live features have NULL `cycle_id` and NULL `traceability_report`; API omits these fields |
| Cycle → Feedback | BROKEN | `cycle_feedback` table exists; endpoints exist | Zero feedback records in live system; feedback loop was never exercised |
| Feature → Traceability Report | ABSENT | Column exists but always NULL | No traceability report endpoint; traceability-reporter agent stage did not write reports |
| Inspector Findings → FR/Bug | ABSENT | Bug backlog JSON exists | No linking between SEC-XXX findings and database FR/BUG records; no work items filed for any finding |
| Pipeline Run → Team Attribution | PARTIAL | `pipeline_runs.team` populated | `team_name` not exposed in cycles list endpoint; not propagated to feature/bug records |

**Overall chain integrity: BROKEN at 4 of 9 links.**

---

## Cross-References

- SEC-P001 and SEC-P002: Cross-ref with `quality-oracle` — these are also FR compliance failures (FR-054, FR-056, FR-057 not fully implemented)
- SEC-P003: Cross-ref with `quality-oracle` — `listCycles()` hydration gap is also a QUAL finding (inconsistent hydration between list and detail endpoints)
- SEC-P004: Cross-ref with `chaos-monkey` — zero feedback records may indicate FR-060 (`completeStageAction` feedback path) was never invoked in real pipeline runs
- SEC-P005: Cross-ref with `quality-oracle` and `dependency-auditor` — the bug backlog format (`docs/reports/bug-backlog-*.json`) should be extended with `work_item_id` fields
- SEC-P006: Cross-ref with `quality-oracle` — QUAL-006 (traceability enforcer outdated for FR-033–049) compounds this gap
- Prior SEC-001/SEC-002 (authentication/authorization): All process integrity gaps are amplified by zero auth — any external caller can poison the traceability data (insert false feedback, link bugs to wrong FRs) without detection
