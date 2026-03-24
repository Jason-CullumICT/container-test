# Red Teamer Findings -- 2026-03-24

## Mode: hybrid (static + dynamic)

## Summary

The pipeline orchestration feature (FR-033 through FR-049) introduces 5 new API endpoints with zero authentication or authorization. The new pipeline code has solid internal state machine enforcement (linear stage ordering, verdict validation, stage status checks) but introduces three new exploitable vulnerabilities: (1) any anonymous caller can advance pipeline stages and trigger cycle completion with all its side-effects (SEC-015); (2) the direct POST /cycles/:id/complete endpoint can bypass the entire pipeline workflow on pipeline-linked cycles (SEC-016); and (3) the pipeline's cycle-phase auto-advance bypasses the updateCycle transition validation by writing raw SQL (SEC-017). All prior P1/P2 findings remain open with no remediation.

## New Findings

### SEC-015: Unauthenticated Pipeline Stage Manipulation (P1)
- **Category:** OWASP A07 Authentication Failures / A01 Broken Access Control
- **File:** `Source/Backend/src/routes/pipelines.ts:57-108`
- **Description:** Pipeline stage start and complete endpoints have no authentication or authorization. Any network caller can advance pipeline stages, inject verdicts, and trigger completeCycle() with all side-effects.
- **Exploit scenario:** Attacker discovers running pipeline via GET /api/pipeline-runs, then completes all 5 stages with approved verdict, triggering completeCycle() which marks work items complete without any actual work.
- **Impact:** Complete pipeline sabotage. Work items marked complete, feature/learning records created from unauthorized completion.
- **Recommendation:** Add authentication middleware. Add role-based authorization requiring agent/pipeline-operator role.
- **Dynamic verification:** NO -- pipeline routes not yet deployed on running server.

### SEC-016: Pipeline Bypass via Direct Cycle Completion (P2)
- **Category:** OWASP A01 Broken Access Control
- **File:** `Source/Backend/src/services/cycleService.ts:397-469`
- **Description:** completeCycle() does NOT check whether the cycle is pipeline-linked. updateCycle (PATCH) correctly blocks manual status changes, but POST /cycles/:id/complete has no such guard.
- **Exploit scenario:** Call POST /api/cycles/CYCLE-0001/complete directly, bypassing all 5 pipeline quality gates.
- **Impact:** Pipeline quality gates completely bypassed.
- **Recommendation:** Add guard in completeCycle(): if cycle.pipeline_run_id is set, throw 409.
- **Dynamic verification:** YES -- confirmed on live server.

### SEC-017: Pipeline Stage Completion Bypasses Cycle Transition Validation (P2)
- **Category:** OWASP A04 Insecure Design
- **File:** `Source/Backend/src/services/pipelineService.ts:292-294`
- **Description:** completeStageAction directly updates cycle status via raw SQL, bypassing updateCycle()'s linear transition validation.
- **Impact:** Cycle phase integrity can be corrupted if stages are somehow completed out of expected order.
- **Recommendation:** Route all cycle status changes through a validated function.
- **Dynamic verification:** NO -- confirmed via static analysis.

### SEC-018: No Guard Against Operations on Completed Pipeline Runs (P3)
- **Category:** OWASP A04 Insecure Design
- **File:** `Source/Backend/src/services/pipelineService.ts:201-228, 241-308`
- **Description:** Neither startStage() nor completeStageAction() check whether the pipeline run itself is completed/failed.
- **Impact:** Could re-trigger completeCycle() on already-completed pipeline, causing duplicate records.
- **Recommendation:** Add guard: if run.status === 'completed', throw 409.
- **Dynamic verification:** NO -- static analysis.

### SEC-019: Sequential Pipeline Run ID Generation (P3)
- **Category:** OWASP A01 Broken Access Control (IDOR)
- **File:** `Source/Backend/src/services/pipelineService.ts:103-111`
- **Description:** Pipeline run IDs follow sequential pattern (RUN-0001, RUN-0002), enabling enumeration.
- **Impact:** Extends IDOR surface to pipeline domain.
- **Recommendation:** Use UUIDs (uuid package already imported).
- **Dynamic verification:** NO -- static analysis.

### SEC-020: Pipeline Metrics Exposed Without Authentication (P3)
- **Category:** OWASP A01 Broken Access Control
- **File:** `Source/Backend/src/middleware/metrics.ts`
- **Description:** New pipeline_stage_completions_total Prometheus counter exposed via unauthenticated /metrics endpoint.
- **Impact:** Information leakage about pipeline operations.
- **Recommendation:** Gate /metrics behind authentication.
- **Dynamic verification:** YES -- /metrics confirmed accessible.

## Re-Verification of Prior Findings

| ID | Title | Status | Evidence |
|----|-------|--------|----------|
| SEC-001 | No Authentication | STILL OPEN | No auth middleware anywhere |
| SEC-002 | No Authorization | STILL OPEN | No RBAC anywhere |
| SEC-003 | Sequential ID / IDOR | STILL OPEN + EXTENDED | New generateRunId() follows same pattern |
| SEC-004 | Race condition in ID gen | STILL OPEN + EXTENDED | generateRunId() has same TOCTOU |
| SEC-005 | Unauthenticated /metrics | STILL OPEN + EXTENDED | Now includes pipeline metrics |
| SEC-006 | Missing input length limits | STILL OPEN | No new limits for pipeline fields |
| SEC-007 | Unbounded activity feed | STILL OPEN | Dashboard still unbounded |
| SEC-008 | No rate limiting | STILL OPEN | No rate limiting added |
| SEC-009 | No security headers | STILL OPEN | No helmet added |
| SEC-010 | source_system unvalidated | STILL OPEN | Dynamically confirmed |
| SEC-011 | No CSRF protection | STILL OPEN | CORS credentials:true, no CSRF |
| SEC-012 | assignee unvalidated | STILL OPEN | No validation added |
| SEC-013 | DB path controllable | STILL OPEN | No path validation |
| SEC-014 | human_approval_comment no limit | STILL OPEN | No limit added |

## Cross-References
- SEC-015: [CROSS-REF: chaos-monkey] Pipeline manipulation enables state corruption
- SEC-016 / SEC-017: [CROSS-REF: chaos-monkey] CHAOS-018 pipeline bypass, CHAOS-017 state divergence
- SEC-018: [CROSS-REF: chaos-monkey] Re-completion could cause duplicate records
