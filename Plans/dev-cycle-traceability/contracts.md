# API Contracts: Dev Cycle Full Traceability

**Date:** 2026-03-24
**Base:** Plans/dev-workflow-platform/contracts.md, Plans/orchestrated-dev-cycles/contracts.md

---

## New Shared Types (Source/Shared/types.ts)

```typescript
// --- Cycle Feedback Types (FR-050) ---

export type CycleFeedbackType = 'rejection' | 'finding' | 'suggestion' | 'approval';

export interface CycleFeedback {
  id: string;                          // CFBK-XXXX
  cycle_id: string;                    // FK → cycles.id
  ticket_id: string | null;            // FK → tickets.id (optional)
  agent_role: string;                  // e.g., 'security-qa', 'qa-review-and-tests'
  team: string;                        // e.g., 'TheATeam'
  feedback_type: CycleFeedbackType;
  content: string;                     // detailed feedback text
  created_at: string;
}

// --- Considered Fix (FR-050) ---

export interface ConsideredFix {
  description: string;
  rationale: string;
  selected: boolean;                   // which fix was chosen
}
```

### Modified: BugReport (FR-050)

```typescript
export interface BugReport {
  // ... existing fields ...
  related_work_item_id: string | null;       // NEW (DD-18)
  related_work_item_type: WorkItemType | null; // NEW
  related_cycle_id: string | null;            // NEW
}
```

### Modified: Ticket (FR-050)

```typescript
export interface Ticket {
  // ... existing fields ...
  work_item_ref: string | null;              // NEW (DD-24) — explicit parent FR/bug ID
  issue_description: string | null;          // NEW — structured problem analysis
  considered_fixes: ConsideredFix[] | null;  // NEW (DD-19) — parsed from JSON
}
```

### Modified: Feature (FR-050)

```typescript
export interface Feature {
  // ... existing fields ...
  cycle_id: string | null;                   // NEW (DD-22)
  traceability_report: string | null;        // NEW (DD-21) — JSON traceability report
}
```

### Modified: DevelopmentCycle (FR-050)

```typescript
export interface DevelopmentCycle {
  // ... existing fields ...
  feedback: CycleFeedback[];                 // NEW — hydrated on GET
  team_name: string | null;                  // NEW — from pipeline_run.team
}
```

---

## New API Types (Source/Shared/api.ts)

```typescript
// --- Cycle Feedback (FR-051) ---
export type CycleFeedbackListResponse = DataResponse<CycleFeedback>;
export type CycleFeedbackResponse = CycleFeedback;

export interface CreateCycleFeedbackInput {
  ticket_id?: string;                        // optional — may be cycle-level
  agent_role: string;
  team?: string;                             // defaults to 'TheATeam'
  feedback_type: 'rejection' | 'finding' | 'suggestion' | 'approval';
  content: string;
}

// --- Modified: CreateBugInput (FR-051) ---
export interface CreateBugInput {
  title: string;
  description: string;
  severity: string;
  source_system?: string;
  related_work_item_id?: string;             // NEW
  related_work_item_type?: string;           // NEW — 'feature_request' | 'bug'
  related_cycle_id?: string;                 // NEW
}

// --- Modified: CreateTicketInput (FR-051) ---
export interface CreateTicketInput {
  title: string;
  description: string;
  assignee?: string;
  work_item_ref?: string;                    // NEW
  issue_description?: string;                // NEW
  considered_fixes?: ConsideredFix[];        // NEW — JSON array
}

// --- Modified: CompleteStageInput (FR-051) ---
export interface CompleteStageInput {
  verdict: 'approved' | 'rejected';
  feedback?: Array<{                         // NEW (DD-23)
    ticket_id?: string;
    agent_role: string;
    feedback_type: 'rejection' | 'finding' | 'suggestion' | 'approval';
    content: string;
  }>;
}

// --- Modified: CreateFeatureInput (FR-051) ---
export interface CreateFeatureInput {
  title: string;
  description: string;
  source_work_item_id: string;
  cycle_id?: string;                         // NEW (DD-22)
  traceability_report?: string;              // NEW (DD-21)
}
```

---

## New API Endpoints

### GET /api/cycles/:id/feedback

**Query params:** `?agent_role=security-qa` (optional), `?feedback_type=finding` (optional)

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "CFBK-0001",
      "cycle_id": "CYCLE-0001",
      "ticket_id": "TKT-0001",
      "agent_role": "security-qa",
      "team": "TheATeam",
      "feedback_type": "finding",
      "content": "SQL injection risk in parameter handling for /api/bugs endpoint",
      "created_at": "2026-03-24T10:00:00.000Z"
    }
  ]
}
```

**Errors:** `404` — Cycle not found

### POST /api/cycles/:id/feedback

**Request body:**
```json
{
  "ticket_id": "TKT-0001",
  "agent_role": "security-qa",
  "feedback_type": "finding",
  "content": "SQL injection risk in parameter handling..."
}
```

**Response:** `201 Created` — CycleFeedback

**Errors:**
- `400` — Missing required fields (agent_role, feedback_type, content)
- `404` — Cycle not found
- `404` — ticket_id provided but ticket not found in this cycle

---

## Modified Endpoints

### POST /api/bugs (Modified — FR-054)

**Existing behavior preserved.** Additionally accepts:
- `related_work_item_id: string` (optional)
- `related_work_item_type: string` (optional — `'feature_request'` | `'bug'`)
- `related_cycle_id: string` (optional)

**Response:** `201 Created` — BugReport with new fields (null if not provided)

### GET /api/bugs/:id (Modified — FR-054)

**Response:** Now includes `related_work_item_id`, `related_work_item_type`, `related_cycle_id` (all nullable).

### POST /api/cycles/:id/tickets (Modified — FR-055)

**Existing behavior preserved.** Additionally accepts:
- `work_item_ref: string` (optional)
- `issue_description: string` (optional)
- `considered_fixes: ConsideredFix[]` (optional — JSON array)

**Response:** Ticket with new fields.

### GET /api/cycles/:id (Modified — FR-058)

**Existing behavior preserved.** Additionally includes:
- `feedback: CycleFeedback[]` — all feedback entries for this cycle
- `team_name: string | null` — from linked pipeline_run.team (null if no pipeline)

### POST /api/cycles/:id/complete (Modified — FR-056)

**Existing behavior preserved.** Internal changes:
- Feature record created with `cycle_id` set to the completing cycle
- Deployment-failure bug created with `related_work_item_id`, `related_work_item_type`, `related_cycle_id` populated

### GET /api/features (Modified — FR-057)

**Response:** Now includes `cycle_id` and `traceability_report` (both nullable).

### POST /api/pipeline-runs/:id/stages/:stageNumber/complete (Modified — FR-060)

**Existing behavior preserved.** Additionally accepts optional `feedback` array:
```json
{
  "verdict": "approved",
  "feedback": [
    {
      "ticket_id": "TKT-0001",
      "agent_role": "security-qa",
      "feedback_type": "finding",
      "content": "Found potential XSS in..."
    }
  ]
}
```

Each feedback entry is stored as a `cycle_feedback` record linked to the pipeline run's cycle.

---

## Database Schema Changes

```sql
-- New table: cycle_feedback (FR-052)
CREATE TABLE IF NOT EXISTS cycle_feedback (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL,
  ticket_id TEXT,
  agent_role TEXT NOT NULL,
  team TEXT NOT NULL DEFAULT 'TheATeam',
  feedback_type TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE CASCADE,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE SET NULL
);

-- Modify: bugs table — add traceability columns (FR-052)
ALTER TABLE bugs ADD COLUMN related_work_item_id TEXT;
ALTER TABLE bugs ADD COLUMN related_work_item_type TEXT;
ALTER TABLE bugs ADD COLUMN related_cycle_id TEXT;

-- Modify: tickets table — add structured fields (FR-052)
ALTER TABLE tickets ADD COLUMN work_item_ref TEXT;
ALTER TABLE tickets ADD COLUMN issue_description TEXT;
ALTER TABLE tickets ADD COLUMN considered_fixes TEXT;  -- JSON

-- Modify: features table — add cycle link and traceability (FR-052)
ALTER TABLE features ADD COLUMN cycle_id TEXT;
ALTER TABLE features ADD COLUMN traceability_report TEXT;
```

**Migration approach:** Idempotent. Use PRAGMA table_info to check column existence before ALTER TABLE (same pattern as existing pipeline_run_id migration).

---

## Design Decisions (Addendum)

| ID | Decision | Rationale |
|----|----------|-----------|
| DD-18 | `related_work_item_id` on bugs is nullable | Backwards compat; manually-created bugs have no parent work item |
| DD-19 | `considered_fixes` stored as JSON TEXT | Flexible schema; no need for separate table; parsed on read |
| DD-20 | `cycle_feedback` is a separate table | Feedback may be cycle-level or ticket-level; queryable; multiple entries per ticket |
| DD-21 | `traceability_report` on features is nullable TEXT | Not all features come from pipeline cycles; backwards compat |
| DD-22 | `completeCycle()` passes cycle_id to Feature creation | Direct cycle→feature linkage for traceability |
| DD-23 | Stage completion accepts optional feedback array | Agents submit feedback atomically with verdict; reduces API round-trips |
| DD-24 | `work_item_ref` on tickets is denormalized | Explicit traceability without joins; agents set it when creating tickets |
