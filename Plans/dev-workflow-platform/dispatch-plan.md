# Dispatch Plan: Development Workflow Platform (Run 2)

**Pipeline Run:** (pending — orchestrator assigns RUN_ID)
**Date:** 2026-03-23
**Team Leader:** team_leader
**Status:** READY FOR DISPATCH

---

## Context

### Reference Image
The doodle at `.orchestrator-runs/run-1774250211495-6eb8ee6c/attachments/Overview-Doodle.png` depicts the full development workflow lifecycle:

1. **Input Sources** (top-right): Task-built code review, Competitor analysis, Zendesk, Running system, Manual feature request — all feeding into a Contributions Intake funnel
2. **AI Voting & Triage** (top-left): Multiple AI agents vote on potential FRs, adding comments and voting approve/deny. An FR Writer agent refines descriptions. Denied FRs are archived with X marks.
3. **Feature Request Pipeline** (left): Potential FRs → AI Voting → Human Approval gate → Approved FRs backlog
4. **Bug Tracking** (middle-right): Bug reports from the running system feed into a prioritized Bug List, with CI/CD integration
5. **Development Cycle** (bottom-center): Bug/Approved FR enters → Make changes to spec → Break out tickets → Implementation Loop (get next ticket → code → code review → PR tests pass → security agent) → Review/test changes → Smoke test
6. **Outputs** (right): Doc Updates, Learnings, Feature Browser
7. **Feedback Loop**: Bugs from the running system and CI/CD failures feed back into the Bug List

All of this maps 1:1 to the specification at `Specifications/dev-workflow-platform.md` (7 subsystems: SS-1 through SS-7).

### Previous Run (run-1774234977-187)
Code exists from a previous pipeline run. All 270 tests pass but QA found:
- **BLOCKER-1**: Column name mismatch (`human_approval_at` vs `human_approval_approved_at`)
- **BLOCKER-2**: Voting auto-transitions FR status, making human approval unreachable
- **WARNING-1**: Missing try/catch in 6 of 7 route files
- **WARNING-3**: Extra status transitions not in contract
- **INFO-1**: No cycle status transition validation
- **Security**: No CORS (H-01), deny allows any status (M-02), unbounded activity limit (M-03), no input length validation (M-04), unvalidated enums (L-03), missing try/catch (L-04)
- **Traceability**: 81.25% coverage — FR-001, FR-021, FR-022, FR-029, FR-030, FR-031 missing

All issues are codified as design decisions DD-1 through DD-8 in `contracts.md`.

### Stage 1 (Requirements) — COMPLETE
Requirements approved. See `Plans/dev-workflow-platform/requirements.md`.
- 32 FRs identified (FR-001 through FR-032)
- Backend: 35 points, Frontend: 21 points

### Stage 2 (API Contract) — COMPLETE
Contracts written. See `Plans/dev-workflow-platform/contracts.md`.
- All shared types defined
- All endpoint contracts specified
- 8 critical design decisions documented

---

## Stage 3: Implementation — DISPATCH INSTRUCTIONS

### Agent: backend-coder-1 (Foundation + Core FR APIs)

**Role file:** `Teams/TheATeam/backend-coder.md`
**Model:** sonnet
**Points:** 18

**Task prompt:**
```
Read the role file at Teams/TheATeam/backend-coder.md and follow it exactly.

Task context:
You are Backend Coder 1. Implement the foundation and core Feature Request APIs for the Development Workflow Platform.

IMPORTANT: Source code already exists from a previous pipeline run. You MUST read the existing code first
and fix/rewrite as needed rather than starting from scratch. The previous run had BLOCKER issues that must be fixed.

CRITICAL FILES TO READ FIRST:
- Plans/dev-workflow-platform/contracts.md (API contracts + design decisions DD-1 through DD-8)
- Plans/dev-workflow-platform/requirements.md (FR list with acceptance criteria)
- Plans/dev-workflow-platform/design.md (architecture and file layout)
- Plans/dev-workflow-platform/qa-report.md (BLOCKER issues from previous run)
- Plans/dev-workflow-platform/security-report.md (security findings to fix)
- Specifications/dev-workflow-platform.md (full spec)

YOUR ASSIGNED FRs:
- FR-001 [M] — Define shared TypeScript types in Source/Shared/types.ts and Source/Shared/api.ts (MUST complete first — other agents depend on this)
- FR-002 [M] — Initialize Express + TypeScript backend with SQLite; schema migrations for all 7 tables. Column name is `human_approval_approved_at` (NOT `human_approval_at` — see DD-2)
- FR-003 [S] — Logger abstraction (structured JSON prod, pretty dev)
- FR-004 [M] — Middleware: request logging, Prometheus metrics at GET /metrics, centralized error handler returning {error: "message"}
- FR-005 [S] — GET /api/feature-requests (list, filterable by status/source)
- FR-006 [M] — POST /api/feature-requests (create, validate, duplicate detection >80% title similarity)
- FR-007 [S] — GET /api/feature-requests/:id (with votes array)
- FR-008 [S] — PATCH /api/feature-requests/:id (enforce valid status transitions per contracts.md)
- FR-009 [S] — DELETE /api/feature-requests/:id (204 No Content)
- FR-010 [L] — POST /api/feature-requests/:id/vote — CRITICAL: per DD-1, voting must leave FR in `voting` status. Majority result is advisory only. Must be testable (injectable randomness or fixed seed)
- FR-021 [M] — OpenTelemetry tracing stubs

PREVIOUS RUN BUGS TO FIX (in your scope):
1. BLOCKER-2: simulateVotingForFR in featureRequestService.ts auto-transitions to approved/denied. MUST leave FR in `voting` status after votes are cast. Store majority result as advisory metadata only.
2. WARNING-1: featureRequests.ts already has try/catch but verify ALL route handlers use the pattern.
3. WARNING-3: VALID_TRANSITIONS allows potential→denied and approved→denied which are NOT in the contract. Remove these extra transitions.
4. Security H-01: Add CORS middleware restricted to process.env.ALLOWED_ORIGINS or http://localhost:5173 (DD-7)
5. Security L-03: Add enum validation for source and priority fields (DD-8)
6. Security M-04: Add input length validation (title max 200, description max 10000)

MANDATORY RULES:
1. All route handlers MUST use try/catch + next(err) pattern (DD-3)
2. Validate source/priority enum values on create/update (DD-8)
3. Include CORS middleware restricted to process.env.ALLOWED_ORIGINS or http://localhost:5173 (DD-7)
4. Ensure package.json has all dependencies (express, better-sqlite3, cors, prom-client, @opentelemetry/*)
5. Write tests for ALL service functions and route handlers with // Verifies: FR-XXX comments
6. Use the exact file layout from design.md
7. Add // Verifies: FR-001 to a test that validates shared types are imported correctly
8. Add // Verifies: FR-021 to a test that validates tracing stubs

Implementation order: Read existing code → Fix BLOCKER-2 → Fix warnings/security → Verify FR-001 through FR-010 → FR-021 → tests

Team folder: Teams/TheATeam
Pipeline run ID: {RUN_ID}
Use --run {RUN_ID} for all pipeline-update.sh calls.
```

---

### Agent: backend-coder-2 (Workflow + Bugs + Dashboard + Tests)

**Role file:** `Teams/TheATeam/backend-coder.md`
**Model:** sonnet
**Points:** 17

**Task prompt:**
```
Read the role file at Teams/TheATeam/backend-coder.md and follow it exactly.

Task context:
You are Backend Coder 2. Implement the workflow cycle, bug tracking, dashboard, learnings, features, and approval/deny endpoints.

IMPORTANT: Source code already exists from a previous pipeline run. You MUST read the existing code first
and fix/rewrite as needed rather than starting from scratch. The previous run had BLOCKER issues that must be fixed.

CRITICAL FILES TO READ FIRST:
- Plans/dev-workflow-platform/contracts.md (API contracts + design decisions DD-1 through DD-8)
- Plans/dev-workflow-platform/requirements.md (FR list with acceptance criteria)
- Plans/dev-workflow-platform/design.md (architecture and file layout)
- Plans/dev-workflow-platform/qa-report.md (BLOCKER issues from previous run)
- Plans/dev-workflow-platform/security-report.md (security findings to fix)
- Specifications/dev-workflow-platform.md (full spec)

DEPENDENCY: Backend Coder 1 creates/fixes Source/Shared/ types, Source/Backend/src/database/, Source/Backend/src/lib/logger.ts, and Source/Backend/src/middleware/. You build on top of those files. If they don't exist yet, wait or create stubs that match the contracts.

YOUR ASSIGNED FRs:
- FR-011 [S] — POST /api/feature-requests/:id/approve — MUST check status === 'voting' AND majority vote is 'approve' (see DD-1)
- FR-012 [S] — POST /api/feature-requests/:id/deny — MUST check status is 'potential' or 'voting' only (DD-5). Store denial comment
- FR-013 [M] — Full CRUD for bug reports (list/create/get/update/delete), filterable by status/severity
- FR-014 [L] — Cycle management: list/create/get/update. POST creates cycle with highest-priority item (bugs before FRs). Only one active cycle allowed (409 if exists)
- FR-015 [M] — Ticket CRUD within cycles + state machine (pending→in_progress→code_review→testing→security_review→done)
- FR-016 [L] — POST /api/cycles/:id/complete — validate all tickets done, create Learning + Feature records, simulated deploy failure creates BugReport
- FR-017 [S] — GET /api/dashboard/summary (counts of FRs by status, bugs by status/severity, active cycle)
- FR-018 [M] — GET /api/dashboard/activity (recent activity feed, limit default 20, MAX 200 per DD-6)
- FR-019 [S] — GET/POST /api/learnings (filterable by category/cycle_id)
- FR-020 [S] — GET /api/features (searchable by ?q=keyword)
- FR-031 [L] — Backend tests for YOUR service functions and route handlers with // Verifies: FR-XXX

PREVIOUS RUN BUGS TO FIX (in your scope):
1. BLOCKER-1: Column name mismatch in featureRequestActionService.ts — all references to `human_approval_at` MUST be changed to `human_approval_approved_at` (DD-2)
2. WARNING-1: Add try/catch + next(err) to ALL route handlers in bugs.ts, cycles.ts, dashboard.ts, learnings.ts, features.ts, and featureRequestActions.ts
3. Security M-02: denyFeatureRequest must check status is 'potential' or 'voting' only (DD-5) — reject 409 for other statuses
4. Security M-03: Dashboard activity limit MUST cap at 200 (DD-6)
5. Security DD-8: Validate enum values: severity on bugs, category on learnings
6. INFO-1: Add cycle status transition validation — enforce linear: spec_changes→ticket_breakdown→implementation→review→smoke_test→complete (DD-4)

MANDATORY RULES:
1. All route handlers MUST use try/catch + next(err) pattern (DD-3)
2. Cycle status transitions MUST be enforced linearly (DD-4)
3. Dashboard activity limit MUST cap at 200 (DD-6)
4. Validate enum values: severity on bugs, category on learnings (DD-8)
5. Column name is human_approval_approved_at (DD-2)
6. Write tests for ALL your service functions and route handlers
7. Add // Verifies: FR-031 meta-comment to confirm backend test coverage

Team folder: Teams/TheATeam
Pipeline run ID: {RUN_ID}
Use --run {RUN_ID} for all pipeline-update.sh calls.
```

---

### Agent: frontend-coder-1 (Full Frontend)

**Role file:** `Teams/TheATeam/frontend-coder.md`
**Model:** sonnet
**Points:** 21

**Task prompt:**
```
Read the role file at Teams/TheATeam/frontend-coder.md and follow it exactly.

Task context:
You are Frontend Coder 1. Build the complete React frontend for the Development Workflow Platform.

IMPORTANT: Source code already exists from a previous pipeline run. You MUST read the existing code first
and fix/enhance as needed rather than starting from scratch.

CRITICAL FILES TO READ FIRST:
- Plans/dev-workflow-platform/contracts.md (API contracts + shared types)
- Plans/dev-workflow-platform/requirements.md (FR list with acceptance criteria)
- Plans/dev-workflow-platform/design.md (architecture and file layout)
- Plans/dev-workflow-platform/traceability-report.md (missing test coverage from previous run)
- Specifications/dev-workflow-platform.md (full spec — UI Requirements section)

DEPENDENCY: Shared types will be at Source/Shared/types.ts and Source/Shared/api.ts. Import using a Vite alias (@shared → ../../Shared or ../Shared). If they don't exist yet, create them matching contracts.md exactly.

YOUR ASSIGNED FRs:
- FR-022 [M] — React + Vite + TypeScript + Tailwind CSS scaffold; layout shell with Sidebar + Header; sidebar badge counts for pending approvals and active bugs
- FR-023 [M] — API client module (Source/Frontend/src/api/client.ts) with typed functions for ALL backend endpoints; uniform error handling
- FR-024 [M] — Dashboard page: summary widgets (FR pipeline counts, bug count, active cycle phase) + activity feed
- FR-025 [L] — Feature Requests page: list with status/source filters, create form, detail view with votes, trigger voting button, approve/deny buttons for voting-state FRs
- FR-026 [M] — Bug Reports page: list with status/severity filters, create form, detail view with severity badge
- FR-027 [L] — Development Cycle page: phase stepper showing all 6 phases, ticket board (kanban by status), start new cycle button
- FR-028 [M] — Approvals page: list of FRs in `voting` status with majority-approve, approve/deny with comment
- FR-029 [S] — Feature Browser page: searchable grid/list of completed features with debounced search
- FR-030 [S] — Learnings page: list filterable by category and cycle, category badge
- FR-032 [L] — Frontend Vitest/RTL tests for key components with // Verifies: FR-XXX

PREVIOUS RUN GAPS TO FIX:
1. FR-022: No test covers the layout/sidebar/navigation — add a Layout.test.tsx with // Verifies: FR-022
2. FR-029: No test for Feature Browser page — create FeatureBrowser.test.tsx with // Verifies: FR-029
3. FR-030: No test for Learnings page — create Learnings.test.tsx with // Verifies: FR-030
4. Ensure the Approvals page aligns with DD-1: FRs in `voting` status (not auto-approved) are shown for human approval

MANDATORY RULES:
1. Use Source/Shared/ types — do NOT redefine types inline
2. All list views must handle loading and error states
3. API client must proxy to http://localhost:3001 (configure in vite.config.ts)
4. 7 pages total: Dashboard, Feature Requests, Bug Reports, Development Cycle, Approvals, Feature Browser, Learnings
5. Write component tests with // Verifies: FR-XXX traceability comments
6. Include tests for Feature Browser (FR-029) and Learnings (FR-030) — these were missing in the previous run
7. Add // Verifies: FR-022 to a layout/navigation test

Implementation order: Read existing code → Fix alignment with DD-1 → Verify FR-022 through FR-030 → FR-032 (tests) → Ensure all traceability gaps covered

Team folder: Teams/TheATeam
Pipeline run ID: {RUN_ID}
Use --run {RUN_ID} for all pipeline-update.sh calls.
```

---

## Stage 4: Review & QA — DISPATCH INSTRUCTIONS

### Tier 1 (parallel, unconditional)

All 5 agents run in parallel after Stage 3 completes:

#### Agent: chaos-tester
```
Read the role file at Teams/TheATeam/chaos-tester.md and follow it exactly.
Task: Adversarial invariant testing for the Development Workflow Platform.
Focus areas: cycle priority queue (bugs before FRs), single active cycle constraint, ticket state machine, voting workflow (FR stays in voting until human acts per DD-1), duplicate detection edge cases, cycle status transition enforcement (DD-4), deny status guard (DD-5).
Spec: Specifications/dev-workflow-platform.md
Contracts: Plans/dev-workflow-platform/contracts.md
Team folder: Teams/TheATeam
Pipeline run ID: {RUN_ID}
```

#### Agent: security-qa
```
Read the role file at Teams/TheATeam/security-qa.md and follow it exactly.
Task: Security review of the Development Workflow Platform.
Previous run findings (verify ALL are fixed): H-01 no CORS, M-02 deny allows any status, M-03 unbounded limit, M-04 no input length validation, L-03 unvalidated enums, L-04 missing try/catch.
Reference: Plans/dev-workflow-platform/security-report.md (previous findings)
Spec: Specifications/dev-workflow-platform.md
Contracts: Plans/dev-workflow-platform/contracts.md (see DD-3 through DD-8)
Team folder: Teams/TheATeam
Pipeline run ID: {RUN_ID}
```

#### Agent: traceability-reporter (MANDATORY)
```
Read the role file at Teams/TheATeam/traceability-reporter.md and follow it exactly.
Task: Generate FR traceability report for the Development Workflow Platform.
Requirements: Plans/dev-workflow-platform/requirements.md (32 FRs)
Previous run had 81.25% coverage (6 FRs missing: FR-001, FR-021, FR-022, FR-029, FR-030, FR-031). Target: 100% or document gaps.
Team folder: Teams/TheATeam
Pipeline run ID: {RUN_ID}
```

#### Agent: visual-playwright (MANDATORY)
```
Read the role file at Teams/TheATeam/visual-playwright.md and follow it exactly.
Task: Visual validation of the Development Workflow Platform frontend.
7 pages to validate: Dashboard, Feature Requests, Bug Reports, Development Cycle, Approvals, Feature Browser, Learnings.
Spec: Specifications/dev-workflow-platform.md (UI Requirements section)
Reference doodle: .orchestrator-runs/run-1774250211495-6eb8ee6c/attachments/Overview-Doodle.png
Team folder: Teams/TheATeam
Pipeline run ID: {RUN_ID}
```

#### Agent: qa-review-and-tests
```
Read the role file at Teams/TheATeam/qa-review-and-tests.md and follow it exactly.
Task: QA review and test verification for the Development Workflow Platform.
Previous run BLOCKERs to verify are fixed:
- BLOCKER-1: Column name mismatch (human_approval_at vs human_approval_approved_at)
- BLOCKER-2: Voting auto-transitions status instead of leaving in 'voting'
- WARNING-1: Missing try/catch in route handlers
- WARNING-3: Extra status transitions not in contract
- INFO-1: No cycle status transition validation
Contracts: Plans/dev-workflow-platform/contracts.md
Previous QA report: Plans/dev-workflow-platform/qa-report.md
Previous security report: Plans/dev-workflow-platform/security-report.md
Team folder: Teams/TheATeam
Pipeline run ID: {RUN_ID}
```

### Tier 2 (sequential, after Tier 1)

#### Agent: design-critic
```
Read the role file at Teams/TheATeam/design-critic.md and follow it exactly.
Task: Multimodal visual audit of the Development Workflow Platform UI.
Reference doodle: .orchestrator-runs/run-1774250211495-6eb8ee6c/attachments/Overview-Doodle.png
Spec: Specifications/dev-workflow-platform.md
Team folder: Teams/TheATeam
Pipeline run ID: {RUN_ID}
```

#### Agent: integration-reviewer
```
Read the role file at Teams/TheATeam/integration-reviewer.md and follow it exactly.
Task: Integration smoke testing and code review for the Development Workflow Platform.
Contracts: Plans/dev-workflow-platform/contracts.md
Previous QA report: Plans/dev-workflow-platform/qa-report.md
Team folder: Teams/TheATeam
Pipeline run ID: {RUN_ID}
```

---

## Feedback Loop Rules

- Max 2 feedback iterations
- Only re-run the coder(s) whose layer is affected
- Include FULL feedback text from rejecting agent
- If >2 loops needed, stop and escalate to human

---

## Process Cleanup

After all Stage 4 agents complete, verify no orphaned processes (dev servers, test runners) remain.
