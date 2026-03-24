# Security Review Report — Development Workflow Platform (Run 4)

**Pipeline Run ID:** (pending — assigned by orchestrator)
**Reviewer:** Security QA Agent
**Date:** 2026-03-24
**Scope:** Source/Backend/src/ and Source/Frontend/src/ — focused on orchestrated dev cycles (FR-033 through FR-049) and carry-forward of all prior findings
**Previous Report:** Plans/dev-workflow-platform/security-report-run3.md (Run 3)

---

## Verdict: PASSED_WITH_WARNINGS

The pipeline orchestration feature (FR-033–FR-049) is correctly implemented with appropriate security controls. All prior Run 3 findings carry forward at the same or reduced severity. The new pipeline code follows established patterns: parameterized queries, try/catch error handling, input validation on stage numbers, and verdict enum enforcement. Two new LOW findings and one MEDIUM residual are identified. No CRITICAL or HIGH issues found.

---

## Test Results

| Suite | Files | Tests | Result |
|-------|-------|-------|--------|
| Backend | 9 | 350 | ALL PASSED |
| Frontend | 9 | 110 | ALL PASSED |
| Traceability | — | 39 FRs | PASS (100% coverage) |

**Total: 460 tests passing, 0 failures.**
**Baseline comparison:** Run 3 had 388 tests (295 backend + 93 frontend). Run 4 adds 72 tests (55 backend pipeline + 17 frontend pipeline). Zero regressions.

---

## New Feature Security Analysis (FR-033 through FR-049)

### Pipeline Stage Ordering Enforcement (DD-15) — CORRECT

`pipelineService.startStage()` (line 213-217) correctly enforces linear ordering: stage N-1 must have status `completed` before stage N can start. Prevents stage-skipping attacks.

### Verdict Validation — CORRECT

`pipelineService.completeStageAction()` (line 248-249) validates verdict is exactly `'approved'` or `'rejected'`. Invalid values throw AppError(400).

### Pipeline-Linked Cycle Lock (FR-039, DD-13) — CORRECT

`cycleService.updateCycle()` (lines 240-245) blocks manual status PATCH on pipeline-linked cycles with a 409 error, preventing manual/pipeline state conflicts. `spec_changes` updates are still allowed.

### Stage Number Validation — CORRECT

`pipelines.ts` routes (lines 67-68, 91-92) validate `stageNumber` is 1-5 and not NaN. Prevents out-of-range stage injection.

### SQL Injection — SAFE

All new queries in `pipelineService.ts` use parameterized `?` placeholders with `better-sqlite3` prepared statements. The `statusFilter` in `listPipelineRuns` is bound as a parameter (line 168), not interpolated.

### ID Generation — SAFE

`generateRunId()` (lines 103-111) follows the DD-10 MAX-based pattern. Pipeline stage IDs use UUIDs (line 132).

### Error Handling — CORRECT

All 5 route handlers in `pipelines.ts` and the convenience handler `getCyclePipelineHandler` use try/catch + next(err) per DD-3.

### JSON.parse of agent_ids — LOW RISK

`mapStageRow()` (line 74) calls `JSON.parse(row.agent_ids)` on data read from the database. This data is only ever written by `createPipelineRun()` using `JSON.stringify(stage.agents)` from the hardcoded `PIPELINE_STAGES` array (lines 23-29). No user input reaches this JSON.parse call. Safe.

### Frontend — SAFE

No `dangerouslySetInnerHTML`, `innerHTML`, `eval()`, or `document.write()` found in any frontend file. All pipeline data rendered as JSX text nodes. API client uses relative URLs and URLSearchParams for safe query construction.

---

## Run 3 Findings — Carry-Forward Verification

| ID | Previous Finding | Status | Notes |
|----|-----------------|--------|-------|
| H-01 | No CORS configuration | **FIXED** (Run 2) | Still correct. `index.ts:26-35` whitelist CORS |
| M-01 | All endpoints unauthenticated | **UNCHANGED** | Deliberate v1 decision. **New pipeline endpoints also unauthenticated** — stage start/complete are state-changing operations. |
| M-02 | `denyFeatureRequest` allows any status | **FIXED** (Run 2) | Still correct |
| M-03 | Unbounded activity limit | **FIXED** (Run 2) | Still correct. MAX_ACTIVITY_LIMIT = 200 |
| M-04 | Input length validation incomplete | **FIXED** (Run 3) | Still correct across FR, bug, learning, ticket creation |
| L-01 | COUNT-based ID generation | **FIXED** (Run 3) | Still correct. Pipeline runs also use MAX-based |
| L-02 | `/metrics` on same port | **UNCHANGED** | Accepted v1 risk |
| L-03 | Unvalidated enums | **FIXED** (Run 2) | Still correct |
| L-04 | Missing try/catch | **FIXED** (Run 2) | Still correct. New pipeline routes also covered |
| L-05-R | Uncapped length on spec_changes, assignee, ticket updates | **UNCHANGED** | See L-05-R below |
| L-06 | Non-integer limit silently defaulted | **UNCHANGED** | Low risk |
| L-07 | Bug status transitions not guarded | **UNCHANGED** | Low risk |

---

## Summary Table

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH     | 0 |
| MEDIUM   | 1 (M-01 unchanged — deliberate v1 decision) |
| LOW      | 5 (L-02, L-05-R, L-06, L-07 unchanged + L-08 new) |
| INFO     | 5 |

---

## Findings

### MEDIUM

#### M-01 — All API Endpoints Unauthenticated (Unchanged, Deliberate)

**Status:** Unchanged. Now includes 5 new pipeline endpoints.

**Files:** `Source/Backend/src/routes/pipelines.ts`, all existing route files
**Description:** All endpoints remain accessible without authentication or authorization. This now includes pipeline stage start/complete endpoints, which are state-changing operations that drive the entire development cycle. Any caller can start or complete pipeline stages, potentially advancing or disrupting orchestrated cycles.

**Impact on new feature:** An unauthenticated actor could:
- Complete stages with `approved` verdict, auto-advancing cycles
- Complete stage 5 to trigger `completeCycle()` with deployment simulation side-effects
- Reject stages to stall pipeline progress

**Severity remains MEDIUM** because this is a deliberate v1 decision per spec and the system is intended for internal/development use.

**Remediation (for v2):** Pipeline stage start/complete endpoints should be among the first to receive authentication, as they drive automated workflow progression. Consider a service-to-service token for orchestrator-only access.

---

### LOW

#### L-02 — `/metrics` Endpoint Exposed Without Network Controls (Unchanged)

**Status:** Unchanged from Run 1.

**File:** `Source/Backend/src/index.ts`
**Description:** Prometheus metrics on same port, no IP restriction. Now also exposes `pipeline_stage_completions_total` counter with stage names and verdicts.

---

#### L-05-R — Uncapped Length on spec_changes, assignee, and Ticket Update Fields (Unchanged)

**Status:** Unchanged from Run 3.

**File:** `Source/Backend/src/services/cycleService.ts`
**Description:** `updateCycle()` (line 273-275) accepts `spec_changes` with no length cap. `updateTicket()` (lines 361-373) accepts `title`, `description`, and `assignee` with no length cap on updates (only creation is capped). The 16 KB express.json body limit provides a backstop.

---

#### L-06 — Dashboard Activity Route Silently Defaults Invalid `limit` (Unchanged)

**Status:** Unchanged from Run 2.

---

#### L-07 — Bug Status Transitions Not Guarded (Unchanged)

**Status:** Unchanged from Run 3.

---

#### L-08 — Pipeline completeStageAction Not Wrapped in a Transaction (NEW)

**File:** `Source/Backend/src/services/pipelineService.ts:241-308`
**Description:** `completeStageAction()` performs multiple database writes (update stage status, update pipeline run, update cycle phase, and for stage 5, call `completeCycle()`) without wrapping them in a `db.transaction()`. While `completeCycle()` in `cycleService.ts` uses `db.transaction()` internally for its own writes, the outer operations (marking stage as completed + updating pipeline run status + advancing cycle phase) are not atomic with the inner transaction.

In the current single-threaded Node.js + synchronous better-sqlite3 architecture, this is not exploitable — all statements execute sequentially without interruption. However, it creates a theoretical inconsistency window if the process crashes mid-execution (e.g., stage marked completed but cycle not advanced).

**Severity:** LOW — Single-threaded architecture makes this unexploitable in practice. The existing `completeCycle()` already uses its own transaction for the most critical multi-write operation.

**Remediation:** Wrap the entire `completeStageAction()` in `db.transaction()`:
```typescript
export function completeStageAction(db, runId, stageNumber, verdict, opts) {
  return db.transaction(() => {
    // ... all existing logic ...
  })();
}
```

---

### INFO

#### I-01 — SQL Injection: All Queries Correctly Parameterized

All new pipeline queries use `better-sqlite3` prepared statements with `?` placeholders. The `statusFilter` parameter in `listPipelineRuns` is bound, not interpolated. Dynamic query construction in `cycleService.updateCycle()` and `updateTicket()` builds only structural SQL from validated field names. **No SQL injection risk identified.**

---

#### I-02 — XSS: React Default Escaping Used Throughout Frontend

No `dangerouslySetInnerHTML`, `innerHTML`, `eval()`, or `document.write()` found in any frontend file including new PipelineStepper and updated CycleView/SummaryWidgets. **No XSS risk identified.**

---

#### I-03 — Error Information Leakage: Stack Traces Not Exposed

Centralized error handler continues to suppress stack traces from client responses. New pipeline route errors follow the same pattern. **No error leakage risk identified.**

---

#### I-04 — No Hardcoded Secrets Found

No API keys, tokens, or passwords in any source file. Pipeline stage agent names are hardcoded configuration (not secrets). **No secrets exposure risk identified.**

---

#### I-05 — No console.log Calls in Backend

Grep confirmed zero `console.log` calls across all backend source files. All logging uses the structured logger abstraction. **Compliant with observability requirements.**

---

## Positive Security Observations

1. **Stage ordering enforcement** — `startStage()` verifies previous stage is completed before allowing the next to start (DD-15)
2. **Verdict enum validation** — Only 'approved' or 'rejected' accepted; invalid values return 400
3. **Pipeline lock on cycles** — Pipeline-linked cycles block manual PATCH status changes (FR-039)
4. **Stage number range validation** — Routes reject stageNumber outside 1-5 and NaN
5. **DD-9 preserved** — PATCH /cycles/:id still blocks `status=complete` for non-pipeline cycles
6. **Rejected verdict safety** — Rejected stages are marked 'failed'; cycle does NOT advance (DD-16)
7. **Retry safety** — Failed stages can be restarted (status check allows 'pending' or 'failed')
8. **completeCycle reuse** — Stage 5 calls the existing completeCycle() with its internal transaction, avoiding logic duplication (DD-14)
9. **UNIQUE constraint on cycle_id** — Schema enforces one pipeline run per cycle, preventing duplicate orchestration
10. **Foreign key cascades** — Deleting a cycle cascades to pipeline_runs and pipeline_stages
11. **Backwards compatibility** — Existing cycles without pipeline_run_id continue to work; all 295 original tests pass
12. **Observability** — Pipeline operations have structured logging, Prometheus counter (pipeline_stage_completions_total), and OTel spans
13. **All try/catch coverage** — All 6 new route handlers (5 in pipelines.ts + 1 getCyclePipelineHandler) use try/catch + next(err)
14. **No unsafe React patterns** — Frontend pipeline components use standard JSX rendering

---

## Comparison: Run 3 → Run 4

| Metric | Run 3 | Run 4 |
|--------|-------|-------|
| Verdict | PASSED_WITH_WARNINGS | PASSED_WITH_WARNINGS |
| CRITICAL | 0 | 0 |
| HIGH | 0 | 0 |
| MEDIUM | 1 (M-01 — deliberate) | 1 (M-01 — unchanged) |
| LOW | 4 | 5 (+1 new: L-08 non-transactional pipeline writes) |
| INFO | 4 | 5 (+1 new: I-05 no console.log) |
| Backend tests | 295 | 350 (+55 pipeline tests) |
| Frontend tests | 93 | 110 (+17 pipeline tests) |
| Traceability | 32 FRs at 100% | 39 FRs at 100% |
| New endpoints | 0 | 5 pipeline endpoints + 1 convenience |
| New pipeline guards | N/A | Stage ordering, verdict validation, pipeline cycle lock, stage number validation |

---

## Architecture Compliance

| Rule | Status |
|------|--------|
| Specs are source of truth | PASS — Implementation traces to FR-033 through FR-049 |
| No direct DB calls from routes | PASS — Routes delegate to pipelineService |
| Shared types single source | PASS — Pipeline types in Shared/types.ts |
| Every FR has a test with traceability | PASS — 39/39 FRs covered |
| Schema changes via migration | PASS — pipeline_runs, pipeline_stages tables in schema.ts |
| No hardcoded secrets | PASS |
| List endpoints return {data: T[]} | PASS — GET /api/pipeline-runs returns {data: PipelineRun[]} |
| Routes have observability | PASS — Structured logging, metrics counter, OTel spans |
| Business logic has no framework imports | PASS — pipelineService uses only DB + types |
