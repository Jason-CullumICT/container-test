# Chaos Monkey Findings -- 2026-03-24

## Mode: hybrid (static + dynamic)

## Summary

Post-work audit after TheATeam completed pipeline orchestration (FR-033 through FR-049). The pipeline state machine guards (stage ordering, verdict validation, non-running stage protection) are solid. However, three P1 state corruption scenarios were discovered and dynamically confirmed: (1) `completeStageAction` stage 5 path performs non-transactional writes that leave the pipeline `completed` while the cycle is NOT complete if `completeCycle()` throws; (2) `POST /cycles/:id/complete` bypasses the pipeline guard, allowing direct cycle completion while the pipeline is still running -- AND pipeline stage completions then rewrite the "complete" cycle status backward; (3) `createPipelineRun` and `createCycle` both perform multi-table writes without transaction wrappers.

Of 16 prior findings, 2 are now FIXED (CHAOS-010 fully fixed, CHAOS-014 still open), 14 remain STILL OPEN. 5 new findings identified.

## New Findings

### CHAOS-017: completeStageAction stage 5 non-transactional write causes pipeline/cycle state divergence (P1)
- **Category:** Transaction Safety
- **File:** `/workspace/Source/Backend/src/services/pipelineService.ts:274-288`
- **Description:** When stage 5 is completed with `approved` verdict, three operations execute sequentially without a transaction: (1) UPDATE pipeline_stages SET status='completed' (line 275), (2) UPDATE pipeline_runs SET status='completed' (line 282), (3) completeCycle() (line 287). If completeCycle() throws (e.g., incomplete tickets), the pipeline is marked `completed` but the cycle is NOT completed.
- **Failure scenario:**
  1. Pipeline run RUN-0003 is at stage 5 running.
  2. Cycle CYCLE-0003 has 1 incomplete ticket (status=pending).
  3. POST `.../stages/5/complete` with `{"verdict":"approved"}`.
  4. Stage 5 updated to `completed`, pipeline_runs updated to `completed`.
  5. `completeCycle()` throws: "Cannot complete cycle: 1 ticket(s) are not done."
  6. Error propagates to HTTP 409 response.
  7. Result: pipeline_runs.status=`completed`, pipeline_stages[5].status=`completed`, BUT cycle.status=`smoke_test`.
- **Impact:** Pipeline reports success; cycle is stuck. No recovery path -- stage 5 cannot be re-completed (409: "not running"), and the cycle cannot be manually advanced (409: "orchestrated via pipeline"). System is deadlocked.
- **Recommendation:** Wrap lines 275-287 in `db.transaction(() => { ... })()` so all three operations are atomic. If `completeCycle()` throws, pipeline_stages and pipeline_runs are rolled back.
- **Dynamic verification:** YES -- Reproduced on RUN-0003/CYCLE-0003. Pipeline status=completed, cycle status=smoke_test.

### CHAOS-018: POST /cycles/:id/complete bypasses pipeline guard, causes bidirectional state corruption (P1)
- **Category:** State Machine
- **File:** `/workspace/Source/Backend/src/services/cycleService.ts:397-469` and `/workspace/Source/Backend/src/routes/cycles.ts:182-197`
- **Description:** The `completeCycle()` function does NOT check if the cycle is pipeline-linked (`pipeline_run_id` is set). While `updateCycle()` (PATCH) correctly blocks manual status changes on pipeline-linked cycles (FR-039), the `completeCycle()` (POST /complete) has no such guard. This allows directly completing a pipeline-linked cycle while the pipeline run is still at stage 1. Worse: subsequent pipeline stage completions then rewrite the cycle status backward (e.g., from `complete` to `ticket_breakdown`).
- **Failure scenario:**
  1. Create cycle CYCLE-0003 with pipeline RUN-0003 (auto-starts stage 1).
  2. POST `/api/cycles/CYCLE-0003/complete` -- succeeds (204). Cycle is now `complete`.
  3. Pipeline RUN-0003 is still `running` at stage 1.
  4. POST `.../stages/1/complete` with approved verdict -- succeeds.
  5. `completeStageAction` executes `UPDATE cycles SET status = 'ticket_breakdown'`.
  6. Result: Cycle goes from `complete` BACK to `ticket_breakdown`.
- **Impact:** Cycle status oscillates between complete and earlier phases. Work item marked as resolved/completed gets its status overwritten. Features and learnings created during completeCycle() are orphaned artifacts.
- **Recommendation:** Add a pipeline guard to `completeCycle()`: `if (cycle.pipeline_run_id) throw new AppError(409, 'This cycle is orchestrated via pipeline...')`. Also add a cycle-status check in `completeStageAction`: if the cycle is already `complete`, skip the phase advancement UPDATE.
- **Dynamic verification:** YES -- Reproduced. CYCLE-0003 went from `complete` back to `ticket_breakdown` after stage 1 approval on RUN-0003.

### CHAOS-019: createPipelineRun performs 7 non-transactional DB writes (P1)
- **Category:** Transaction Safety
- **File:** `/workspace/Source/Backend/src/services/pipelineService.ts:120-156`
- **Description:** `createPipelineRun()` executes 7 sequential DB writes without a transaction wrapper: 1 INSERT into pipeline_runs, 5 INSERTs into pipeline_stages (one per stage), and 1 UPDATE on cycles (setting pipeline_run_id). If any write fails mid-way (e.g., UNIQUE constraint on cycle_id after the first INSERT but before stages are created), the pipeline_run exists without stages, or stages exist without the cycle link. Additionally, the calling route handler (`POST /api/cycles`) calls `createCycle(db)` then `createPipelineRun(db, cycle.id)` as two separate non-transactional calls. If `createPipelineRun` fails, the cycle exists with work item marked `in_development` but has no pipeline run.
- **Failure scenario:**
  1. POST `/api/cycles` -- `createCycle()` succeeds: cycle INSERT + work item UPDATE.
  2. `createPipelineRun()` starts: INSERT into pipeline_runs succeeds.
  3. Third pipeline_stage INSERT fails (e.g., disk full, SQLite BUSY from another process).
  4. Result: pipeline_run exists with only 2 stages (should have 5). Cycle has no pipeline_run_id. Work item shows `in_development` but pipeline is broken.
- **Impact:** Partial pipeline state. Cycle GET returns pipeline_run_id=null. Stage queries return incomplete stage list. No automated recovery.
- **Recommendation:** Wrap all 7 writes in `createPipelineRun()` in `db.transaction()`. Also wrap the route handler's `createCycle() + createPipelineRun()` pair in a transaction.
- **Dynamic verification:** NO -- Would require injecting a failure mid-transaction, which is destructive. Confirmed via static analysis only.

### CHAOS-020: Pipeline stage completion metrics only track approvals, not rejections (P3)
- **Category:** Observability Gap
- **File:** `/workspace/Source/Backend/src/services/pipelineService.ts:264-272`
- **Description:** The `pipelineStageCompletionsCounter` (Prometheus metric `pipeline_stage_completions_total`) is only incremented when verdict is `approved` (line 278). When verdict is `rejected`, no metric is emitted. This creates a blind spot: operators cannot track rejection rates, stage retry patterns, or failure hotspots via metrics. The counter label includes `verdict` as a dimension, suggesting the intent was to track both.
- **Failure scenario:** A stage is rejected 10 times before approval. Prometheus shows 1 completion, 0 rejections. Operators have no visibility into the retry churn.
- **Impact:** Reduced observability for pipeline health monitoring. Cannot create rejection-rate alerts.
- **Recommendation:** Add `pipelineStageCompletionsCounter.inc({ stage_name: stage.stage_name, verdict: 'rejected' })` in the rejected path (after line 266).
- **Dynamic verification:** NO -- Would require checking Prometheus metrics endpoint after rejection. Static analysis confirmed.

### CHAOS-021: Pipeline ID generation has same TOCTOU race as other services (P2)
- **Category:** State Invariant
- **File:** `/workspace/Source/Backend/src/services/pipelineService.ts:103-111`
- **Description:** `generateRunId()` uses the same `SELECT id ... ORDER BY id DESC LIMIT 1` + increment pattern as all other ID generators (CHAOS-004). Two concurrent `POST /api/cycles` requests could generate the same `RUN-XXXX` ID, causing a `UNIQUE constraint failed` on pipeline_runs. The cycle_id UNIQUE constraint provides partial protection (only one cycle can be active at a time), but the race window exists between the SELECT and the INSERT.
- **Failure scenario:** Two concurrent requests both read `RUN-0003` as last ID, both try to INSERT `RUN-0004`. Second INSERT fails with UNIQUE constraint violation. The cycle was already created (CHAOS-019 -- no transaction), so now there's a cycle without a pipeline run.
- **Impact:** Same class as CHAOS-004. Mitigated by single-process deployment and better-sqlite3 synchronous nature, but fragile design.
- **Recommendation:** Same as CHAOS-004: use AUTOINCREMENT or wrap in transaction with retry.
- **Dynamic verification:** NO -- Single-process deployment prevents race exploitation.

## Re-Verification of Prior Findings

| ID | Title | Prior Status | Current Status | Evidence |
|----|-------|-------------|----------------|----------|
| CHAOS-001 | No SIGTERM/SIGINT handler | STILL OPEN | STILL OPEN | `grep -r "process.on('SIGTERM'" Source/Backend/src/` returns no matches. No signal handlers in index.ts. |
| CHAOS-002 | Tracing init swallows errors | STILL OPEN | STILL OPEN | `tracing.ts:36-38`: `catch (err) { // Tracing initialization failure is non-fatal }` -- comment but no logging. |
| CHAOS-003 | No uncaughtException handler | STILL OPEN | STILL OPEN | No `process.on('uncaughtException')` in codebase. |
| CHAOS-004 | Sequential ID TOCTOU race | STILL OPEN | STILL OPEN | All 6 ID generators (FR, BUG, CYCLE, TKT, LRN, FEAT) plus new pipeline RUN ID use same pattern. |
| CHAOS-005 | Bug status no transition guards | STILL OPEN | STILL OPEN | **Dynamically confirmed:** `PATCH /api/bugs/BUG-0001 {"status":"resolved"}` succeeded from `reported` status. Bug jumped from `reported` to `resolved` to `reported` again with no guard. |
| CHAOS-006 | createCycle non-transactional | STILL OPEN | STILL OPEN | `cycleService.ts:208-221`: INSERT cycles + UPDATE bugs/feature_requests without `db.transaction()`. Now also includes `createPipelineRun()` call in the route handler (CHAOS-019). |
| CHAOS-007 | Health check no DB probe | STILL OPEN | STILL OPEN | `index.ts:50-52`: `res.json({ status: 'ok' })` with no DB query. Dynamically confirmed: health returns OK unconditionally. |
| CHAOS-008 | No unhandledRejection handler | STILL OPEN | STILL OPEN | No `process.on('unhandledRejection')` in codebase. |
| CHAOS-009 | Dashboard full-table scans | STILL OPEN | STILL OPEN | `dashboardService.ts:106`: `SELECT ... FROM feature_requests ORDER BY updated_at DESC` with no LIMIT. Same for all 6 tables. |
| CHAOS-010 | Unbounded input on free-text fields | PARTIALLY FIXED | FIXED | Bug service now has `TITLE_MAX_LENGTH=200` and `DESCRIPTION_MAX_LENGTH=10000` (bugService.ts:14-15). Learning service now has `CONTENT_MAX_LENGTH=10000` (learningService.ts:13). Ticket service has `TICKET_TITLE_MAX_LENGTH=200` and `TICKET_DESCRIPTION_MAX_LENGTH=10000` (cycleService.ts:58-59). **Dynamically confirmed:** POST /api/bugs with 250-char title returns 400; POST /api/learnings with 15000-char content returns 400. All entity creation endpoints now have length limits. |
| CHAOS-011 | Frontend no request timeout | NEW (prior) | STILL OPEN | `client.ts:46`: `fetch(path, {...options})` with no AbortController or timeout. |
| CHAOS-012 | useApi no unmount cleanup | NEW (prior) | STILL OPEN | `useApi.ts:23-36`: No AbortController, no cleanup function returned from useEffect. |
| CHAOS-013 | Delete FR/Bug no cycle ref check | NEW (prior) | STILL OPEN | **Dynamically confirmed:** `DELETE /api/feature-requests/FR-0001` returned 204 while CYCLE-0001 referenced it. Cycle's work_item_id became a dangling reference (FR-0001 was later re-created with same ID by coincidence). |
| CHAOS-014 | deleteFeatureRequest non-transactional | NEW (prior) | STILL OPEN | `featureRequestService.ts:289-290`: Two separate DELETE statements without transaction. |
| CHAOS-015 | No auto-restart / process manager | NEW (prior) | STILL OPEN | No pm2, Docker restart policy, or systemd config found. Server runs via `tsx src/index.ts`. |
| CHAOS-016 | Frontend no network error distinction | NEW (prior) | STILL OPEN | `client.ts:46`: fetch TypeError propagates as generic error. |

## Cross-References

- [CROSS-REF: code-quality] CHAOS-017, CHAOS-018, CHAOS-019: Transaction safety and state machine gaps in pipeline orchestration code -- new code from TheATeam dev cycles.
- [CROSS-REF: code-quality] CHAOS-020: Observability gap in pipeline metrics -- `pipelineStageCompletionsCounter` only tracks approvals.
- [CROSS-REF: code-quality] CHAOS-021: Pipeline ID generation inherits CHAOS-004 anti-pattern.
- [CROSS-REF: code-quality] CHAOS-005: Dynamic proof that bug status transitions are unguarded. BUG-0001 jumped `reported -> resolved -> reported` via PATCH.
- [CROSS-REF: code-quality] CHAOS-013: Dynamic proof that deleting an FR with an active cycle reference succeeds (204).

## Severity Distribution

| Severity | Count | IDs |
|----------|-------|-----|
| P1 | 4 | CHAOS-006, CHAOS-017, CHAOS-018, CHAOS-019 |
| P2 | 5 | CHAOS-001, CHAOS-003, CHAOS-004, CHAOS-005, CHAOS-008, CHAOS-013, CHAOS-021 |
| P3 | 8 | CHAOS-002, CHAOS-007, CHAOS-009, CHAOS-011, CHAOS-012, CHAOS-014, CHAOS-015, CHAOS-020 |
| P4 | 1 | CHAOS-016 |

```json
{
  "audit_date": "2026-03-24",
  "mode": "hybrid",
  "invariants_checked": 21,
  "faults_injected": 12,
  "total_findings": 21,
  "new_findings": 5,
  "re_verified": 16,
  "status_breakdown": {
    "still_open": 14,
    "fixed": 1,
    "partially_fixed": 0,
    "regressed": 0,
    "new": 5
  },
  "severity_breakdown": {
    "P1": 4,
    "P2": 7,
    "P3": 8,
    "P4": 1
  },
  "dynamically_verified": [
    "CHAOS-005",
    "CHAOS-007",
    "CHAOS-010",
    "CHAOS-013",
    "CHAOS-017",
    "CHAOS-018"
  ],
  "findings": [
    { "id": "CHAOS-001", "severity": "P2", "category": "graceful-shutdown", "status": "STILL OPEN" },
    { "id": "CHAOS-002", "severity": "P3", "category": "error-handling", "status": "STILL OPEN" },
    { "id": "CHAOS-003", "severity": "P2", "category": "error-handling", "status": "STILL OPEN" },
    { "id": "CHAOS-004", "severity": "P2", "category": "state-invariant", "status": "STILL OPEN" },
    { "id": "CHAOS-005", "severity": "P2", "category": "state-invariant", "status": "STILL OPEN" },
    { "id": "CHAOS-006", "severity": "P1", "category": "transaction-boundary", "status": "STILL OPEN" },
    { "id": "CHAOS-007", "severity": "P3", "category": "missing-health-probe", "status": "STILL OPEN" },
    { "id": "CHAOS-008", "severity": "P2", "category": "error-handling", "status": "STILL OPEN" },
    { "id": "CHAOS-009", "severity": "P3", "category": "resource-limit", "status": "STILL OPEN" },
    { "id": "CHAOS-010", "severity": "P3", "category": "unbounded-input", "status": "FIXED" },
    { "id": "CHAOS-011", "severity": "P3", "category": "missing-timeout", "status": "STILL OPEN" },
    { "id": "CHAOS-012", "severity": "P3", "category": "resource-leak", "status": "STILL OPEN" },
    { "id": "CHAOS-013", "severity": "P2", "category": "state-invariant", "status": "STILL OPEN" },
    { "id": "CHAOS-014", "severity": "P3", "category": "transaction-boundary", "status": "STILL OPEN" },
    { "id": "CHAOS-015", "severity": "P3", "category": "recovery-failure", "status": "STILL OPEN" },
    { "id": "CHAOS-016", "severity": "P4", "category": "error-handling", "status": "STILL OPEN" },
    { "id": "CHAOS-017", "severity": "P1", "category": "transaction-safety", "status": "NEW" },
    { "id": "CHAOS-018", "severity": "P1", "category": "state-machine", "status": "NEW" },
    { "id": "CHAOS-019", "severity": "P1", "category": "transaction-safety", "status": "NEW" },
    { "id": "CHAOS-020", "severity": "P3", "category": "observability-gap", "status": "NEW" },
    { "id": "CHAOS-021", "severity": "P2", "category": "state-invariant", "status": "NEW" }
  ]
}
```
