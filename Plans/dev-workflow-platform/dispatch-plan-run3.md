# Dispatch Plan: Development Workflow Platform (Run 3)

**Pipeline Run:** (pending — orchestrator assigns RUN_ID)
**Date:** 2026-03-23
**Team Leader:** team_leader
**Status:** READY FOR DISPATCH

---

## Context

### Reference Image
The doodle at `.orchestrator-runs/run-1774255157427-b28e9081/attachments/Overview-Doodle.png` depicts the full development workflow lifecycle — a closed-loop system with 7 subsystems:

1. **Feature Request Intake** (SS-1): Multiple input sources (Manual, Zendesk, Competitor Analysis, Code Review) feed into a Contributions Intake funnel
2. **AI Voting & Triage** (SS-2): Multiple AI agents vote on potential FRs, adding comments and refining. An FR Writer agent enriches descriptions. Denied FRs are archived with written explanations.
3. **Human Approval** (SS-3): Approved-by-AI FRs go through a human approval gate → Approved FRs backlog
4. **Bug Tracking** (SS-4): Bug reports from the running system and CI/CD feed into a prioritized Bug List. Bugs take priority over FRs.
5. **Development Cycle** (SS-5): Bug/Approved FR enters → Make changes to spec → Break out tickets → Implementation Loop (get next ticket → code → Code Review → PR Tests Pass → Security Agent) → Reviewer test changes → Smoke test
6. **CI/CD Integration** (SS-6): Completed cycles trigger deployment; failures create bug reports (feedback loop)
7. **Documentation & Learnings** (SS-7): Outputs are Doc Updates, Learnings, and Feature Browser

All of this maps 1:1 to the specification at `Specifications/dev-workflow-platform.md`.

### Current State (After Run 2)

**What works:**
- All 32 FRs (FR-001 through FR-032) are implemented
- 280 backend tests pass, 87 frontend tests pass
- Traceability: 100% (32/32 FRs covered)
- All run-1 BLOCKERs fixed (column name mismatch, voting auto-transition)
- All run-1 WARNINGs fixed (try/catch, status transitions, CORS, enum validation, input length)
- QA Run 2: PASSED
- Security: PASSED_WITH_WARNINGS (no HIGH/CRITICAL)

**What needs fixing (from integration review):**
- **NEW-BLOCKER-1**: `PATCH /api/cycles/:id` can set `status=complete` directly, bypassing `POST /complete` side-effects (no Learning/Feature created, no deploy failure check)
- **NEW-BUG-1**: COUNT-based ID generation causes PRIMARY KEY collisions after deletes (all 6 service files)
- **INFO-1**: `STATUS_TRANSITIONS` allows `voting → approved` via PATCH, bypassing vote-check in `approveFeatureRequest`
- **M-04 partial**: Input length validation missing from `bugService.ts` and `learningService.ts`
- **WARNING-2**: Inconsistent logger import style (cosmetic)

### Stage 1 (Requirements) — ALREADY COMPLETE
Requirements approved in run 1. See `Plans/dev-workflow-platform/requirements.md`.

### Stage 2 (API Contract) — ALREADY COMPLETE
Contracts written in run 1. See `Plans/dev-workflow-platform/contracts.md`.

### Design Decisions to Add

**DD-9: Block `complete` status via PATCH (NEW-BLOCKER-1 fix)**
`PATCH /api/cycles/:id` must reject `status=complete`. Callers must use `POST /api/cycles/:id/complete` which has side-effects (create Learning, Feature, simulate deployment). Add guard in `updateCycle`:
```typescript
if (newStatus === 'complete') {
  throw new AppError(400, 'Use POST /api/cycles/:id/complete to complete a cycle.');
}
```

**DD-10: MAX-based ID generation (NEW-BUG-1 fix)**
Replace COUNT-based ID generation with MAX-based in all services:
```typescript
function generateId(db: Database.Database, table: string, prefix: string): string {
  const row = db.prepare(`SELECT id FROM ${table} ORDER BY id DESC LIMIT 1`).get() as { id: string } | undefined;
  const num = row ? String(parseInt(row.id.split('-')[1]) + 1).padStart(4, '0') : '0001';
  return `${prefix}-${num}`;
}
```

**DD-11: Remove `approved` from PATCH-accessible voting transitions (INFO-1 fix)**
Remove `approved` from `STATUS_TRANSITIONS['voting']` in the PATCH endpoint logic. The only way to approve a voting FR should be `POST /approve`. Keep `denied` since `POST /deny` is the standard path. Update `STATUS_TRANSITIONS`:
```typescript
const STATUS_TRANSITIONS = {
  potential: ['voting'],
  voting: ['denied'],      // removed 'approved' — must use POST /approve
  approved: ['in_development'],
  in_development: ['completed'],
  denied: [],
  completed: [],
};
```
Wait — the contract says `voting → approved | denied` via PATCH. But DD-1 says human must call `/approve`. Let's keep the contract as-is but only allow `denied` via PATCH (since `/deny` also exists). Actually, to be safe and avoid breaking the contract, leave `STATUS_TRANSITIONS` as-is. The `/approve` endpoint is the intended path, but PATCH is not incorrect per contract. Mark as INFO only.

**DD-12: Input length validation for bugs and learnings (M-04 fix)**
Add `TITLE_MAX_LENGTH = 200` and `DESCRIPTION_MAX_LENGTH = 10000` validation to `bugService.ts` create/update. Add `CONTENT_MAX_LENGTH = 10000` to `learningService.ts` create.

---

## Stage 3: Implementation — DISPATCH INSTRUCTIONS

This run only needs targeted fixes, not a full rewrite. One backend coder is sufficient.

### Agent: backend-coder-1 (Bug Fixes + Hardening)

**Role file:** `Teams/TheATeam/backend-coder.md`
**Model:** sonnet
**Points:** 8 (estimated)

**Task prompt:**
```
Read the role file at Teams/TheATeam/backend-coder.md and follow it exactly.

Task context:
You are Backend Coder 1. Fix targeted bugs and harden the Development Workflow Platform backend.

IMPORTANT: Source code exists and mostly works. You are making TARGETED FIXES only. Do NOT rewrite working code.

CRITICAL FILES TO READ FIRST:
- Plans/dev-workflow-platform/dispatch-plan-run3.md (this dispatch plan — DD-9 through DD-12)
- Plans/dev-workflow-platform/contracts.md (API contracts + design decisions DD-1 through DD-8)
- Plans/dev-workflow-platform/integration-review-report.md (NEW-BLOCKER-1, NEW-BUG-1)
- Plans/dev-workflow-platform/security-report.md (M-04 partial)

YOUR ASSIGNED FIXES:

1. **NEW-BLOCKER-1 (DD-9)**: In `Source/Backend/src/services/cycleService.ts`, add a guard in `updateCycle` to reject `status=complete` via PATCH. Callers must use `POST /api/cycles/:id/complete`. Return 400 with message: "Use POST /api/cycles/:id/complete to complete a cycle."

2. **NEW-BUG-1 (DD-10)**: Replace COUNT-based ID generation with MAX-based in ALL service files:
   - Source/Backend/src/services/featureRequestService.ts
   - Source/Backend/src/services/bugService.ts
   - Source/Backend/src/services/cycleService.ts (both cycle and ticket ID generation)
   - Source/Backend/src/services/learningService.ts
   - Source/Backend/src/services/featureService.ts

   Use this pattern:
   ```typescript
   const row = db.prepare(`SELECT id FROM ${table} ORDER BY id DESC LIMIT 1`).get();
   const num = row ? String(parseInt(row.id.split('-')[1]) + 1).padStart(4, '0') : '0001';
   ```

3. **M-04 partial (DD-12)**: Add input length validation:
   - bugService.ts: validate title max 200 chars, description max 10000 chars on create and update
   - learningService.ts: validate content max 10000 chars on create

4. **Tests**: Update existing tests and add new ones:
   - Test that PATCH /api/cycles/:id with status=complete returns 400 (// Verifies: FR-014)
   - Test ID generation after delete doesn't collide (// Verifies: FR-006 for FRs, FR-013 for bugs)
   - Test input length validation for bugs and learnings (// Verifies: FR-013, FR-019)

MANDATORY RULES:
1. Do NOT break existing tests — run all tests before and after your changes
2. All route handlers MUST keep try/catch + next(err) pattern (DD-3)
3. Maintain all existing // Verifies: FR-XXX traceability comments
4. Use the exact same coding patterns as existing code

Team folder: Teams/TheATeam
Pipeline run ID: {RUN_ID}
Use --run {RUN_ID} for all pipeline-update.sh calls.
```

---

### Agent: frontend-coder-1 (No changes needed)

The frontend is complete and passing. No frontend dispatch required for this run.

---

## Stage 4: Review & QA — DISPATCH INSTRUCTIONS

### Tier 1 (parallel, unconditional)

All 5 agents run in parallel after Stage 3 completes:

#### Agent: chaos-tester
```
Read the role file at Teams/TheATeam/chaos-tester.md and follow it exactly.

Task context:
Adversarial invariant testing for the Development Workflow Platform — Run 3 focused testing.

FOCUS AREAS (targeted for this run's fixes):
1. Cycle completion bypass: Verify PATCH /api/cycles/:id with status=complete is rejected (DD-9)
2. ID collision after delete: Create entities, delete some, create more — verify no PRIMARY KEY collisions (DD-10)
3. Carry-forward invariants: single active cycle, bugs-before-FRs priority, ticket state machine, voting→human approval flow (DD-1), deny status guard (DD-5)

Spec: Specifications/dev-workflow-platform.md
Contracts: Plans/dev-workflow-platform/contracts.md
Dispatch plan: Plans/dev-workflow-platform/dispatch-plan-run3.md (DD-9, DD-10)
Team folder: Teams/TheATeam
Pipeline run ID: {RUN_ID}
```

#### Agent: security-qa
```
Read the role file at Teams/TheATeam/security-qa.md and follow it exactly.

Task context:
Security review of the Development Workflow Platform — Run 3.

Previous run verdict: PASSED_WITH_WARNINGS.
New fixes to verify:
- M-04 should now be fully resolved (input length validation added to bugService and learningService)
- DD-9: Verify PATCH cannot bypass cycle completion side-effects
- DD-10: Verify ID generation is safe after deletes

Previous findings reference: Plans/dev-workflow-platform/security-report.md
Contracts: Plans/dev-workflow-platform/contracts.md
Dispatch plan: Plans/dev-workflow-platform/dispatch-plan-run3.md
Team folder: Teams/TheATeam
Pipeline run ID: {RUN_ID}
```

#### Agent: traceability-reporter (MANDATORY)
```
Read the role file at Teams/TheATeam/traceability-reporter.md and follow it exactly.

Task context:
Generate FR traceability report for the Development Workflow Platform — Run 3.

Requirements: Plans/dev-workflow-platform/requirements.md (32 FRs)
Previous run had 100% coverage. Verify coverage is maintained after Run 3 fixes.
Team folder: Teams/TheATeam
Pipeline run ID: {RUN_ID}
```

#### Agent: visual-playwright (MANDATORY)
```
Read the role file at Teams/TheATeam/visual-playwright.md and follow it exactly.

Task context:
Visual validation of the Development Workflow Platform frontend — Run 3.

No frontend changes in this run. Verify all 7 pages still render correctly:
Dashboard, Feature Requests, Bug Reports, Development Cycle, Approvals, Feature Browser, Learnings.

Spec: Specifications/dev-workflow-platform.md (UI Requirements section)
Reference doodle: .orchestrator-runs/run-1774255157427-b28e9081/attachments/Overview-Doodle.png
Team folder: Teams/TheATeam
Pipeline run ID: {RUN_ID}
```

#### Agent: qa-review-and-tests
```
Read the role file at Teams/TheATeam/qa-review-and-tests.md and follow it exactly.

Task context:
QA review and test verification for the Development Workflow Platform — Run 3.

VERIFY THESE RUN 3 FIXES:
1. NEW-BLOCKER-1: PATCH /api/cycles/:id with status=complete must return 400 (DD-9)
2. NEW-BUG-1: ID generation after delete must not collide (DD-10)
3. M-04: Input length validation now present in bugService and learningService (DD-12)
4. All previous fixes still in place (DD-1 through DD-8)

Previous reports:
- Plans/dev-workflow-platform/qa-report-run2.md (PASSED)
- Plans/dev-workflow-platform/integration-review-report.md (CONDITIONAL PASS — NEW-BLOCKER-1, NEW-BUG-1)

Contracts: Plans/dev-workflow-platform/contracts.md
Dispatch plan: Plans/dev-workflow-platform/dispatch-plan-run3.md
Team folder: Teams/TheATeam
Pipeline run ID: {RUN_ID}
```

### Tier 2 (sequential, after Tier 1)

#### Agent: design-critic
```
Read the role file at Teams/TheATeam/design-critic.md and follow it exactly.

Task context:
Multimodal visual audit of the Development Workflow Platform UI — Run 3.

No frontend changes in this run. Quick validation that UI still matches spec.
Reference doodle: .orchestrator-runs/run-1774255157427-b28e9081/attachments/Overview-Doodle.png
Spec: Specifications/dev-workflow-platform.md
Team folder: Teams/TheATeam
Pipeline run ID: {RUN_ID}
```

#### Agent: integration-reviewer
```
Read the role file at Teams/TheATeam/integration-reviewer.md and follow it exactly.

Task context:
Integration smoke testing and code review for the Development Workflow Platform — Run 3.

CRITICAL: Verify the two issues from your previous report are fixed:
1. NEW-BLOCKER-1: PATCH /api/cycles/:id must reject status=complete (use POST /complete instead)
2. NEW-BUG-1: Create→delete→create flow must not cause ID collisions

Previous report: Plans/dev-workflow-platform/integration-review-report.md
Contracts: Plans/dev-workflow-platform/contracts.md
Dispatch plan: Plans/dev-workflow-platform/dispatch-plan-run3.md
Team folder: Teams/TheATeam
Pipeline run ID: {RUN_ID}
```

---

## Feedback Loop Rules

- Max 2 feedback iterations
- Only re-run backend-coder-1 (no frontend changes this run)
- Include FULL feedback text from rejecting agent
- If >2 loops needed, stop and escalate to human

---

## Process Cleanup

After all Stage 4 agents complete, verify no orphaned processes (dev servers, test runners) remain.

---

## Summary

| Stage | Agents | Status |
|-------|--------|--------|
| Stage 1: Requirements | (reuse from run 1) | COMPLETE |
| Stage 2: API Contract | (reuse from run 1) | COMPLETE |
| Stage 3: Implementation | backend-coder-1 | READY FOR DISPATCH |
| Stage 4 Tier 1: QA | chaos-tester, security-qa, traceability-reporter, visual-playwright, qa-review-and-tests | READY FOR DISPATCH |
| Stage 4 Tier 2: Review | design-critic, integration-reviewer | READY FOR DISPATCH |

**Total agents to dispatch:** 8 (1 implementation + 7 QA/review)
