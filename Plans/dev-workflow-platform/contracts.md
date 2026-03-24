# API Contracts: Development Workflow Platform

**Date:** 2026-03-23
**Source Spec:** Specifications/dev-workflow-platform.md
**Requirements:** Plans/dev-workflow-platform/requirements.md

---

## Shared Types (Source/Shared/types.ts)

```typescript
// --- Enums / Union Types ---

export type FeatureRequestStatus = 'potential' | 'voting' | 'approved' | 'denied' | 'in_development' | 'completed';
export type FeatureRequestSource = 'manual' | 'zendesk' | 'competitor_analysis' | 'code_review';
export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type BugStatus = 'reported' | 'triaged' | 'in_development' | 'resolved' | 'closed';
export type BugSeverity = 'low' | 'medium' | 'high' | 'critical';
export type CycleStatus = 'spec_changes' | 'ticket_breakdown' | 'implementation' | 'review' | 'smoke_test' | 'complete';
export type TicketStatus = 'pending' | 'in_progress' | 'code_review' | 'testing' | 'security_review' | 'done';
export type VoteDecision = 'approve' | 'deny';
export type LearningCategory = 'process' | 'technical' | 'domain';
export type WorkItemType = 'feature_request' | 'bug';

// --- Domain Entities ---

export interface FeatureRequest {
  id: string;                          // FR-XXXX
  title: string;
  description: string;
  source: FeatureRequestSource;
  status: FeatureRequestStatus;
  priority: Priority;
  votes: Vote[];
  human_approval_comment: string | null;
  human_approval_approved_at: string | null;  // ISO timestamp or null
  duplicate_warning: boolean;
  created_at: string;                  // ISO timestamp
  updated_at: string;                  // ISO timestamp
}

export interface Vote {
  id: string;
  feature_request_id: string;
  agent_name: string;
  decision: VoteDecision;
  comment: string;
  created_at: string;
}

export interface BugReport {
  id: string;                          // BUG-XXXX
  title: string;
  description: string;
  severity: BugSeverity;
  status: BugStatus;
  source_system: string;
  created_at: string;
  updated_at: string;
}

export interface DevelopmentCycle {
  id: string;                          // CYCLE-XXXX
  work_item_id: string;               // FR-XXXX or BUG-XXXX
  work_item_type: WorkItemType;
  status: CycleStatus;
  spec_changes: string | null;
  tickets: Ticket[];
  created_at: string;
  completed_at: string | null;
}

export interface Ticket {
  id: string;                          // TKT-XXXX
  cycle_id: string;
  title: string;
  description: string;
  status: TicketStatus;
  assignee: string | null;
  created_at: string;
  updated_at: string;
}

export interface Learning {
  id: string;
  cycle_id: string;
  content: string;
  category: LearningCategory;
  created_at: string;
}

export interface Feature {
  id: string;
  title: string;
  description: string;
  source_work_item_id: string;
  created_at: string;
}

// --- Dashboard Types ---

export interface DashboardSummary {
  feature_requests: Record<FeatureRequestStatus, number>;
  bugs: {
    by_status: Record<BugStatus, number>;
    by_severity: Record<BugSeverity, number>;
  };
  active_cycle: {
    id: string;
    status: CycleStatus;
    work_item_id: string;
    work_item_type: WorkItemType;
  } | null;
}

export interface ActivityItem {
  type: 'feature_request' | 'bug' | 'cycle' | 'ticket' | 'learning' | 'feature';
  entity_id: string;
  description: string;
  timestamp: string;
}
```

## API Response Wrappers (Source/Shared/api.ts)

```typescript
import type {
  FeatureRequest, Vote, BugReport, DevelopmentCycle, Ticket,
  Learning, Feature, DashboardSummary, ActivityItem
} from './types';

// --- Generic Wrappers ---
export interface DataResponse<T> {
  data: T[];
}

export interface ApiErrorResponse {
  error: string;
}

// --- Feature Requests ---
export type FeatureRequestListResponse = DataResponse<FeatureRequest>;
export type FeatureRequestResponse = FeatureRequest;

export interface CreateFeatureRequestInput {
  title: string;
  description: string;
  source?: string;        // defaults to 'manual'
  priority?: string;      // defaults to 'medium'
}

export interface UpdateFeatureRequestInput {
  status?: string;
  description?: string;
  priority?: string;
}

export interface DenyFeatureRequestInput {
  comment: string;
}

// --- Bug Reports ---
export type BugListResponse = DataResponse<BugReport>;
export type BugResponse = BugReport;

export interface CreateBugInput {
  title: string;
  description: string;
  severity: string;
  source_system?: string;
}

export interface UpdateBugInput {
  title?: string;
  description?: string;
  severity?: string;
  status?: string;
  source_system?: string;
}

// --- Development Cycles ---
export type CycleListResponse = DataResponse<DevelopmentCycle>;
export type CycleResponse = DevelopmentCycle;

export interface UpdateCycleInput {
  status?: string;
  spec_changes?: string;
}

export interface CreateTicketInput {
  title: string;
  description: string;
  assignee?: string;
}

export interface UpdateTicketInput {
  status?: string;
  title?: string;
  description?: string;
  assignee?: string;
}

// --- Dashboard ---
export type DashboardSummaryResponse = DashboardSummary;
export type DashboardActivityResponse = DataResponse<ActivityItem>;

// --- Learnings ---
export type LearningListResponse = DataResponse<Learning>;

export interface CreateLearningInput {
  cycle_id: string;
  content: string;
  category: string;   // 'process' | 'technical' | 'domain'
}

// --- Features ---
export type FeatureListResponse = DataResponse<Feature>;
```

---

## Endpoint Contracts

### Feature Requests — `/api/feature-requests`

| Method | Path | Request Body | Success Response | Error Responses | Notes |
|--------|------|-------------|-----------------|-----------------|-------|
| GET | `/api/feature-requests` | — | `200 {data: FeatureRequest[]}` | — | Query params: `?status=`, `?source=` |
| POST | `/api/feature-requests` | `CreateFeatureRequestInput` | `201 FeatureRequest` | `400 {error}` if missing title/desc | `duplicate_warning: true` if >80% title similarity with existing FR |
| GET | `/api/feature-requests/:id` | — | `200 FeatureRequest` (with votes) | `404 {error}` | — |
| PATCH | `/api/feature-requests/:id` | `UpdateFeatureRequestInput` | `200 FeatureRequest` | `400 {error}` invalid transition, `404` | Valid transitions: potential→voting, voting→approved/denied, approved→in_development, in_development→completed |
| DELETE | `/api/feature-requests/:id` | — | `204` (no body) | `404 {error}` | — |
| POST | `/api/feature-requests/:id/vote` | — | `200 FeatureRequest` (with votes) | `400 {error}`, `404` | Generates ≥3 AI votes. **IMPORTANT: must leave FR in `voting` status** — majority result is advisory only. Human must call `/approve` or `/deny` to finalize. |
| POST | `/api/feature-requests/:id/approve` | — | `200 FeatureRequest` | `404`, `409 {error}` if not in `voting` status | Only FRs in `voting` status with majority-approve can be approved |
| POST | `/api/feature-requests/:id/deny` | `DenyFeatureRequestInput` | `200 FeatureRequest` | `404`, `409 {error}` if not in deniable status | Deniable statuses: `potential`, `voting`. NOT `approved`, `in_development`, `completed` |

### Bug Reports — `/api/bugs`

| Method | Path | Request Body | Success Response | Error Responses |
|--------|------|-------------|-----------------|-----------------|
| GET | `/api/bugs` | — | `200 {data: BugReport[]}` | — | Query: `?status=`, `?severity=` |
| POST | `/api/bugs` | `CreateBugInput` | `201 BugReport` | `400 {error}` |
| GET | `/api/bugs/:id` | — | `200 BugReport` | `404 {error}` |
| PATCH | `/api/bugs/:id` | `UpdateBugInput` | `200 BugReport` | `400`, `404` |
| DELETE | `/api/bugs/:id` | — | `204` | `404` |

### Development Cycles — `/api/cycles`

| Method | Path | Request Body | Success Response | Error Responses | Notes |
|--------|------|-------------|-----------------|-----------------|-------|
| GET | `/api/cycles` | — | `200 {data: DevelopmentCycle[]}` | — | |
| POST | `/api/cycles` | — | `201 DevelopmentCycle` | `409 {error}` if active cycle exists, `404` if no work items | Auto-picks highest-priority item: bugs before FRs, then by severity/priority |
| GET | `/api/cycles/:id` | — | `200 DevelopmentCycle` (with tickets) | `404` | |
| PATCH | `/api/cycles/:id` | `UpdateCycleInput` | `200 DevelopmentCycle` | `400 {error}` invalid transition, `404` | **Enforce linear transitions**: spec_changes→ticket_breakdown→implementation→review→smoke_test→complete |
| POST | `/api/cycles/:id/tickets` | `CreateTicketInput` | `201 Ticket` | `404` | |
| PATCH | `/api/cycles/:id/tickets/:ticketId` | `UpdateTicketInput` | `200 Ticket` | `400 {error}` invalid transition, `404` | State machine: pending→in_progress→code_review→testing→security_review→done |
| POST | `/api/cycles/:id/complete` | — | `200 DevelopmentCycle` | `409 {error}` if tickets not all done | Creates Learning + Feature records. Simulated deploy failure (10% chance) auto-creates BugReport |

### Dashboard — `/api/dashboard`

| Method | Path | Success Response | Notes |
|--------|------|-----------------|-------|
| GET | `/api/dashboard/summary` | `200 DashboardSummary` | Aggregated counts |
| GET | `/api/dashboard/activity` | `200 {data: ActivityItem[]}` | Query: `?limit=N` (default 20, max 200) |

### Learnings — `/api/learnings`

| Method | Path | Request Body | Success Response | Error Responses |
|--------|------|-------------|-----------------|-----------------|
| GET | `/api/learnings` | — | `200 {data: Learning[]}` | — | Query: `?category=`, `?cycle_id=` |
| POST | `/api/learnings` | `CreateLearningInput` | `201 Learning` | `400 {error}` |

### Features — `/api/features`

| Method | Path | Success Response | Notes |
|--------|------|-----------------|-------|
| GET | `/api/features` | `200 {data: Feature[]}` | Query: `?q=keyword` searches title+description |

---

## Critical Design Decisions (from previous QA run)

These decisions MUST be followed by all implementation agents:

### DD-1: Voting leaves FR in `voting` status (BLOCKER-2 fix)
`POST /api/feature-requests/:id/vote` generates votes and computes majority but does NOT auto-transition to `approved`/`denied`. The FR stays in `voting` status. The majority result is stored as advisory metadata. A human must call `POST /approve` or `POST /deny` to finalize.

### DD-2: Column name is `human_approval_approved_at` (BLOCKER-1 fix)
The schema column is `human_approval_approved_at`. All service code must use this exact column name. Do NOT use `human_approval_at`.

### DD-3: All route handlers must use try/catch + next(err)
Every route handler in every route file must be wrapped in `try { ... } catch (err) { next(err); }` to route errors through the centralized error handler. No exceptions.

### DD-4: Cycle status transitions must be enforced
`PATCH /api/cycles/:id` must validate linear phase progression: spec_changes → ticket_breakdown → implementation → review → smoke_test. No skipping phases. Transition to `complete` is blocked via PATCH (see DD-9) — must use `POST /api/cycles/:id/complete`.

### DD-5: Deny action requires status guard
`POST /api/feature-requests/:id/deny` must check that FR is in `potential` or `voting` status. Denying an `approved`, `in_development`, or `completed` FR is forbidden (return 409).

### DD-6: Dashboard activity limit must be capped
`GET /api/dashboard/activity?limit=N` must enforce max limit of 200.

### DD-7: CORS must be configured
Backend must include `cors` middleware restricted to the frontend origin.

### DD-8: Input validation must include enum guards
`source` and `priority` fields on feature requests must be validated against allowed enum values. Same for `severity` on bugs, `category` on learnings.

### DD-9: Block `complete` status via PATCH (NEW-BLOCKER-1 fix)
`PATCH /api/cycles/:id` must reject `status=complete` with a 400 error: "Use POST /api/cycles/:id/complete to complete a cycle." The `POST /api/cycles/:id/complete` endpoint has side-effects (create Learning, Feature, simulate deployment) that PATCH bypasses.

### DD-10: MAX-based ID generation (NEW-BUG-1 fix)
All services must use MAX-based ID generation instead of COUNT-based. After a delete, COUNT decreases and the next insert reuses an existing ID, causing a PRIMARY KEY collision. Use `SELECT id FROM {table} ORDER BY id DESC LIMIT 1` and parse the numeric suffix.

### DD-11: Input length validation for all entities (M-04 complete fix)
All entities with user-provided text fields must validate input length:
- Feature requests: title max 200, description max 10000 (already done)
- Bug reports: title max 200, description max 10000
- Learnings: content max 10000
- Tickets: title max 200, description max 10000
