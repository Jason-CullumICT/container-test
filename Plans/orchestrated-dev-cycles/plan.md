# Implementation Plan: Orchestrated Development Cycles

**Date:** 2026-03-24
**Team:** TheATeam
**Specs:** Plans/orchestrated-dev-cycles/design.md, contracts.md, requirements.md
**Base Spec:** Specifications/dev-workflow-platform.md

---

## Overview

Link development cycles to TheATeam pipeline orchestration so that approved features and triaged bugs are automatically shepherded through the full agent pipeline, with cycle and work-item statuses updating as stages complete.

**Total: 32 points** (24 backend + 8 frontend)

---

## Dispatch Plan

### Phase 1: Shared Types (must complete before Phase 2)

**Agent:** backend-coder (owns FR-033, FR-034 since Shared/ falls to backend when no api-contract agent)

| FR | Description | Files | Points |
|----|-------------|-------|--------|
| FR-033 | Add PipelineRun, PipelineStage types + modify DevelopmentCycle, DashboardSummary | `Source/Shared/types.ts` | 1 |
| FR-034 | Add PipelineRunListResponse, CompleteStageInput, etc. | `Source/Shared/api.ts` | 1 |

---

### Phase 2: Backend Implementation (after Phase 1)

**Agent:** backend-coder (single coder — all new pipeline code is concentrated in new files + targeted edits to existing services)

| FR | Description | Files | Points |
|----|-------------|-------|--------|
| FR-035 | Schema migrations: pipeline_runs, pipeline_stages tables; ALTER cycles | `Source/Backend/src/database/schema.ts` | 2 |
| FR-036 | Pipeline service: createPipelineRun, list, get, startStage, completeStage | `Source/Backend/src/services/pipelineService.ts` (NEW) | 4 |
| FR-037 | Modify createCycle to create pipeline run + start stage 1 | `Source/Backend/src/services/cycleService.ts` | 2 |
| FR-038 | completeStage auto-advances cycle phase; stage 5 calls completeCycle | `Source/Backend/src/services/pipelineService.ts` | 4 |
| FR-039 | Block manual PATCH status on pipeline-linked cycles | `Source/Backend/src/services/cycleService.ts` | 1 |
| FR-040 | Pipeline routes | `Source/Backend/src/routes/pipelines.ts` (NEW) | 2 |
| FR-041 | Hydrate pipeline_run in cycle GET | `Source/Backend/src/services/cycleService.ts`, `Source/Backend/src/routes/cycles.ts` | 1 |
| FR-042 | Dashboard pipeline info | `Source/Backend/src/services/dashboardService.ts` | 1 |
| FR-043 | Observability: logging, metrics, tracing | `Source/Backend/src/services/pipelineService.ts`, `Source/Backend/src/routes/pipelines.ts` | 1 |
| FR-048 | Backend tests | `Source/Backend/tests/pipelines.test.ts` (NEW), modify `Source/Backend/tests/cycles.test.ts` | 4 |

**Wire pipeline routes:** Add `app.use('/api/pipeline-runs', pipelineRouter)` in `Source/Backend/src/index.ts`.

---

### Phase 3: Frontend Implementation (after Phase 1, parallel with Phase 2)

**Agent:** frontend-coder

| FR | Description | Files | Points |
|----|-------------|-------|--------|
| FR-044 | API client functions for pipeline endpoints | `Source/Frontend/src/api/client.ts` | 1 |
| FR-045 | PipelineStepper component | `Source/Frontend/src/components/cycles/PipelineStepper.tsx` (NEW) | 2 |
| FR-046 | Integrate PipelineStepper into CycleView | `Source/Frontend/src/components/cycles/CycleView.tsx` | 2 |
| FR-047 | Dashboard widget pipeline info | `Source/Frontend/src/components/dashboard/SummaryWidgets.tsx` | 1 |
| FR-049 | Frontend tests | `Source/Frontend/tests/PipelineStepper.test.tsx` (NEW), modify `Source/Frontend/tests/DevelopmentCycle.test.tsx` | 2 |

---

## Implementation Order & Dependencies

```
Phase 1: FR-033, FR-034 (shared types)
    ├──→ Phase 2: FR-035 → FR-036 → FR-037, FR-038 → FR-039, FR-040, FR-041, FR-042, FR-043 → FR-048
    └──→ Phase 3: FR-044 → FR-045, FR-046, FR-047 → FR-049
```

**Phase 2 internal ordering:**
1. FR-035 (schema) — must be first
2. FR-036 (pipeline service) — depends on schema
3. FR-037 + FR-038 (cycle integration + auto-advance) — depend on pipeline service
4. FR-039, FR-040, FR-041, FR-042, FR-043 (routes, guards, dashboard, observability) — can be parallel
5. FR-048 (tests) — last, after all service code is in place

**Phase 3 internal ordering:**
1. FR-044 (API client) — must be first
2. FR-045, FR-046, FR-047 (components) — depend on client
3. FR-049 (tests) — last

---

## Key Implementation Details

### Pipeline Stage Configuration (hardcoded in pipelineService)

```typescript
const PIPELINE_STAGES: Array<{ name: PipelineStageName; agents: string[] }> = [
  { name: 'requirements', agents: ['requirements-reviewer'] },
  { name: 'api_contract', agents: ['api-contract'] },
  { name: 'implementation', agents: ['backend-coder', 'frontend-coder'] },
  { name: 'qa', agents: ['chaos-tester', 'security-qa', 'traceability-reporter', 'visual-playwright', 'qa-review-and-tests'] },
  { name: 'integration', agents: ['design-critic', 'integration-reviewer'] },
];
```

### Cycle Phase Advancement Map

```typescript
const STAGE_TO_CYCLE_PHASE: Record<number, CycleStatus> = {
  1: 'ticket_breakdown',    // after requirements complete
  2: 'implementation',      // after api_contract complete
  3: 'review',              // after implementation complete
  4: 'smoke_test',          // after qa complete
  // 5: 'complete' handled via completeCycle()
};
```

### ID Generation

Pipeline run IDs: `RUN-XXXX` (MAX-based, same pattern as CYCLE-XXXX, DD-10)
Pipeline stage IDs: UUID (no user-facing ID needed)

### Error Handling

All new route handlers follow DD-3: `try/catch + next(err)`. Use `AppError` for business logic errors.

---

## Verification Gates

Before marking any task done:
```bash
cd Source/Backend && npx vitest run
cd Source/Frontend && npx vitest run
python3 tools/traceability-enforcer.py
```

**Baseline:** 295 backend tests passing. Zero new failures.

---

## Dispatch Instructions for Orchestrator

### Stage 1: Requirements Review — COMPLETE (this document)

### Stage 2: API Contract — COMPLETE (contracts.md)

### Stage 3: Implementation — DISPATCH THESE AGENTS

#### Agent 1: backend-coder

```
Read the role file at Teams/TheATeam/backend-coder.md and follow it exactly.

Task context:
Implement orchestrated development cycles — pipeline orchestration for TheATeam.

Plan file: Plans/orchestrated-dev-cycles/plan.md
Contracts: Plans/orchestrated-dev-cycles/contracts.md
Requirements: Plans/orchestrated-dev-cycles/requirements.md
Design: Plans/orchestrated-dev-cycles/design.md

FRs assigned: FR-033, FR-034, FR-035, FR-036, FR-037, FR-038, FR-039, FR-040, FR-041, FR-042, FR-043, FR-048

Key instructions:
1. Start with FR-033/FR-034 (shared types in Source/Shared/)
2. Then FR-035 (schema migrations)
3. Then FR-036 (new pipelineService.ts)
4. Then FR-037 + FR-038 (modify cycleService, auto-advance)
5. Then FR-039, FR-040, FR-041, FR-042, FR-043 (routes, guards, dashboard, observability)
6. Wire pipeline routes in index.ts: app.use('/api/pipeline-runs', pipelineRouter)
7. Finally FR-048 (tests in pipelines.test.ts + modify cycles.test.ts)
8. Run all verification gates before reporting done
9. Existing 295 backend tests must still pass — zero new failures

Team folder: Teams/TheATeam
Pipeline run ID: {RUN_ID}
Use --run {RUN_ID} for all pipeline-update.sh calls.
```

#### Agent 2: frontend-coder (parallel with Agent 1)

```
Read the role file at Teams/TheATeam/frontend-coder.md and follow it exactly.

Task context:
Implement frontend for orchestrated development cycles — pipeline progress display.

Plan file: Plans/orchestrated-dev-cycles/plan.md
Contracts: Plans/orchestrated-dev-cycles/contracts.md
Requirements: Plans/orchestrated-dev-cycles/requirements.md
Design: Plans/orchestrated-dev-cycles/design.md

FRs assigned: FR-044, FR-045, FR-046, FR-047, FR-049

Key instructions:
1. Start with FR-044 (API client functions in client.ts)
2. Then FR-045 (new PipelineStepper.tsx component)
3. Then FR-046 (integrate into CycleView.tsx)
4. Then FR-047 (update SummaryWidgets.tsx)
5. Finally FR-049 (tests)
6. The shared types (FR-033/FR-034) will be added by backend-coder — if they're not ready yet, add temporary local types and update imports later
7. Run all verification gates before reporting done

Team folder: Teams/TheATeam
Pipeline run ID: {RUN_ID}
Use --run {RUN_ID} for all pipeline-update.sh calls.
```

### Stage 4: QA & Review — DISPATCH ALL AFTER STAGE 3

Standard TheATeam QA pipeline — all Tier 1 agents in parallel, then Tier 2 sequential. No special instructions beyond the standard role files. Focus review on:
- Pipeline stage ordering enforcement
- Cycle phase auto-advancement correctness
- Backwards compatibility with existing non-pipeline cycles
- No new test failures in existing test suite
- Traceability coverage for FR-033 through FR-049
