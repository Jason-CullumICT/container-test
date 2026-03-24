# Quality Oracle — Process Traceability Audit — 2026-03-24

## Mode: hybrid (static + dynamic)

## Summary

Post-work audit after TheATeam completed the dev-cycle traceability feature (FR-050 through FR-069). The audit reveals a **critical process failure**: the backend server was started at 01:28 UTC before the traceability feature code was written (02:35–02:39 UTC), and was never restarted. Consequently, the live database never received schema migrations for FR-052 (missing 8 columns across 3 tables, 1 missing table), and the live API never served the feedback routes (FR-059), team_name hydration (FR-058), or ticket/bug/feature traceability fields (FR-054–FR-057). All process traceability audit criteria fail when tested against the live system.

Static analysis confirms the source code and tests are correct and comprehensive (69/69 FRs have test coverage, traceability enforcer PASS). The gap is exclusively in deployment: a stale server process serving stale data to a stale database.

## Spec Coverage
- Total FRs in spec: 69 (FR-001–FR-032, FR-033–FR-049, FR-050–FR-069)
- FRs with formal `// Verifies:` source traceability: 47 of 69 (68.1%)
- FRs with test traceability: 69 of 69 (100%)
- Traceability enforcer result: PASS (checks all 47 implemented source FRs against tests)
- Traceability enforcer requirements file: STILL covers only FR-001–FR-032 (32 of 69); QUAL-006 remains open
- Non-meta FRs missing formal source `// Verifies:` markers: 16 (FR-033, FR-034, FR-035, FR-039, FR-041, FR-042, FR-050, FR-051, FR-052, FR-054, FR-055, FR-056, FR-057, FR-058, FR-060, FR-061)

## Process Traceability Findings

### QUAL-P001: Live DB Missing All FR-052 Schema Migrations (P1)
- **Description:** The backend server was started at 2026-03-24T01:28 UTC using `tsx src/index.ts` (no hot-reload). The FR-052 schema changes (schema.ts modified 2026-03-24T02:35) were never applied to the running database because the server process that would execute migrations on startup was already running before the changes existed. The server was never restarted.
- **Evidence (dynamic):**
  - `PRAGMA table_info(bugs)`: columns `related_work_item_id`, `related_work_item_type`, `related_cycle_id` — ABSENT
  - `PRAGMA table_info(tickets)`: columns `work_item_ref`, `issue_description`, `considered_fixes` — ABSENT
  - `PRAGMA table_info(features)`: columns `cycle_id`, `traceability_report` — ABSENT
  - `SELECT name FROM sqlite_master WHERE type='table'`: table `cycle_feedback` — ABSENT
  - `GET /api/bugs/BUG-0001` response: no `related_work_item_id`, `related_work_item_type`, `related_cycle_id` fields
  - `GET /api/cycles/CYCLE-0001` tickets: no `work_item_ref`, `considered_fixes` fields
  - `GET /api/features`: no `cycle_id`, `traceability_report` fields
- **Root cause:** No deployment/restart step after FR-050–FR-062 code was merged. `tsx src/index.ts` without `--watch` does not hot-reload. The migrations in `schema.ts` are idempotent and will self-heal on restart, but a restart was never triggered.
- **Recommendation:** Restart the backend server (`cd /workspace/Source/Backend && npx tsx src/index.ts`) to apply migrations and register all new routes. Add a post-merge restart step to the pipeline runbook.

### QUAL-P002: Feedback API Routes Return 404 in Live Environment (P1)
- **Description:** `GET /api/cycles/:id/feedback` and `POST /api/cycles/:id/feedback` (FR-059) return HTTP 404 in the live environment. The routes are correctly defined in `Source/Backend/src/routes/cycles.ts` (lines 210 and 238), but the running server process (PID 6343, started 01:28 UTC) pre-dates those additions (cycles.ts modified 02:38 UTC). Express route registration occurs at startup and is not dynamic.
- **Evidence (dynamic):**
  - `GET http://localhost:3001/api/cycles/CYCLE-0001/feedback` → HTTP 404 `Cannot GET /api/cycles/CYCLE-0001/feedback`
  - `GET http://localhost:3001/api/cycles/CYCLE-0002/feedback` → HTTP 404
  - `GET http://localhost:3001/api/cycles/CYCLE-0003/feedback` → HTTP 404
  - Server log: `[WARN] Request completed {"path":"/api/cycles/CYCLE-0001/feedback","status":404}`
  - `stat /workspace/Source/Backend/src/routes/cycles.ts` → Modify: 2026-03-24T02:38 UTC
  - `stat /proc/6343/` (server process) → Created: 2026-03-24T01:28 UTC
- **Consequence:** All audit checks for feedback traceability (Criteria 4) fail. `feedbackService.ts`, `cycle_feedback` schema, and frontend FeedbackLog component are implemented but unreachable at runtime.
- **Recommendation:** Restart server as noted in QUAL-P001. Confirm `GET /api/cycles/CYCLE-0001/feedback` returns `{"data":[]}` after restart.

### QUAL-P003: No Bugs Have FR/Internal Ticket References (P1)
- **Description:** Audit criterion 1 requires every bug to have `related_fr_id` (or equivalent). The spec defines `related_work_item_id`, `related_work_item_type`, `related_cycle_id` on BugReport (FR-050, FR-054). The two live bugs (BUG-0001, BUG-0002) were created before these columns existed and the schema migration has not been applied, so neither bug carries any parent reference.
- **Evidence (dynamic):**
  - `GET /api/bugs` → BUG-0001 and BUG-0002: no `related_work_item_id` field
  - `GET /api/bugs/BUG-0001` → `{"id":"BUG-0001","title":"Chaos test bug","description":"Testing state machine","severity":"medium","status":"resolved","source_system":"manual","created_at":"...","updated_at":"..."}`
  - DB direct query: `bugs` table columns = `id, title, description, severity, status, source_system, created_at, updated_at` only
- **Note:** Both bugs were created as manual test fixtures, not from a cycle deployment failure, so they would not naturally carry `related_work_item_id`. The schema gap prevents any future bugs from carrying the reference either.
- **Recommendation:** Restart server to apply migrations. When creating bugs during pipeline execution, populate `related_work_item_id` with the FR or bug ID being worked on.

### QUAL-P004: No Tickets Have Complete Issue Information or Considered Fixes (P1)
- **Description:** Audit criterion 2 requires each ticket to have complete description of the issue AND considered fixes (`issue_description`, `considered_fixes`). Schema columns were never migrated (see QUAL-P001). Both live tickets (TKT-0001, TKT-0002) lack these fields in the DB and API response.
- **Evidence (dynamic):**
  - `GET /api/cycles/CYCLE-0001` → TKT-0001: no `work_item_ref`, `issue_description`, `considered_fixes`
  - DB: `PRAGMA table_info(tickets)` = `id, cycle_id, title, description, status, assignee, created_at, updated_at` only
  - TKT-0001 description: "A test ticket" — no structured issue description
  - TKT-0002 description: "This ticket is incomplete" — no structured issue description
- **Recommendation:** After server restart and migration, create tickets with `issue_description` and `considered_fixes` populated as specified in FR-055. Update existing test tickets if they represent real work.

### QUAL-P005: Dev Cycles Do Not Show Team Attribution in API Response (P1)
- **Description:** Audit criterion 3 requires each cycle to show which team(s) executed it. FR-058 specifies that `getCycleById()` hydrates `team_name` from `pipeline_run.team`. The field is defined in `DevelopmentCycle` type (`Source/Shared/types.ts:67`) but is absent from all live API responses because the server is running a pre-modification version of `cycleService.ts` (modified 02:38, server started 01:28).
- **Evidence (dynamic):**
  - `GET /api/cycles` → CYCLE-0001, CYCLE-0002, CYCLE-0003: no `team_name` field
  - `GET /api/cycles/CYCLE-0001` → response keys: `['id', 'work_item_id', 'work_item_type', 'status', 'spec_changes', 'tickets', 'pipeline_run_id', 'created_at', 'completed_at', 'pipeline_run']` — `team_name` absent
  - Pipeline runs DO exist (RUN-0001, RUN-0002, RUN-0003 all have `team: "TheATeam"`)
- **Evidence (static):** `pipeline_run.team` = "TheATeam" confirmed in all 3 pipeline run records
- **Recommendation:** After server restart, `team_name` will be hydrated. All 3 cycles have `pipeline_run_id` pointing to pipeline runs with `team: "TheATeam"`.

### QUAL-P006: Feedback Not Linked to Tickets — Zero Feedback Records Exist (P1)
- **Description:** Audit criterion 4 requires feedback to link back to appropriate tickets/FRs. The `cycle_feedback` table is missing from the database (never migrated). Zero feedback records exist for any cycle. The feedback route returns 404. No stage completion has ever created feedback records via FR-060's `completeStage()` integration.
- **Evidence (dynamic):**
  - DB: `cycle_feedback` table absent from `sqlite_master`
  - `GET /api/cycles/CYCLE-0001/feedback` → HTTP 404
  - Cycles CYCLE-0001 through CYCLE-0003: all pipeline stages show `verdict: "approved"` but no feedback records
- **Recommendation:** After server restart and migration, feedback will be capturable. The `completeStage()` integration for auto-creating feedback (FR-060) depends on the migration running first.

### QUAL-P007: Features Missing Traceability Reports (P1)
- **Description:** Audit criterion 5 requires completed features to have traceability reports attached. FR-057 and FR-056 require `features.cycle_id` and `features.traceability_report`. All 3 live features (FEAT-0001, FEAT-0002, FEAT-0003) were created before the schema migration and have no `cycle_id` or `traceability_report`.
- **Evidence (dynamic):**
  - `GET /api/features` → FEAT-0001, FEAT-0002, FEAT-0003: no `cycle_id`, no `traceability_report` fields
  - DB: `PRAGMA table_info(features)` = `id, title, description, source_work_item_id, created_at` only — 2 columns missing
- **Note:** Traceability reports DO exist as files in `Plans/dev-workflow-platform/` (traceability-report-run3.md through run5.md). The gap is that they are not programmatically attached to Feature records via the DB.
- **Recommendation:** After server restart, new cycle completions will populate `cycle_id` and `traceability_report`. Backfilling existing FEAT-0001/0002/0003 requires a data migration or re-running the relevant cycles.

### QUAL-P008: Bug Backlog Missing Recommendations and File References for 26 of 34 Entries (P2)
- **Description:** Audit criterion 7 requires each bug backlog entry to have complete information: title, file, recommendation, priority_bucket. Of the 34 entries in `docs/reports/bug-backlog-2026-03-24.json`, 26 entries (all P2 findings and some P1 NOT already having them) are missing both `recommendation` and `file` fields.
- **Evidence (static):**
  - P1 entries with all fields: SEC-001, SEC-002, SEC-015, PERF-017, CHAOS-006, CHAOS-017, CHAOS-018, CHAOS-019 (8 of 8 P1s are complete)
  - P2 entries missing `file` and `recommendation`: SEC-003, SEC-005, SEC-008, SEC-016, SEC-017, QUAL-001, QUAL-002, QUAL-003, QUAL-006, PERF-001 through PERF-006, PERF-016, PERF-022, CHAOS-001, CHAOS-003, CHAOS-004, CHAOS-005, CHAOS-008, CHAOS-013, CHAOS-021, DEP-003, DEP-004 (26 of 26 P2 entries)
- **Recommendation:** Each P2 entry in the bug backlog should include `file` (path to affected source file) and `recommendation` (specific fix description). These were included in each specialist's original findings reports but were not promoted to the backlog JSON.

### QUAL-P009: Traceability Enforcer Requirements File Still Missing FR-033 through FR-069 (P2)
- **Description:** QUAL-006 from the prior audit remains open. `Plans/dev-workflow-platform/requirements.md` (the enforcer's input file) only contains FR-001 through FR-032. The enforcer reports "32 total requirements" and "15 FRs pending implementation by other agents" — but those 15 are actually FR-033–FR-049 and FR-050–FR-069 which are fully implemented. The enforcer under-counts the spec's true 69-FR scope.
- **Evidence (static):**
  - `python3 tools/traceability-enforcer.py` output: `Total requirements in spec: 32`
  - `Plans/dev-workflow-platform/requirements.md`: only FR-001 through FR-032 present
  - `Plans/orchestrated-dev-cycles/requirements.md`: contains FR-033 through FR-049
  - `Plans/dev-cycle-traceability/requirements.md`: contains FR-050 through FR-069
  - Spec `Specifications/dev-workflow-platform.md`: defines FR-001 through FR-069 (69 FRs total)
- **Recommendation:** Update `tools/traceability-enforcer.py` to read all three requirements files, OR consolidate all 69 FRs into one requirements file, OR update the enforcer to read directly from the canonical spec.

### QUAL-P010: 16 Non-Meta FRs Lack Formal Source `// Verifies:` Comments (P3)
- **Description:** QUAL-007 from prior audit (originally 6 FRs) has grown to 16 FRs as the traceability feature added more source files without formal markers. These FRs have test coverage (enforcer PASS) but their source implementations are not annotated.
- **Evidence (static):**
  - Missing source `// Verifies:` markers: FR-033 (types.ts), FR-034 (api.ts), FR-035 (schema.ts), FR-039 (cycleService.ts), FR-041 (cycleService.ts), FR-042 (dashboardService.ts), FR-050 (types.ts), FR-051 (api.ts), FR-052 (schema.ts), FR-054 (bugService.ts), FR-055 (cycleService.ts), FR-056 (cycleService.ts), FR-057 (featureService.ts), FR-058 (cycleService.ts), FR-060 (pipelineService.ts), FR-061 (feedbackService.ts/metrics.ts)
- **Recommendation:** Add `// Verifies: FR-XXX` header comments to the relevant source files. This is cosmetic traceability hygiene but required by CLAUDE.md architecture rules.

## Re-Verification of Prior Findings

| ID | Title | Prior Status | Current Status | Evidence |
|----|-------|-------------|----------------|----------|
| QUAL-001 | Route handlers call getDb() directly | STILL OPEN | STILL OPEN | `getDb()` present in all 7 route files including new pipelines.ts |
| QUAL-002 | Services import AppError from middleware | STILL OPEN | STILL OPEN | All 7 service files (including new pipelineService.ts, feedbackService.ts) import AppError from middleware/errorHandler |
| QUAL-003 | Duplicate type definitions (9 types) | STILL OPEN | STILL OPEN | Services define VALID_STATUSES/VALID_SEVERITIES inline; shared types exist in Source/Shared/types.ts |
| QUAL-004 | Silent OTEL init failure | STILL OPEN | STILL OPEN | `tracing.ts:36-38` catch block still silent — no logger call on SDK start failure |
| QUAL-005 | ESLint suppressions undocumented | STILL OPEN | STILL OPEN | Same 2 suppressions: `errorHandler.ts:21` and `useApi.ts:35` |
| QUAL-006 | Traceability enforcer requirements outdated | NEW (last audit) | STILL OPEN | Enforcer reads only FR-001-032; FR-033-069 now implemented but not in enforcer scope |
| QUAL-007 | Pipeline FRs lack formal Verifies comments | NEW (last audit) | REGRESSED | Expanded from 6 to 16 FRs — FR-050-062 added without source markers |
| QUAL-008 | Pipeline service imports from middleware | NEW (last audit) | STILL OPEN | pipelineService.ts:16 still imports AppError from middleware; feedbackService.ts has same pattern |
| QUAL-009 | pipelines.test.ts exceeds 500-line guideline | NEW (last audit) | STILL OPEN | pipelines.test.ts still 1010+ lines; feedback.test.ts is new potential large file |

## Data Integrity Check

### Bugs with missing FR references (live API)
- BUG-0001 "Chaos test bug": no `related_work_item_id`, `related_work_item_type`, `related_cycle_id` (DB columns absent)
- BUG-0002 "Bug for manual override test": same — no reference fields
- **Root cause:** DB not migrated (QUAL-P001)

### Tickets with missing issue information and considered fixes (live API)
- TKT-0001 "Test ticket" (CYCLE-0001): no `work_item_ref`, `issue_description`, `considered_fixes`
- TKT-0002 "Blocker ticket" (CYCLE-0003): no `work_item_ref`, `issue_description`, `considered_fixes`
- **Root cause:** DB not migrated (QUAL-P001)

### Cycles with missing team attribution (live API)
- CYCLE-0001: `team_name` absent from response (pipeline run RUN-0001 has team="TheATeam")
- CYCLE-0002: `team_name` absent from response (pipeline run RUN-0002 has team="TheATeam")
- CYCLE-0003: `team_name` absent from response (pipeline run RUN-0003 has team="TheATeam")
- **Root cause:** Server running stale cycleService.ts without team_name hydration (QUAL-P005)

### Feedback not linked to tickets (live API)
- Zero feedback records in any cycle
- `cycle_feedback` table does not exist in the database
- Feedback route returns HTTP 404 for all cycles
- **Root cause:** DB not migrated, server not restarted (QUAL-P001, QUAL-P002, QUAL-P006)

### Features missing traceability reports (live API)
- FEAT-0001 "Second FR for pipeline testing": no `cycle_id`, no `traceability_report`
- FEAT-0002 "Chaos test bug": no `cycle_id`, no `traceability_report`
- FEAT-0003 "Bug for manual override test": no `cycle_id`, no `traceability_report`
- **Root cause:** DB not migrated; existing features created before schema existed (QUAL-P007)
- **Note:** Traceability reports DO exist as static files in `Plans/dev-workflow-platform/` (traceability-report-run3.md through run5.md) but are not linked to Feature DB records

## Cross-References

- **[CROSS-REF: all-specialists]** QUAL-P001 (stale server/DB) is the single root cause for QUAL-P002, QUAL-P003, QUAL-P004, QUAL-P005, QUAL-P006, QUAL-P007. Restarting the server resolves the deployment gap and self-heals the DB schema via idempotent migrations.
- **[CROSS-REF: chaos-monkey]** CHAOS-006 (non-transactional multi-table writes in createCycle) compounds QUAL-P001: even after restart, any crash during cycle creation could leave DB in partial-migration state.
- **[CROSS-REF: red-teamer]** SEC-001/SEC-002 (no auth) means the newly deployed feedback endpoint (after restart) will be immediately accessible to unauthenticated callers.
- **[CROSS-REF: quality-oracle prior]** QUAL-007 regressed from 6 FRs to 16 FRs — the FR-050–062 implementation team added source files without adding formal `// Verifies:` markers, widening the gap.

```json
{
  "audit_date": "2026-03-24",
  "mode": "hybrid",
  "total_frs": 69,
  "source_verifies_coverage": 47,
  "source_verifies_pct": 68.1,
  "test_verifies_coverage": 69,
  "test_verifies_pct": 100.0,
  "enforcer_result": "PASS",
  "process_findings": [
    {"id": "QUAL-P001", "severity": "P1", "title": "Live DB Missing All FR-052 Schema Migrations"},
    {"id": "QUAL-P002", "severity": "P1", "title": "Feedback API Routes Return 404 in Live Environment"},
    {"id": "QUAL-P003", "severity": "P1", "title": "No Bugs Have FR/Internal Ticket References"},
    {"id": "QUAL-P004", "severity": "P1", "title": "No Tickets Have Complete Issue Information or Considered Fixes"},
    {"id": "QUAL-P005", "severity": "P1", "title": "Dev Cycles Do Not Show Team Attribution in API Response"},
    {"id": "QUAL-P006", "severity": "P1", "title": "Feedback Not Linked to Tickets — Zero Feedback Records"},
    {"id": "QUAL-P007", "severity": "P1", "title": "Features Missing Traceability Reports"},
    {"id": "QUAL-P008", "severity": "P2", "title": "Bug Backlog Missing Recommendations for 26 of 34 Entries"},
    {"id": "QUAL-P009", "severity": "P2", "title": "Traceability Enforcer Requirements File Still Missing FR-033–FR-069"},
    {"id": "QUAL-P010", "severity": "P3", "title": "16 Non-Meta FRs Lack Formal Source Verifies Comments"}
  ],
  "prior_findings": {
    "QUAL-001": "STILL_OPEN",
    "QUAL-002": "STILL_OPEN",
    "QUAL-003": "STILL_OPEN",
    "QUAL-004": "STILL_OPEN",
    "QUAL-005": "STILL_OPEN",
    "QUAL-006": "STILL_OPEN",
    "QUAL-007": "REGRESSED",
    "QUAL-008": "STILL_OPEN",
    "QUAL-009": "STILL_OPEN"
  }
}
```
