# Implementation Plan: Dev Cycle Full Traceability

**Date:** 2026-03-24
**Team:** TheATeam
**Specs:** Plans/dev-cycle-traceability/design.md, contracts.md, requirements.md
**Base Spec:** Specifications/dev-workflow-platform.md

---

## Overview

Add full traceability to the development cycle pipeline: every bug, ticket, and feature created during a cycle links back to the parent work item. Team feedback is captured as a first-class entity. Traceability reports are persisted on completed features.

**Total: 31 points** (21 backend + 10 frontend)

---

## Dispatch Plan

### Phase 1: Shared Types (must complete before Phase 2)

**Agent:** backend-coder (owns FR-050, FR-051 since Shared/ falls to backend when no api-contract agent)

| FR | Description | Files | Points |
|----|-------------|-------|--------|
| FR-050 | Add CycleFeedback, ConsideredFix types; extend BugReport, Ticket, Feature, DevelopmentCycle | `Source/Shared/types.ts` | 1 |
| FR-051 | Add feedback API types; modify CreateBugInput, CreateTicketInput, CompleteStageInput, CreateFeatureInput | `Source/Shared/api.ts` | 1 |

---

### Phase 2: Backend Implementation (after Phase 1)

**Agent:** backend-coder (single coder — concentrated changes in existing service files + 1 new service)

| FR | Description | Files | Points |
|----|-------------|-------|--------|
| FR-052 | Schema migrations: cycle_feedback table; ALTER bugs, tickets, features | `Source/Backend/src/database/schema.ts` | 2 |
| FR-053 | Feedback service: createFeedback, listFeedback, getFeedbackById | `Source/Backend/src/services/feedbackService.ts` (NEW) | 2 |
| FR-054 | Modify bugService: accept/persist/return related_work_item_id, related_work_item_type, related_cycle_id | `Source/Backend/src/services/bugService.ts` | 1 |
| FR-055 | Modify cycleService.createTicket: accept/persist work_item_ref, issue_description, considered_fixes | `Source/Backend/src/services/cycleService.ts` | 2 |
| FR-056 | Modify completeCycle: pass cycle_id to Feature; populate related fields on deployment-failure bugs | `Source/Backend/src/services/cycleService.ts` | 2 |
| FR-057 | Modify featureService: accept/persist cycle_id, traceability_report | `Source/Backend/src/services/featureService.ts` | 1 |
| FR-058 | Hydrate feedback[] and team_name in getCycleById | `Source/Backend/src/services/cycleService.ts` | 1 |
| FR-059 | Feedback routes: GET/POST /api/cycles/:id/feedback | `Source/Backend/src/routes/cycles.ts` | 1 |
| FR-060 | Modify completeStageAction to accept optional feedback array | `Source/Backend/src/services/pipelineService.ts` | 2 |
| FR-061 | Observability: logging + metrics for feedback | `Source/Backend/src/services/feedbackService.ts`, metrics.ts | 1 |
| FR-062 | Backend tests for all new/modified functions | `Source/Backend/tests/feedback.test.ts` (NEW), modify existing test files | 4 |

**Wire feedback routes:** Add feedback endpoints to existing cycles router in `Source/Backend/src/routes/cycles.ts`.

---

### Phase 3: Frontend Implementation (after Phase 1, parallel with Phase 2)

**Agent:** frontend-coder

| FR | Description | Files | Points |
|----|-------------|-------|--------|
| FR-063 | API client functions for feedback; update types for modified responses | `Source/Frontend/src/api/client.ts` | 1 |
| FR-064 | FeedbackLog component | `Source/Frontend/src/components/cycles/FeedbackLog.tsx` (NEW) | 2 |
| FR-065 | Integrate FeedbackLog into CycleView; show team_name | `Source/Frontend/src/components/cycles/CycleView.tsx` | 1 |
| FR-066 | ConsideredFixesList component | `Source/Frontend/src/components/cycles/ConsideredFixesList.tsx` (NEW) | 1 |
| FR-067 | TraceabilityReport component | `Source/Frontend/src/components/features/TraceabilityReport.tsx` (NEW) | 2 |
| FR-068 | Update BugDetail with related work item/cycle links | `Source/Frontend/src/components/bugs/BugDetail.tsx` | 1 |
| FR-069 | Frontend tests | `Source/Frontend/tests/FeedbackLog.test.tsx` (NEW), etc. | 2 |

---

## Implementation Order & Dependencies

```
Phase 1: FR-050, FR-051 (shared types)
    ├──→ Phase 2: FR-052 → FR-053 → FR-054, FR-055, FR-056, FR-057 → FR-058, FR-059, FR-060, FR-061 → FR-062
    └──→ Phase 3: FR-063 → FR-064, FR-065, FR-066, FR-067, FR-068 → FR-069
```

**Phase 2 internal ordering:**
1. FR-052 (schema) — must be first
2. FR-053 (feedback service) — depends on schema
3. FR-054, FR-055, FR-056, FR-057 (service modifications) — depend on schema; can be done together
4. FR-058, FR-059, FR-060, FR-061 (hydration, routes, pipeline integration, observability) — depend on services
5. FR-062 (tests) — last, after all service code is in place

**Phase 3 internal ordering:**
1. FR-063 (API client) — must be first
2. FR-064, FR-065, FR-066, FR-067, FR-068 (components) — depend on client
3. FR-069 (tests) — last

---

## Key Implementation Details

### CycleFeedback ID Generation

```typescript
// Same MAX-based pattern as other IDs (DD-10)
function generateFeedbackId(db: Database.Database): string {
  const row = db.prepare(`SELECT id FROM cycle_feedback ORDER BY id DESC LIMIT 1`).get();
  let next = 1;
  if (row) {
    const match = row.id.match(/(\d+)$/);
    if (match) next = parseInt(match[1], 10) + 1;
  }
  return `CFBK-${String(next).padStart(4, '0')}`;
}
```

### ConsideredFixes JSON Format

```json
[
  {
    "description": "Add parameterized queries to prevent SQL injection",
    "rationale": "Standard approach, already used elsewhere in codebase",
    "selected": true
  },
  {
    "description": "Add input sanitization layer",
    "rationale": "Would work but doesn't address root cause",
    "selected": false
  }
]
```

### completeCycle() Changes (FR-056)

```typescript
// Feature creation — NOW includes cycle_id
createFeature(db, {
  title: workItemTitle,
  description: `Completed work item: ${cycle.work_item_id} (${cycle.work_item_type})`,
  source_work_item_id: cycle.work_item_id,
  cycle_id: cycleId,  // NEW
});

// Deployment failure bug — NOW includes related fields
if (deploymentFailed) {
  createBug(db, {
    title: `Deployment failure: ${workItemTitle}`,
    description: `Automated deployment failure detected after completing cycle ${cycleId}...`,
    severity: 'high',
    source_system: 'ci_cd',
    related_work_item_id: cycle.work_item_id,        // NEW
    related_work_item_type: cycle.work_item_type,     // NEW
    related_cycle_id: cycleId,                        // NEW
  });
}
```

### Cycle Detail Hydration (FR-058)

```typescript
// In getCycleById, after existing logic:
const feedback = listFeedback(db, cycle.id);
const teamName = cycle.pipeline_run_id
  ? db.prepare(`SELECT team FROM pipeline_runs WHERE id = ?`).get(cycle.pipeline_run_id)?.team || null
  : null;
return { ...cycle, feedback, team_name: teamName };
```

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

**Baseline:** Note current passing test count before starting. Zero new failures.

---

## Dispatch Instructions for Orchestrator

### Stage 1: Requirements Review — COMPLETE (this document)

### Stage 2: API Contract — COMPLETE (contracts.md)

### Stage 3: Implementation — DISPATCH THESE AGENTS

#### Agent 1: backend-coder

```
Read the role file at Teams/TheATeam/backend-coder.md and follow it exactly.

Task context:
Implement dev cycle full traceability — linking all cycle artifacts to parent work items, team feedback capture, and traceability reports on features.

Plan file: Plans/dev-cycle-traceability/plan.md
Contracts: Plans/dev-cycle-traceability/contracts.md
Requirements: Plans/dev-cycle-traceability/requirements.md
Design: Plans/dev-cycle-traceability/design.md

FRs assigned: FR-050, FR-051, FR-052, FR-053, FR-054, FR-055, FR-056, FR-057, FR-058, FR-059, FR-060, FR-061, FR-062

Key instructions:
1. Start with FR-050/FR-051 (shared types in Source/Shared/)
2. Then FR-052 (schema migrations — new table + ALTER TABLE for bugs, tickets, features)
3. Then FR-053 (new feedbackService.ts)
4. Then FR-054, FR-055, FR-056, FR-057 (modify bugService, cycleService.createTicket, cycleService.completeCycle, featureService)
5. Then FR-058 (hydrate feedback[] and team_name in getCycleById)
6. Then FR-059 (feedback routes on cycles router)
7. Then FR-060 (modify completeStageAction in pipelineService to accept feedback)
8. Then FR-061 (observability — logging + Prometheus counter for feedback)
9. Finally FR-062 (tests in feedback.test.ts + modify existing test files)
10. Run all verification gates before reporting done
11. Existing tests must still pass — zero new failures

Team folder: Teams/TheATeam
Pipeline run ID: {RUN_ID}
Use --run {RUN_ID} for all pipeline-update.sh calls.
```

#### Agent 2: frontend-coder (parallel with Agent 1)

```
Read the role file at Teams/TheATeam/frontend-coder.md and follow it exactly.

Task context:
Implement frontend for dev cycle traceability — feedback log, considered fixes display, traceability report viewer, and related work item links.

Plan file: Plans/dev-cycle-traceability/plan.md
Contracts: Plans/dev-cycle-traceability/contracts.md
Requirements: Plans/dev-cycle-traceability/requirements.md
Design: Plans/dev-cycle-traceability/design.md

FRs assigned: FR-063, FR-064, FR-065, FR-066, FR-067, FR-068, FR-069

Key instructions:
1. Start with FR-063 (API client functions + updated types)
2. Then FR-064 (new FeedbackLog.tsx component)
3. Then FR-065 (integrate FeedbackLog into CycleView + team_name display)
4. Then FR-066 (new ConsideredFixesList.tsx)
5. Then FR-067 (new TraceabilityReport.tsx for Feature detail)
6. Then FR-068 (update BugDetail.tsx with related work item/cycle links)
7. Finally FR-069 (tests)
8. The shared types (FR-050/FR-051) will be added by backend-coder — if not ready, add temporary local types and update imports later
9. Run all verification gates before reporting done

Team folder: Teams/TheATeam
Pipeline run ID: {RUN_ID}
Use --run {RUN_ID} for all pipeline-update.sh calls.
```

### Stage 4: QA & Review — DISPATCH ALL AFTER STAGE 3

Standard TheATeam QA pipeline — all Tier 1 agents in parallel, then Tier 2 sequential. Focus review on:
- Bug/ticket/feature traceability field population
- Feedback creation via stage completion
- completeCycle() now populates related fields on bugs and cycle_id on features
- Backwards compatibility — existing bugs/tickets/features without new fields work
- considered_fixes JSON round-trip integrity
- No new test failures in existing test suite
- Traceability coverage for FR-050 through FR-069
