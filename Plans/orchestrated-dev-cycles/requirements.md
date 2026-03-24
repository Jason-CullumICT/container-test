# Requirements Review: Orchestrated Development Cycles

**Reviewer:** team_leader (planning mode)
**Date:** 2026-03-24
**Spec:** Plans/orchestrated-dev-cycles/design.md
**Base Spec:** Specifications/dev-workflow-platform.md

---

## Verdict: APPROVED

The feature extends the existing development cycle subsystem (SS-5) with pipeline orchestration. It builds on existing entities, selection logic, and cycle phases without breaking backwards compatibility. The stage-to-phase mapping is clean (5 stages → 5 phase transitions). All new entities have clear ownership and the API surface is minimal.

**Conditions / Clarifications:**
- Existing cycles without pipeline_run_id continue to work unchanged (DD-17)
- Manual phase advancement via PATCH is preserved for backwards compatibility (DD-13)
- Stage completion is the ONLY way to advance a pipeline-linked cycle (prevents manual/pipeline conflicts)
- The 10% deployment failure simulation in completeCycle() is reused, not duplicated

---

## Functional Requirements

| ID | Description | Layer | Weight | Acceptance Criteria |
|----|-------------|-------|--------|---------------------|
| FR-033 | Add `PipelineRun` and `PipelineStage` TypeScript types to `Source/Shared/types.ts`; add `pipeline_run_id` and optional `pipeline_run` to `DevelopmentCycle` | [fullstack] | S | Types compile; both backend and frontend import them |
| FR-034 | Add `PipelineRunResponse`, `PipelineStageCompleteInput`, and related API types to `Source/Shared/api.ts` | [fullstack] | S | Request/response types cover all new endpoints |
| FR-035 | Add `pipeline_runs` and `pipeline_stages` tables to schema migrations; add `pipeline_run_id` column to `cycles` table | [backend] | M | Tables created idempotently; foreign keys enforce referential integrity; existing cycles unaffected |
| FR-036 | Create `pipelineService.ts` with functions: `createPipelineRun(cycleId)`, `listPipelineRuns(filters)`, `getPipelineRunById(id)`, `getPipelineRunByCycleId(cycleId)`, `startStage(runId, stageNumber)`, `completeStage(runId, stageNumber, verdict)` | [backend] | L | Pipeline runs created with 5 stages; stage completion enforces linear ordering; stage 5 completion triggers cycle completion |
| FR-037 | Modify `cycleService.createCycle()` to also create a PipelineRun with 5 pre-configured stages and auto-start stage 1; link via `pipeline_run_id` on the cycle | [backend] | M | New cycle has a linked pipeline run; pipeline run has 5 stages in pending status; stage 1 is started |
| FR-038 | Implement `pipelineService.completeStage()` to auto-advance the linked cycle phase: stage 1→ticket_breakdown, stage 2→implementation, stage 3→review, stage 4→smoke_test, stage 5→complete (using existing completeCycle) | [backend] | L | Each stage completion advances the correct cycle phase; stage 5 triggers completeCycle with all side-effects (Learning, Feature, CI/CD sim) |
| FR-039 | For pipeline-linked cycles, block manual phase advancement via `PATCH /api/cycles/:id` with status changes; return 409 with message directing to pipeline stage completion | [backend] | S | PATCH with status on a pipeline-linked cycle returns 409; PATCH with spec_changes still allowed |
| FR-040 | Implement pipeline routes: `GET /api/pipeline-runs`, `GET /api/pipeline-runs/:id` (with stages), `POST /api/pipeline-runs/:id/stages/:stageNumber/start`, `POST /api/pipeline-runs/:id/stages/:stageNumber/complete`, `GET /api/cycles/:id/pipeline` | [backend] | M | All endpoints return correct data; stage start/complete enforce ordering; 404 on unknown IDs |
| FR-041 | Modify `GET /api/cycles/:id` to include `pipeline_run_id` and hydrate `pipeline_run` (with stages) when present | [backend] | S | Cycle response includes pipeline data when linked; no pipeline data when not linked; backwards compatible |
| FR-042 | Modify `GET /api/dashboard/summary` to include `pipeline_stage` and `pipeline_status` in `active_cycle` when a pipeline run is linked | [backend] | S | Dashboard summary shows pipeline progress for active cycle |
| FR-043 | Add observability: structured logging for pipeline state transitions, Prometheus counter for stage completions, OpenTelemetry spans for pipeline operations | [backend] | S | Log entries for stage start/complete; `pipeline_stage_completions_total` counter; spans on pipeline service calls |
| FR-044 | Add frontend API client functions for pipeline endpoints | [frontend] | S | Typed functions for all pipeline endpoints; error handling consistent with existing client |
| FR-045 | Create `PipelineStepper` component showing 5-stage pipeline progress with stage names, status indicators, agent labels, and verdicts | [frontend] | M | Stepper shows all 5 stages; active stage highlighted; completed stages show verdict; pending stages grayed out |
| FR-046 | Integrate `PipelineStepper` into `CycleView` — display pipeline progress when cycle has a linked pipeline run; show "Orchestrated via TheATeam" label | [frontend] | M | Pipeline stepper visible on pipeline-linked cycles; hidden on legacy cycles; label indicates team |
| FR-047 | Update `SummaryWidgets` to show pipeline stage name and progress in active cycle widget | [frontend] | S | Dashboard widget shows current pipeline stage alongside cycle phase |
| FR-048 | Write backend tests for pipeline service and routes with `// Verifies: FR-XXX` traceability; cover: creation, stage ordering, auto-advance, cycle completion, error cases | [backend] | L | All pipeline service functions and route handlers tested; traceability enforcer passes; zero regressions |
| FR-049 | Write frontend tests for PipelineStepper and updated CycleView with `// Verifies: FR-XXX` traceability | [frontend] | M | Components render pipeline stages; stage transitions update display; mocked API |

---

## Complexity Point Scale

| Weight | Points |
|--------|--------|
| S | 1 |
| M | 2 |
| L | 4 |

---

## Scoping Plan

### Backend FRs

| FR | Weight | Points |
|----|--------|--------|
| FR-033 | S | 1 |
| FR-034 | S | 1 |
| FR-035 | M | 2 |
| FR-036 | L | 4 |
| FR-037 | M | 2 |
| FR-038 | L | 4 |
| FR-039 | S | 1 |
| FR-040 | M | 2 |
| FR-041 | S | 1 |
| FR-042 | S | 1 |
| FR-043 | S | 1 |
| FR-048 | L | 4 |
| **Backend Total** | | **24 pts** |

### Frontend FRs

| FR | Weight | Points |
|----|--------|--------|
| FR-044 | S | 1 |
| FR-045 | M | 2 |
| FR-046 | M | 2 |
| FR-047 | S | 1 |
| FR-049 | M | 2 |
| **Frontend Total** | | **8 pts** |

**Grand Total: 32 points**

---

## Assignment

### Backend Coder 1 — 24 pts
All backend work (within 5-12pt range → 2 coders, but file proximity is high so 1 coder is acceptable given all pipeline code is new and concentrated).

- FR-033 [S] — Shared types (1 pt)
- FR-034 [S] — Shared API types (1 pt)
- FR-035 [M] — Schema migrations (2 pts)
- FR-036 [L] — Pipeline service (4 pts)
- FR-037 [M] — Modify createCycle (2 pts)
- FR-038 [L] — Stage completion → cycle advancement (4 pts)
- FR-039 [S] — Block manual advancement (1 pt)
- FR-040 [M] — Pipeline routes (2 pts)
- FR-041 [S] — Hydrate pipeline in cycle GET (1 pt)
- FR-042 [S] — Dashboard pipeline info (1 pt)
- FR-043 [S] — Observability (1 pt)
- FR-048 [L] — Backend tests (4 pts)

**Total: 24 pts**

### Frontend Coder 1 — 8 pts
All frontend work.

- FR-044 [S] — API client functions (1 pt)
- FR-045 [M] — PipelineStepper component (2 pts)
- FR-046 [M] — CycleView integration (2 pts)
- FR-047 [S] — Dashboard widget update (1 pt)
- FR-049 [M] — Frontend tests (2 pts)

**Total: 8 pts**

---

## Notes for Implementation Agents

1. **Shared types first** — FR-033 and FR-034 must be completed before backend or frontend work.
2. **Schema before service** — FR-035 must complete before FR-036.
3. **Pipeline service before routes** — FR-036 before FR-040.
4. **Stage 5 completion reuses `completeCycle()`** — do not duplicate Learning/Feature/CI-CD logic (DD-14).
5. **Pipeline-linked cycles block manual status PATCH** — FR-039 modifies the existing `updateCycle()` in cycleService.
6. **Backwards compatibility** — All existing tests must continue to pass. Existing cycles without pipeline_run_id are unaffected.
7. **Stage names** — Use: `requirements`, `api_contract`, `implementation`, `qa`, `integration`.
8. **Agent IDs per stage** — Stage 1: `['requirements-reviewer']`, Stage 2: `['api-contract']`, Stage 3: `['backend-coder', 'frontend-coder']`, Stage 4: `['chaos-tester', 'security-qa', 'traceability-reporter', 'visual-playwright', 'qa-review-and-tests']`, Stage 5: `['design-critic', 'integration-reviewer']`.
9. **Traceability** — All tests must carry `// Verifies: FR-XXX` comments. Run `python3 tools/traceability-enforcer.py` before completion.
10. **Existing test baseline** — 295 backend tests passing. Zero new failures allowed.
