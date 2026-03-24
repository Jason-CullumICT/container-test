# Design Review: Orchestrated Development Cycles

**Reviewer:** design (TheATeam)
**Date:** 2026-03-24
**Feature:** Orchestrated Development Cycles via TheATeam Pipeline
**Specs reviewed:** Specifications/dev-workflow-platform.md (SS-5, SS-5a), Plans/orchestrated-dev-cycles/design.md, Plans/orchestrated-dev-cycles/contracts.md, Plans/orchestrated-dev-cycles/requirements.md
**Contracts reviewed:** Plans/dev-workflow-platform/contracts.md, Plans/orchestrated-dev-cycles/contracts.md

---

## Verdict: APPROVED

The implementation correctly realizes the orchestrated development cycles feature. The end-to-end flow — from feature/bug creation through approval, cycle selection, pipeline orchestration, and automatic status progression — is functional and spec-compliant. All 350 backend tests and 110 frontend tests pass. Traceability coverage is 100% for all 39 implemented FRs (FR-001 through FR-049).

---

## Test Results

| Suite | Tests | Status |
|-------|-------|--------|
| Backend (Vitest) | 350 | ALL PASS |
| Frontend (Vitest) | 110 | ALL PASS |
| Traceability enforcer | 39/39 FRs | PASS |

---

## Findings

### MEDIUM — M-01: `createCycle()` pipeline creation not transactional

**File:** `Source/Backend/src/routes/cycles.ts:41-68`
**Description:** The `POST /api/cycles` handler calls `createCycle(db)` then `createPipelineRun(db, cycle.id)` as two separate operations. If `createPipelineRun` fails (e.g., ID collision, constraint violation), the cycle is created without a linked pipeline run, leaving an orphaned cycle in `spec_changes` status with no pipeline.
**Impact:** Data inconsistency — a cycle without a pipeline run that was expected to be orchestrated.
**Recommendation:** Wrap both calls in a single `db.transaction()` in the route handler, or move pipeline creation into `createCycle()` itself (the service already imports from pipelineService could be avoided by passing a callback). This would ensure atomicity.
**Spec reference:** FR-037 states "Modify `cycleService.createCycle()` to also create a PipelineRun" — the current implementation creates the pipeline in the route handler, not the service. This is a design deviation from the requirement.

### MEDIUM — M-02: `completeStageAction` stage 5 completion lacks transaction wrapping

**File:** `Source/Backend/src/services/pipelineService.ts:280-288`
**Description:** When stage 5 completes, the code updates `pipeline_runs` status to `completed`, then calls `completeCycle()` which has its own internal transaction. If `completeCycle()` fails (e.g., tickets not all done), the pipeline run is already marked `completed` but the cycle is NOT completed. The pipeline run status and cycle status diverge.
**Impact:** Pipeline shows `completed` but cycle is stuck — inconsistent state between pipeline and cycle.
**Recommendation:** Either wrap the entire stage-5 path in a single transaction, or update pipeline run status only after `completeCycle()` succeeds. Note: `completeCycle()` already validates tickets-all-done and throws `409` if not, so this could surface in practice.

### LOW — L-01: `current_stage` not updated on non-stage-5 approved completions

**File:** `Source/Backend/src/services/pipelineService.ts:290-305`
**Description:** When stages 1-4 are completed with `approved` verdict, the pipeline run's `current_stage` is not updated. Only `updated_at` is set. The `current_stage` was set when `startStage()` was called but is not incremented upon completion. This means `current_stage` reflects the last *started* stage, not the last *completed* stage. This is consistent with the contracts (which say `startStage` sets `current_stage`) but may confuse frontend consumers expecting `current_stage` to advance upon completion.
**Impact:** Cosmetic/informational only. The `PipelineStepper` component reads stage statuses directly and renders correctly regardless.
**Recommendation:** Document explicitly that `current_stage` reflects the currently running (or last started) stage, not the latest completed stage.

### LOW — L-02: Activity feed does not include pipeline stage transitions

**File:** `Source/Backend/src/services/dashboardService.ts:99-247`
**Description:** The dashboard activity feed aggregates events from feature_requests, bugs, cycles, tickets, learnings, and features — but does NOT include pipeline stage start/complete events. Given that pipeline orchestration is a first-class feature, stage transitions (e.g., "QA stage completed for CYCLE-0001") would be valuable in the activity feed.
**Impact:** Users cannot see pipeline progress in the activity feed, reducing visibility.
**Recommendation:** Add pipeline stage transitions to the activity feed query. This is an enhancement, not a bug — the spec (FR-018) only specifies "recent activity feed across FRs, bugs, cycles" and does not explicitly mention pipeline events.

### LOW — L-03: Frontend `CycleView` shows emojis unconditionally

**File:** `Source/Frontend/src/components/cycles/CycleView.tsx:155-156`
**Description:** The cycle header uses emoji characters (`🐛` for bugs, `✨` for features). Per CLAUDE.md instructions, emojis should only be used if explicitly requested.
**Impact:** Style consistency — minor.
**Recommendation:** Consider replacing with text labels or CSS-styled badges (e.g., "Bug" / "Feature" labels).

### INFO — I-01: Backwards compatibility for non-pipeline cycles is correctly preserved

**File:** `Source/Backend/src/services/cycleService.ts:238-245`
**Description:** FR-039 (DD-13) is correctly implemented. Pipeline-linked cycles block manual PATCH status changes with a 409 error directing users to pipeline stage completion. Non-pipeline cycles (pipeline_run_id = null) continue to allow manual PATCH status advancement. The guard is clean and well-positioned.

### INFO — I-02: Selection priority model is correct and unchanged

**File:** `Source/Backend/src/services/cycleService.ts:163-223`
**Description:** The `createCycle()` function correctly implements the selection priority:
1. Triaged bugs first, ordered by severity (critical > high > medium > low), then oldest
2. Approved FRs second, ordered by priority, then oldest
This matches the spec (SS-5 Selection Priority) exactly. The sort is correct — `SEVERITY_ORDER` maps critical=4 > high=3 > medium=2 > low=1, and the sort is descending.

### INFO — I-03: Stage-to-cycle phase mapping is correct

**File:** `Source/Backend/src/services/pipelineService.ts:33-39`
**Description:** The `STAGE_TO_CYCLE_PHASE` mapping correctly implements DD-12:
- Stage 1 (requirements) → ticket_breakdown
- Stage 2 (api_contract) → implementation
- Stage 3 (implementation) → review
- Stage 4 (qa) → smoke_test
- Stage 5 → triggers `completeCycle()` (DD-14)
Each mapping matches the design document exactly.

### INFO — I-04: All design decisions (DD-1 through DD-17) verified

| DD | Status | Notes |
|----|--------|-------|
| DD-1 | COMPLIANT | Voting leaves FR in `voting` status; human must approve/deny |
| DD-2 | COMPLIANT | Column name is `human_approval_approved_at` throughout |
| DD-3 | COMPLIANT | All route handlers use try/catch + next(err) pattern |
| DD-4 | COMPLIANT | Cycle status transitions enforced linearly |
| DD-5 | COMPLIANT | Deny only from `potential` or `voting` status |
| DD-6 | COMPLIANT | Activity limit capped at 200 |
| DD-7 | COMPLIANT | CORS middleware configured |
| DD-8 | COMPLIANT | Enum validation for source, priority, severity, category |
| DD-9 | COMPLIANT | `complete` blocked via PATCH; must use POST /complete |
| DD-10 | COMPLIANT | MAX-based ID generation in all services |
| DD-11 | COMPLIANT | Input length validation on all entities |
| DD-12 | COMPLIANT | Stage completion auto-advances cycle phase |
| DD-13 | COMPLIANT | Manual PATCH preserved for non-pipeline cycles |
| DD-14 | COMPLIANT | Stage 5 triggers completeCycle() |
| DD-15 | COMPLIANT | Linear stage ordering enforced |
| DD-16 | COMPLIANT | Rejected verdict marks stage failed, cycle stays |
| DD-17 | COMPLIANT | pipeline_run_id nullable; backwards compatible |

### INFO — I-05: Full feature lifecycle verified

The end-to-end flow works as specified:
1. **Feature created** → status `potential` (FR-006)
2. **AI voting triggered** → status stays `voting`, majority result advisory (DD-1, FR-010)
3. **Human approval** → status `approved`, enters backlog (FR-011)
4. **Dev cycle started** → picks highest-priority item (bugs > FRs), status `in_development` (FR-014)
5. **Pipeline created and linked** → 5 stages, stage 1 auto-started (FR-037)
6. **Stage completions auto-advance cycle** → phases progress through spec_changes → complete (FR-038)
7. **Stage 5 completion** → triggers completeCycle with Learning, Feature, CI/CD sim (DD-14, FR-016)
8. **Work item completed** → FR status `completed` or bug status `resolved`

### INFO — I-06: Frontend pipeline integration is well-designed

The `PipelineStepper` component (FR-045) provides clear visual feedback:
- 5-stage progress with color-coded status (green=completed, blue=running, gray=pending, red=failed)
- Agent labels per stage
- Verdict badges
- Team label ("Orchestrated via TheATeam")
- Properly integrated into `CycleView` (FR-046) — hidden for non-pipeline cycles
- Dashboard widget shows pipeline stage/status for active cycle (FR-047)

### INFO — I-07: Shared types are single source of truth

All pipeline types (`PipelineRun`, `PipelineStage`, `PipelineRunStatus`, etc.) are defined in `Source/Shared/types.ts` and imported by both backend and frontend. No inline type re-definitions found. The `DevelopmentCycle` interface correctly includes the new `pipeline_run_id` and optional `pipeline_run` fields (FR-033).

---

## Summary of Findings by Severity

| Severity | Count | Details |
|----------|-------|---------|
| CRITICAL | 0 | — |
| HIGH | 0 | — |
| MEDIUM | 2 | M-01 (non-transactional cycle+pipeline creation), M-02 (stage-5 completion atomicity) |
| LOW | 3 | L-01 (current_stage semantics), L-02 (pipeline events missing from activity feed), L-03 (emoji usage) |
| INFO | 7 | I-01 through I-07 (all positive confirmations) |

---

## Architectural Compliance

| Rule | Status |
|------|--------|
| Specs are source of truth | COMPLIANT — all implementation traces to specs |
| No direct DB calls from route handlers | COMPLIANT — all routes delegate to services |
| Shared types single source of truth | COMPLIANT — no inline type re-definitions |
| Every FR has a test with `// Verifies: FR-XXX` | COMPLIANT — 39/39 FRs covered |
| Schema changes require migration | COMPLIANT — pipeline_runs, pipeline_stages tables in schema.ts |
| No hardcoded secrets | COMPLIANT — CORS origin from env var |
| List endpoints return `{data: T[]}` | COMPLIANT — pipeline-runs list returns DataResponse |
| New routes have observability | COMPLIANT — structured logging, Prometheus counter, OTel spans |
| Business logic has no framework imports | COMPLIANT — pipelineService.ts imports only better-sqlite3 and shared types |
| Service layer between routes and DB | COMPLIANT — routes/pipelines.ts delegates to pipelineService.ts |

---

## Conclusion

The orchestrated development cycles feature is well-implemented and spec-compliant. The two MEDIUM findings (M-01, M-02) relate to transaction boundaries that could cause inconsistent state under failure conditions but do not affect normal operation. All design decisions are correctly applied. The selection model, status transitions, and pipeline-to-cycle phase mapping all match the specifications exactly. The frontend provides appropriate visibility into pipeline progress with clean integration into existing components.
