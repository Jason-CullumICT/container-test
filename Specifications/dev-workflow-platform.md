# Development Workflow Platform Specification

## Overview

A web application that manages the full software development lifecycle — from feature request intake through AI-assisted triage, human approval, development cycle management, to deployment and documentation.

## System Architecture

```
[Input Sources] → [Contributions Intake] → [AI Voting/Triage] → [Human Approval]
   (Manual,          (unified funnel)        (multiple agents      (final gate)
    Zendesk,                                  + FR Writer agent)
    Competitor,                                      ↓
    Code Review)                               [Denied FRs]
                                                                        ↓
[Bug Reports] ← [Running System] ← [CI/CD] ← [Development Cycle] ← [Approved FRs + Bugs]
      ↓                                               ↓
 [Bug List]                                      [Doc Updates]
                                                 [Learnings]
                                                 [Feature Browser]
```

### Subsystem Interaction Flows

The 7 subsystems form a closed loop. Data flows between them as follows:

1. **SS-1 → SS-2**: Potential FRs from intake are forwarded to AI Voting & Triage
2. **SS-2 → SS-3**: FRs with majority-approve votes are presented for Human Approval; majority-denied FRs are archived
3. **SS-3 → SS-5**: Human-approved FRs enter the priority backlog and feed into the Development Cycle
4. **SS-4 → SS-5**: Bug reports enter the priority backlog (with higher priority than FRs) and feed into the Development Cycle
5. **SS-5 → SS-6**: Completed cycles (passed smoke test) trigger CI/CD deployment
6. **SS-5 → SS-7**: Completed cycles produce documentation updates, learnings, and feature catalog entries
7. **SS-6 → SS-4**: Failed deployments automatically create bug reports (feedback loop)
8. **SS-6 → Running System**: Successful deployments update the running system status
9. **Running System → SS-4**: The running system can generate bug reports (runtime errors, monitoring alerts)

## Domain Entities

### Feature Request (FR)
- **id**: Unique identifier (FR-XXXX)
- **title**: Short description
- **description**: Detailed description
- **source**: One of `manual`, `zendesk`, `competitor_analysis`, `code_review`
- **status**: One of `potential`, `voting`, `approved`, `denied`, `in_development`, `completed`
- **votes**: Array of AI agent votes (approve/deny with comment)
- **human_approval**: Optional human approval record
- **priority**: `low`, `medium`, `high`, `critical`
- **created_at**: Timestamp
- **updated_at**: Timestamp

### Bug Report
- **id**: Unique identifier (BUG-XXXX)
- **title**: Short description
- **description**: Detailed description with reproduction steps
- **severity**: `low`, `medium`, `high`, `critical`
- **status**: One of `reported`, `triaged`, `in_development`, `resolved`, `closed`
- **source_system**: Which running system reported it
- **related_work_item_id**: Optional reference to parent FR or Bug (when raised during a cycle)
- **related_work_item_type**: Optional `feature_request` or `bug`
- **related_cycle_id**: Optional reference to the cycle that raised this bug
- **created_at**: Timestamp
- **updated_at**: Timestamp

### Development Cycle
- **id**: Unique identifier (CYCLE-XXXX)
- **work_item**: Reference to FR or Bug
- **status**: One of `spec_changes`, `ticket_breakdown`, `implementation`, `review`, `smoke_test`, `complete`
- **spec_changes**: Text describing spec modifications made
- **tickets**: Array of Ticket references
- **created_at**: Timestamp
- **completed_at**: Timestamp

### Ticket
- **id**: Unique identifier (TKT-XXXX)
- **cycle_id**: Parent development cycle
- **title**: Short description
- **description**: Implementation details
- **work_item_ref**: Optional explicit reference to parent FR or Bug ID
- **issue_description**: Optional structured problem analysis
- **considered_fixes**: Optional JSON array of fix options with rationale and selection
- **status**: One of `pending`, `in_progress`, `code_review`, `testing`, `security_review`, `done`
- **assignee**: Optional assignee
- **created_at**: Timestamp
- **updated_at**: Timestamp

### Vote
- **id**: Unique identifier
- **feature_request_id**: Reference to FR
- **agent_name**: Name of the AI voting agent
- **decision**: `approve` or `deny`
- **comment**: Reasoning for the vote
- **created_at**: Timestamp

### Learning
- **id**: Unique identifier
- **cycle_id**: Reference to development cycle
- **content**: What was learned
- **category**: `process`, `technical`, `domain`
- **created_at**: Timestamp

### Cycle Feedback
- **id**: Unique identifier (CFBK-XXXX)
- **cycle_id**: Reference to development cycle
- **ticket_id**: Optional reference to a specific ticket
- **agent_role**: Name of the agent providing feedback (e.g., `security-qa`, `qa-review-and-tests`)
- **team**: Team name (e.g., `TheATeam`)
- **feedback_type**: One of `rejection`, `finding`, `suggestion`, `approval`
- **content**: Detailed feedback text
- **created_at**: Timestamp

## Subsystem Specifications

### SS-1: Feature Request Intake

Feature requests arrive from multiple external sources and are collected into a unified **contributions intake funnel** before entering the pipeline.

**Sources:**
- **Manual**: Users submit FRs directly through the UI
- **Zendesk**: Integration pulls customer requests (simulated in v1)
- **Competitor Analysis**: Integration pulls competitive intelligence (simulated in v1)
- **Code Review**: Tool-built code review suggestions (simulated in v1)

All sources converge into a single contributions queue. Each contribution is tagged with its source for traceability.

**Rules:**
- All FRs enter as `potential` status regardless of source
- Duplicate detection: FRs with >80% title similarity should be flagged (using simple string similarity — Levenshtein or Jaccard; no external ML dependency)
- Each FR must have at minimum a title and description
- Source tag is required and must be one of the defined source types

### SS-2: AI Voting & Triage

Multiple AI agents independently vote on potential feature requests. The voting process includes refinement and prioritization of FRs.

**Feature Request Writer Agent:**
Before voting begins, a "Feature Request Writer" agent refines the FR by:
- Clarifying the description to explain the product context and rationale
- Adding structured detail (use cases, expected behavior, constraints)
- The refined description replaces the original (original is preserved in history)
- This step is simulated in v1 (deterministic text enrichment, not a real LLM call)

**Voting Process:**
- Each potential FR goes through a voting round
- At least 3 AI agent votes are simulated per FR
- Each vote includes a decision (approve/deny) and a comment with reasoning
- Agents evaluate from multiple angles: technical feasibility, business value, resource cost, user impact
- Majority vote determines outcome: majority approve → FR proceeds to Human Approval, majority deny → `denied`
- Voting must be testable: the simulation must support injectable randomness or a fixed seed for deterministic test outcomes
- Voting results are recorded and visible in the UI

### SS-3: Human Approval

After AI voting approves an FR, a human must give final approval before development begins.

**Rules:**
- Only `voting`-complete FRs with majority-approve can be presented for human approval
- Human can approve, deny, or send back for re-voting with comments
- Approved FRs move to the backlog ordered by priority
- Denied FRs are archived with the denial reason

### SS-4: Bug Tracking

Bug reports flow from the running system into a prioritized bug list.

**Rules:**
- **Bugs take priority** over feature requests in the development cycle
- All items in the current cycle must complete before picking up the next work item
- Bug severity determines priority ordering
- Bugs can also be created manually through the UI

### SS-5: Development Cycle

The core workflow loop. Each cycle processes one work item (bug or approved FR) through a structured pipeline.

**Phases:**
1. **Make Changes to Spec**: Document what specification changes are needed
2. **Break Out Tickets**: Decompose the work item into implementation tickets
3. **Implementation Loop** (per ticket):
   - Get next ticket
   - Make changes (implementation)
   - Code Review (automated check)
   - PR Tests Pass (test verification)
   - Security Agent (security scan)
4. **Reviewer Test Changes**: Final review of all changes
5. **Smoke Test**: End-to-end validation

**Rules:**
- Only one active development cycle at a time
- Bugs take priority — if a bug arrives during FR development, it should be queued as next
- All tickets in a cycle must complete before the cycle is marked done
- Failed reviews send the ticket back to implementation

**Pipeline Orchestration (SS-5a):**

Development cycles are orchestrated through the TheATeam agent pipeline. When a cycle is created, it is linked to a pipeline run that tracks progress through 5 stages:

1. **Requirements Review** (requirements-reviewer) → completes spec_changes phase
2. **API Contract** (api-contract) → advances to ticket_breakdown phase
3. **Implementation** (backend-coder, frontend-coder) → advances to implementation phase, then review
4. **QA** (chaos-tester, security-qa, traceability-reporter, visual-playwright, qa-review-and-tests) → advances to smoke_test
5. **Integration** (design-critic, integration-reviewer) → triggers cycle completion

Each stage completion automatically advances the linked cycle phase. The work item (FR or bug) status updates alongside the cycle. Pipeline-linked cycles cannot be manually advanced via PATCH; they progress only through stage completions.

**Pipeline Entities:**
- **PipelineRun**: Tracks the overall orchestration (id: RUN-XXXX, linked to cycle)
- **PipelineStage**: Tracks individual stages (stage_number, status, verdict, agent_ids)

**Traceability (SS-5b):**

All artifacts created during a development cycle maintain full traceability:

1. **Tickets** carry a `work_item_ref` linking them to the parent FR or bug, plus optional `issue_description` and `considered_fixes` for structured problem documentation
2. **Bugs** raised during a cycle (e.g., deployment failures) carry `related_work_item_id`, `related_work_item_type`, and `related_cycle_id` linking back to the parent work item and cycle
3. **Features** produced on cycle completion carry `cycle_id` and an optional `traceability_report` (FR coverage and test mapping generated by the traceability-reporter agent)
4. **Cycle Feedback** entries capture team findings (QA rejections, security findings, design suggestions) as first-class records linked to the cycle and optionally to specific tickets
5. **Dev cycle detail** includes the team name and all feedback entries for full visibility

**Selection Priority (unchanged):**
1. Triaged bugs, ordered by severity (critical > high > medium > low), then oldest
2. Approved feature requests, ordered by priority, then oldest

### SS-6: CI/CD Integration

Completed development cycles trigger deployment.

**Rules:**
- Successful smoke tests trigger a "deployment" (simulated in v1)
- Deployment updates the running system status
- Failed deployments create a bug report automatically

### SS-7: Documentation & Learnings

Each completed cycle produces documentation updates and captures learnings.

**Outputs:**
- **Doc Updates**: Summary of what changed and why
- **Learnings**: Process, technical, or domain insights captured during the cycle
- **Feature Browser**: Searchable catalog of implemented features

## UI Requirements

### Pages

1. **Dashboard** — Overview of pipeline status: FRs in each stage, active bugs, current development cycle
2. **Feature Requests** — List/filter/search FRs; submit new manual FRs; view voting results
3. **Bug Reports** — List/filter/search bugs; submit new bugs; view severity breakdown
4. **Development Cycle** — View active cycle with phase progress; ticket board within implementation loop
5. **Approvals** — Human approval queue for voted FRs
6. **Feature Browser** — Searchable catalog of completed features
7. **Learnings** — Browse captured learnings by category and cycle

### Navigation
- Sidebar navigation with page links
- Dashboard is the default landing page
- Badge counts on nav items (e.g., pending approvals count)

## API Endpoints

### Feature Requests
- `GET /api/feature-requests` — List all FRs (filterable by status, source)
- `POST /api/feature-requests` — Create a new FR
- `GET /api/feature-requests/:id` — Get FR details including votes
- `PATCH /api/feature-requests/:id` — Update FR (status, description)
- `DELETE /api/feature-requests/:id` — Delete FR
- `POST /api/feature-requests/:id/vote` — Trigger AI voting on an FR
- `POST /api/feature-requests/:id/approve` — Human approve an FR
- `POST /api/feature-requests/:id/deny` — Human deny an FR

### Bug Reports
- `GET /api/bugs` — List all bugs (filterable by status, severity)
- `POST /api/bugs` — Create a new bug
- `GET /api/bugs/:id` — Get bug details
- `PATCH /api/bugs/:id` — Update bug
- `DELETE /api/bugs/:id` — Delete bug

### Development Cycles
- `GET /api/cycles` — List all cycles
- `POST /api/cycles` — Start a new cycle (picks next priority item)
- `GET /api/cycles/:id` — Get cycle details with tickets
- `PATCH /api/cycles/:id` — Update cycle phase
- `POST /api/cycles/:id/tickets` — Add ticket to cycle
- `PATCH /api/cycles/:id/tickets/:ticketId` — Update ticket status
- `POST /api/cycles/:id/complete` — Complete the cycle (triggers CI/CD + docs)

### Cycle Feedback
- `GET /api/cycles/:id/feedback` — List feedback for a cycle (filterable by agent_role, feedback_type)
- `POST /api/cycles/:id/feedback` — Add feedback to a cycle

### Dashboard
- `GET /api/dashboard/summary` — Pipeline status counts
- `GET /api/dashboard/activity` — Recent activity feed

### Learnings
- `GET /api/learnings` — List learnings (filterable by category, cycle)
- `POST /api/learnings` — Create a learning

### Features (Browser)
- `GET /api/features` — List completed features (searchable)

### Pipeline Runs
- `GET /api/pipeline-runs` — List pipeline runs (filterable by status)
- `GET /api/pipeline-runs/:id` — Get pipeline run with stages
- `POST /api/pipeline-runs/:id/stages/:stageNumber/start` — Start a pipeline stage
- `POST /api/pipeline-runs/:id/stages/:stageNumber/complete` — Complete a stage (auto-advances cycle)
- `GET /api/cycles/:id/pipeline` — Get pipeline run for a cycle

## Tech Stack

- **Backend**: Node.js with Express, TypeScript
- **Frontend**: React with TypeScript, Vite, Tailwind CSS
- **Database**: SQLite with better-sqlite3 (simple, no external deps)
- **Testing**: Vitest for both backend and frontend
- **Shared Types**: TypeScript interfaces in Source/Shared/

## Non-Functional Requirements

- Structured JSON logging (not console.log)
- Prometheus metrics at GET /metrics
- OpenTelemetry tracing for critical paths
- All list endpoints return `{data: T[]}` wrappers
- No hardcoded secrets — use .env
- Service layer between routes and database

## Conceptual Entities (Not Persisted)

### Running System
The running system represents the deployed state of the application after a CI/CD deployment. It is not a database entity but a conceptual node in the architecture:
- Receives deployment updates from SS-6 (CI/CD Integration)
- Can generate bug reports back to SS-4 (Bug Tracking) via runtime errors or monitoring alerts
- In v1, the running system is simulated — deployment success/failure is a flag on cycle completion

## Functional Requirements

Each requirement is identified by `FR-XXX` and is the canonical reference for `// Verifies: FR-XXX` traceability comments in source code and tests.

### Infrastructure & Shared (FR-001 — FR-004)

| ID | Description | Layer | Acceptance Criteria |
|----|-------------|-------|---------------------|
| FR-001 | Define all shared TypeScript types for domain entities and API request/response wrappers in `Source/Shared/` | [fullstack] | Both backend and frontend import from Shared/; no inline type re-definitions exist in either layer |
| FR-002 | Initialize Express + TypeScript backend with SQLite; define and run schema migrations for all entity tables | [backend] | Server starts; all tables exist; migration is idempotent |
| FR-003 | Create logger abstraction with structured JSON in production, pretty-printing in development; no `console.log` elsewhere | [backend] | All log output is structured JSON in NODE_ENV=production; logger is the only log sink |
| FR-004 | Create middleware pipeline: request logging, Prometheus metrics collector, centralised error handler returning `{error: "message"}` | [backend] | `GET /metrics` returns Prometheus text format with route latency histogram; error handler returns consistent shape |

### Feature Request APIs (FR-005 — FR-012)

| ID | Description | Layer | Acceptance Criteria |
|----|-------------|-------|---------------------|
| FR-005 | `GET /api/feature-requests` — list all FRs, filterable by status and source; response is `{data: FeatureRequest[]}` | [backend] | Query params filter correctly; response matches DataResponse wrapper |
| FR-006 | `POST /api/feature-requests` — create FR; validates title/description; enters as `potential`; duplicate detection flags >80% title similarity | [backend] | Missing fields return 400; created FR has status `potential`; near-duplicate includes `duplicate_warning` flag |
| FR-007 | `GET /api/feature-requests/:id` — return FR with associated votes array | [backend] | Response includes votes; 404 on unknown id |
| FR-008 | `PATCH /api/feature-requests/:id` — update FR status/description; enforce valid status transitions | [backend] | Invalid transition returns 400; valid update returns updated FR |
| FR-009 | `DELETE /api/feature-requests/:id` — delete FR; returns 204 No Content | [backend] | 204 on success; 404 on unknown id |
| FR-010 | `POST /api/feature-requests/:id/vote` — simulate AI voting: generate ≥3 agent votes, record them, compute majority, transition status | [backend] | Votes are persisted; majority logic is correct; status transitions correctly; testable via injectable randomness |
| FR-011 | `POST /api/feature-requests/:id/approve` — human approves FR; must be in majority-approved voting state | [backend] | FR not in approvable state returns 409; on success status = `approved` |
| FR-012 | `POST /api/feature-requests/:id/deny` — human denies FR with comment; archived with denial reason | [backend] | Denial reason stored; status = `denied` |

### Bug Report APIs (FR-013)

| ID | Description | Layer | Acceptance Criteria |
|----|-------------|-------|---------------------|
| FR-013 | Full CRUD for bug reports: list (filterable by status/severity), create, get, update, delete; list returns `{data: BugReport[]}` | [backend] | All five endpoints work correctly; filtering works; delete returns 204 |

### Development Cycle APIs (FR-014 — FR-016)

| ID | Description | Layer | Acceptance Criteria |
|----|-------------|-------|---------------------|
| FR-014 | Cycle management: list, create (picks next priority item — bugs before FRs), get details, update phase; only one active cycle at a time | [backend] | Second create while one active returns 409; bug selected over FR; cycle detail includes tickets |
| FR-015 | Ticket management within cycles: add tickets, update ticket status through state machine (pending → in_progress → code_review → testing → security_review → done) | [backend] | Invalid state transitions return 400; ticket associated with correct cycle |
| FR-016 | Complete cycle: validate all tickets done, simulate CI/CD deployment, auto-create Learning and Feature records, auto-create BugReport on simulated deployment failure | [backend] | Incomplete tickets returns 409; on success cycle = `complete`, feature and learning records exist; failure creates bug |

### Dashboard APIs (FR-017 — FR-018)

| ID | Description | Layer | Acceptance Criteria |
|----|-------------|-------|---------------------|
| FR-017 | `GET /api/dashboard/summary` — counts of FRs by status, bugs by status/severity, active cycle status | [backend] | Response includes all count breakdowns |
| FR-018 | `GET /api/dashboard/activity` — recent activity feed across FRs, bugs, cycles | [backend] | Returns ordered activity items with type, entity id, description, timestamp |

### Learnings & Features APIs (FR-019 — FR-020)

| ID | Description | Layer | Acceptance Criteria |
|----|-------------|-------|---------------------|
| FR-019 | Learnings: list (filterable by category/cycle_id) and create; returns `{data: Learning[]}` | [backend] | Filtering works; created learning has valid category |
| FR-020 | Features: searchable list of completed features; search by title/description; returns `{data: Feature[]}` | [backend] | `?q=keyword` filters correctly; empty query returns all |

### Observability (FR-021)

| ID | Description | Layer | Acceptance Criteria |
|----|-------------|-------|---------------------|
| FR-021 | OpenTelemetry tracing: instrument HTTP routes and database calls; propagate W3C `traceparent` header | [backend] | Trace/span IDs appear in logs; traceparent header forwarded |

### Frontend Application (FR-022 — FR-030)

| ID | Description | Layer | Acceptance Criteria |
|----|-------------|-------|---------------------|
| FR-022 | React + Vite + TypeScript + Tailwind frontend; layout shell with Sidebar navigation and Header; sidebar badge counts | [frontend] | App renders; sidebar links to all 7 pages; badge counts update from API |
| FR-023 | API client module with typed functions for all backend endpoints; uniform error handling | [frontend] | Each endpoint has a typed client function; non-2xx throws typed error |
| FR-024 | Dashboard page — summary widgets (FR counts, bug count, active cycle phase) and activity feed | [frontend] | Widgets display data from summary/activity APIs; loading and error states |
| FR-025 | Feature Requests page — list with filters, create form, detail view with votes, trigger voting button | [frontend] | Form validates; voting button calls API; vote results displayed |
| FR-026 | Bug Reports page — list with filters, create form, detail view with severity badge | [frontend] | Form validates; severity badge in list; detail shows all fields |
| FR-027 | Development Cycle page — phase stepper, ticket board, start new cycle button | [frontend] | Stepper reflects current phase; tickets grouped by status; advancing calls API |
| FR-028 | Approvals page — list of FRs awaiting human approval; approve/deny with comment | [frontend] | Only approvable FRs shown; actions call correct API; list updates after action |
| FR-029 | Feature Browser page — searchable grid/list of completed features | [frontend] | Search debounces; results update; empty state shown |
| FR-030 | Learnings page — list filterable by category and cycle; category badge and cycle reference | [frontend] | Category and cycle filters work; each learning shows category, content, cycle |

### Pipeline Orchestration (FR-033 — FR-049)

| ID | Description | Layer | Acceptance Criteria |
|----|-------------|-------|---------------------|
| FR-033 | Add PipelineRun and PipelineStage shared types; extend DevelopmentCycle and DashboardSummary types | [fullstack] | Types compile; both layers import from Shared/ |
| FR-034 | Add API request/response types for pipeline endpoints | [fullstack] | Request/response types cover all new endpoints |
| FR-035 | Add pipeline_runs and pipeline_stages tables; add pipeline_run_id column to cycles | [backend] | Tables created idempotently; foreign keys valid; existing cycles unaffected |
| FR-036 | Pipeline service: createPipelineRun, list, get, startStage, completeStage | [backend] | Pipeline runs created with 5 stages; stage completion enforces linear ordering |
| FR-037 | Modify cycle creation to also create and link a PipelineRun; auto-start stage 1 | [backend] | New cycle has linked pipeline run; stage 1 is running |
| FR-038 | Stage completion auto-advances linked cycle phase; stage 5 triggers completeCycle | [backend] | Each stage advances correct phase; stage 5 triggers Learning/Feature/CI-CD |
| FR-039 | Block manual PATCH status on pipeline-linked cycles; return 409 | [backend] | PATCH with status on pipeline-linked cycle returns 409; spec_changes still allowed |
| FR-040 | Pipeline routes: list, get, start stage, complete stage, get by cycle | [backend] | All endpoints return correct data; ordering enforced; 404 on unknown IDs |
| FR-041 | Hydrate pipeline_run in cycle GET response when present | [backend] | Cycle response includes pipeline data when linked; backwards compatible |
| FR-042 | Dashboard summary includes pipeline stage/status for active cycle | [backend] | Dashboard shows pipeline progress for active cycle |
| FR-043 | Observability: structured logging, Prometheus counter, OTel spans for pipeline ops | [backend] | Log entries for stage transitions; counter incremented; spans on service calls |
| FR-044 | Frontend API client functions for pipeline endpoints | [frontend] | Typed functions for all pipeline endpoints; consistent error handling |
| FR-045 | PipelineStepper component: 5-stage progress with status, agents, verdicts | [frontend] | All stages shown; active highlighted; completed show verdict; pending grayed |
| FR-046 | Integrate PipelineStepper into CycleView for pipeline-linked cycles | [frontend] | Stepper visible on pipeline cycles; hidden on legacy; team label shown |
| FR-047 | Dashboard widget shows pipeline stage name and progress | [frontend] | Widget shows pipeline stage alongside cycle phase |
| FR-048 | Backend tests for pipeline service and routes with traceability | [backend] | All functions tested; traceability passes; zero regressions |
| FR-049 | Frontend tests for PipelineStepper and updated CycleView | [frontend] | Components render stages; transitions update display; mocked API |

### Dev Cycle Traceability (FR-050 — FR-069)

| ID | Description | Layer | Acceptance Criteria |
|----|-------------|-------|---------------------|
| FR-050 | Add CycleFeedback, ConsideredFix types; extend BugReport with related_work_item_id/type/cycle_id; extend Ticket with work_item_ref, issue_description, considered_fixes; extend Feature with cycle_id, traceability_report; extend DevelopmentCycle with feedback[], team_name | [fullstack] | Types compile; both layers import from Shared/ |
| FR-051 | Add CreateCycleFeedbackInput, CycleFeedbackListResponse API types; modify CreateBugInput, CreateTicketInput, CompleteStageInput, CreateFeatureInput with new optional fields | [fullstack] | Request/response types cover all new/modified endpoints |
| FR-052 | Schema: cycle_feedback table; ALTER bugs (3 cols), tickets (3 cols), features (2 cols) — all nullable, idempotent | [backend] | Tables created; columns added; existing data unaffected |
| FR-053 | Feedback service: createFeedback, listFeedback, getFeedbackById | [backend] | Feedback created with correct cycle/ticket linkage; filters work |
| FR-054 | Modify bugService to accept/persist/return related_work_item_id, related_work_item_type, related_cycle_id | [backend] | New fields stored and returned; existing bug creation still works |
| FR-055 | Modify createTicket to accept/persist work_item_ref, issue_description, considered_fixes (JSON) | [backend] | New fields stored; considered_fixes round-trips as JSON; existing creation works |
| FR-056 | Modify completeCycle: pass cycle_id to Feature; populate related fields on deployment-failure bugs | [backend] | Feature has cycle_id; deployment-failure bug has all related fields |
| FR-057 | Modify featureService to accept/persist cycle_id, traceability_report | [backend] | New fields stored and returned; existing feature creation works |
| FR-058 | Hydrate feedback[] and team_name in getCycleById | [backend] | Cycle detail includes feedback and team_name; backwards compatible |
| FR-059 | Feedback routes: GET/POST /api/cycles/:id/feedback | [backend] | List returns {data: CycleFeedback[]}; create validates; 404 on unknown cycle |
| FR-060 | Modify completeStageAction to accept optional feedback array; create cycle_feedback records | [backend] | Feedback created on stage completion; backwards compat without feedback |
| FR-061 | Observability: logging + Prometheus counter for feedback entries by type | [backend] | Log entries for feedback; cycle_feedback_total counter |
| FR-062 | Backend tests for feedback service, modified services, cycle completion traceability | [backend] | All tested; traceability enforcer passes; zero regressions |
| FR-063 | Frontend API client for feedback endpoints; updated types for modified responses | [frontend] | Typed functions; updated types for bugs, tickets, features, cycles |
| FR-064 | FeedbackLog component with agent role badges, feedback type tags, ticket links | [frontend] | Entries rendered with badges; filters work; empty state shown |
| FR-065 | Integrate FeedbackLog into CycleView; show team_name badge | [frontend] | Feedback log visible; team name displayed; hidden when empty |
| FR-066 | ConsideredFixesList component for ticket detail | [frontend] | Fixes listed; selected fix highlighted; handles null gracefully |
| FR-067 | TraceabilityReport component for Feature detail | [frontend] | Report rendered as table; handles null; expandable |
| FR-068 | Update BugDetail with related work item and cycle links | [frontend] | Links rendered when present; hidden when null; navigable |
| FR-069 | Frontend tests for FeedbackLog, ConsideredFixesList, TraceabilityReport, BugDetail | [frontend] | Components render; interactions work; mocked API |

### Testing (FR-031 — FR-032)

| ID | Description | Layer | Acceptance Criteria |
|----|-------------|-------|---------------------|
| FR-031 | Backend Vitest tests for all service functions and route handlers; each test carries `// Verifies: FR-XXX` | [backend] | All services and routes covered; traceability enforcer passes; zero regressions |
| FR-032 | Frontend Vitest/RTL tests for key components; each test carries `// Verifies: FR-XXX` | [frontend] | Components render; API calls mocked; interactions trigger correct calls |
