# Design: Dev Cycle Full Traceability

## Architecture Overview

```
[Dev Cycle (CYCLE-XXXX)]
   ├── work_item_id → FR-XXXX or BUG-XXXX (parent work item)
   ├── pipeline_run_id → RUN-XXXX (team + stages)
   │
   ├── [Tickets (TKT-XXXX)]
   │    ├── work_item_ref → FR-XXXX or BUG-XXXX (explicit parent ref)
   │    ├── issue_description → structured problem analysis
   │    └── considered_fixes → JSON array of fix options
   │
   ├── [Cycle Feedback (CFBK-XXXX)]
   │    ├── cycle_id → CYCLE-XXXX
   │    ├── ticket_id → TKT-XXXX (optional)
   │    ├── agent_role → 'security-qa' | 'qa-review' | 'design-critic' | ...
   │    ├── team → 'TheATeam'
   │    ├── feedback_type → 'rejection' | 'finding' | 'suggestion' | 'approval'
   │    └── content → detailed feedback text
   │
   ├── [Bugs raised during cycle]
   │    ├── related_work_item_id → FR-XXXX or BUG-XXXX
   │    ├── related_work_item_type → 'feature_request' | 'bug'
   │    └── related_cycle_id → CYCLE-XXXX
   │
   └── [Feature created on completion]
        ├── source_work_item_id → FR-XXXX or BUG-XXXX (already exists)
        ├── cycle_id → CYCLE-XXXX
        └── traceability_report → JSON text (FR coverage + test mapping)
```

## New Domain Entity: CycleFeedback

```typescript
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
```

## Modified Entities

### BugReport (Extended)

```typescript
export interface BugReport {
  // ... existing fields ...
  related_work_item_id: string | null;     // NEW — parent FR/bug if raised during a cycle
  related_work_item_type: WorkItemType | null; // NEW
  related_cycle_id: string | null;          // NEW — cycle that raised this bug
}
```

### Ticket (Extended)

```typescript
export interface Ticket {
  // ... existing fields ...
  work_item_ref: string | null;            // NEW — parent FR/bug ID (explicit ref)
  issue_description: string | null;        // NEW — structured problem analysis
  considered_fixes: ConsideredFix[] | null; // NEW — parsed from JSON
}

export interface ConsideredFix {
  description: string;
  rationale: string;
  selected: boolean;    // which fix was chosen
}
```

### Feature (Extended)

```typescript
export interface Feature {
  // ... existing fields ...
  cycle_id: string | null;                 // NEW — which cycle produced this
  traceability_report: string | null;      // NEW — JSON traceability report text
}
```

### DevelopmentCycle (Extended response)

The GET response gains:
```typescript
export interface DevelopmentCycle {
  // ... existing fields ...
  feedback: CycleFeedback[];              // NEW — hydrated on GET /api/cycles/:id
  team_name: string | null;               // NEW — derived from pipeline_run.team
}
```

## New Database Tables

```sql
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
```

## Schema Modifications (ALTER TABLE)

```sql
-- Bugs: add traceability columns
ALTER TABLE bugs ADD COLUMN related_work_item_id TEXT;
ALTER TABLE bugs ADD COLUMN related_work_item_type TEXT;
ALTER TABLE bugs ADD COLUMN related_cycle_id TEXT;

-- Tickets: add structured fields
ALTER TABLE tickets ADD COLUMN work_item_ref TEXT;
ALTER TABLE tickets ADD COLUMN issue_description TEXT;
ALTER TABLE tickets ADD COLUMN considered_fixes TEXT;  -- JSON array

-- Features: add cycle link and traceability report
ALTER TABLE features ADD COLUMN cycle_id TEXT;
ALTER TABLE features ADD COLUMN traceability_report TEXT;
```

## New API Endpoints

### Cycle Feedback

| Method | Path | Description |
|--------|------|-------------|
| `GET /api/cycles/:id/feedback` | List feedback for a cycle | `{data: CycleFeedback[]}` |
| `POST /api/cycles/:id/feedback` | Add feedback to a cycle | Creates CycleFeedback |

### Modified Endpoints

| Method | Path | Change |
|--------|------|--------|
| `POST /api/bugs` | Create bug | Accepts optional `related_work_item_id`, `related_work_item_type`, `related_cycle_id` |
| `GET /api/bugs/:id` | Get bug | Response includes new fields |
| `POST /api/cycles/:id/tickets` | Create ticket | Accepts optional `work_item_ref`, `issue_description`, `considered_fixes` |
| `GET /api/cycles/:id` | Get cycle | Response includes `feedback[]` and `team_name` |
| `GET /api/features` | List features | Response includes `cycle_id` and `traceability_report` |
| `POST /api/cycles/:id/complete` | Complete cycle | Now also stores `cycle_id` on Feature record |

### Pipeline Stage Completion (Modified)

`POST /api/pipeline-runs/:id/stages/:stageNumber/complete` now accepts an optional `feedback` array in the body:

```json
{
  "verdict": "approved",
  "feedback": [
    {
      "ticket_id": "TKT-0001",
      "agent_role": "security-qa",
      "feedback_type": "finding",
      "content": "SQL injection risk in parameter handling..."
    }
  ]
}
```

This allows pipeline agents to submit structured feedback as part of stage completion, which gets stored in the `cycle_feedback` table automatically.

## Design Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| DD-18 | `related_work_item_id` on bugs is nullable | Backwards compat; manually-created bugs have no parent work item |
| DD-19 | `considered_fixes` stored as JSON TEXT in SQLite | Flexible schema; parsed on read; no need for a separate table |
| DD-20 | `cycle_feedback` is a separate table, not embedded in tickets | Feedback may be cycle-level (not ticket-specific); queryable; multiple feedback entries per ticket |
| DD-21 | `traceability_report` on features is nullable TEXT (JSON) | Not all features come from pipeline cycles; backwards compat |
| DD-22 | `completeCycle()` passes cycle_id when creating Feature record | Enables direct cycle→feature linkage without extra queries |
| DD-23 | Stage completion accepts optional feedback array | Agents can submit feedback atomically with their verdict; reduces API calls |
| DD-24 | `work_item_ref` on tickets is denormalized from `cycle.work_item_id` | Makes ticket-level traceability explicit; no join needed to find parent work item |

## Service Layer Changes

```
cycleService.ts     → Add feedback hydration to getCycleById; modify completeCycle to pass cycle_id to feature
bugService.ts       → Accept and store related_work_item_id, related_work_item_type, related_cycle_id
cycleService.ts     → Accept and store work_item_ref, issue_description, considered_fixes on tickets
featureService.ts   → Accept and store cycle_id, traceability_report
pipelineService.ts  → Accept optional feedback in completeStageAction; create cycle_feedback records
NEW: feedbackService.ts → CRUD for cycle_feedback table
```

## Frontend Changes

### Modified Components
- `CycleView` — show team name, feedback log with agent role badges and feedback type tags
- `TicketBoard` — show `work_item_ref` link, `considered_fixes` expandable section
- `FeatureBrowser` — show traceability report link/expandable on feature detail
- `BugDetail` — show related work item and cycle links

### New Components
- `FeedbackLog` — displays cycle feedback entries with filters by agent_role and feedback_type
- `ConsideredFixesList` — renders the considered_fixes array with selected fix highlighted
- `TraceabilityReport` — renders the traceability report JSON as a formatted table
