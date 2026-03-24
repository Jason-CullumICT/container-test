# API Contracts: Orchestrated Development Cycles

**Date:** 2026-03-24
**Base:** Plans/dev-workflow-platform/contracts.md

---

## New Shared Types (Source/Shared/types.ts)

```typescript
// --- Pipeline Orchestration Types ---

export type PipelineRunStatus = 'queued' | 'running' | 'completed' | 'failed';
export type PipelineStageStatus = 'pending' | 'running' | 'completed' | 'failed';
export type PipelineStageName = 'requirements' | 'api_contract' | 'implementation' | 'qa' | 'integration';
export type PipelineStageVerdict = 'approved' | 'rejected' | null;

export interface PipelineStage {
  id: string;
  pipeline_run_id: string;
  stage_number: number;           // 1-5
  stage_name: PipelineStageName;
  status: PipelineStageStatus;
  verdict: string | null;         // 'approved' | 'rejected' | null
  agent_ids: string[];            // parsed from JSON
  started_at: string | null;
  completed_at: string | null;
}

export interface PipelineRun {
  id: string;                     // RUN-XXXX
  cycle_id: string;
  team: string;                   // 'TheATeam'
  status: PipelineRunStatus;
  current_stage: number;          // 0 = not started, 1-5 = active stage
  stages_total: number;           // 5
  stages: PipelineStage[];
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}
```

### Modified: DevelopmentCycle

```typescript
export interface DevelopmentCycle {
  // ... existing fields ...
  pipeline_run_id: string | null;     // NEW — nullable for backwards compat
  pipeline_run?: PipelineRun;         // NEW — hydrated on GET /api/cycles/:id
}
```

### Modified: DashboardSummary.active_cycle

```typescript
active_cycle: {
  id: string;
  status: CycleStatus;
  work_item_id: string;
  work_item_type: WorkItemType;
  pipeline_run_id: string | null;     // NEW
  pipeline_stage: number | null;      // NEW — current stage number
  pipeline_status: PipelineRunStatus | null;  // NEW
} | null;
```

---

## New API Types (Source/Shared/api.ts)

```typescript
// --- Pipeline Runs ---
export type PipelineRunListResponse = DataResponse<PipelineRun>;
export type PipelineRunResponse = PipelineRun;

export interface CompleteStageInput {
  verdict: 'approved' | 'rejected';
}
```

---

## New API Endpoints

### GET /api/pipeline-runs

**Query params:** `?status=running` (optional filter)

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "RUN-0001",
      "cycle_id": "CYCLE-0001",
      "team": "TheATeam",
      "status": "running",
      "current_stage": 2,
      "stages_total": 5,
      "stages": [ /* PipelineStage[] */ ],
      "created_at": "2026-03-24T10:00:00.000Z",
      "updated_at": "2026-03-24T10:05:00.000Z",
      "completed_at": null
    }
  ]
}
```

### GET /api/pipeline-runs/:id

**Response:** `200 OK` — Single PipelineRun with stages array

**Errors:** `404` if not found

### POST /api/pipeline-runs/:id/stages/:stageNumber/start

Marks a stage as `running`. Sets `started_at`. Updates `current_stage` on the pipeline run.

**Request body:** (none)

**Response:** `200 OK` — Updated PipelineRun

**Errors:**
- `404` — Pipeline run or stage not found
- `409` — Stage already started/completed, or previous stage not completed

### POST /api/pipeline-runs/:id/stages/:stageNumber/complete

Marks a stage as `completed`. Sets `completed_at` and `verdict`. **Auto-advances the linked cycle phase.** If stage 5, triggers `completeCycle()` with all side-effects.

**Request body:**
```json
{
  "verdict": "approved"
}
```

**Response:** `200 OK` — Updated PipelineRun

**Errors:**
- `400` — Invalid verdict (must be 'approved' or 'rejected')
- `404` — Pipeline run or stage not found
- `409` — Stage not in `running` status; or verdict is `rejected` (stage stays, doesn't advance)

**Side-effects on verdict=approved:**
| Stage | Cycle Transition |
|-------|-----------------|
| 1 | spec_changes → ticket_breakdown |
| 2 | ticket_breakdown → implementation |
| 3 | implementation → review |
| 4 | review → smoke_test |
| 5 | smoke_test → complete (via completeCycle) |

**Side-effects on verdict=rejected:**
- Stage marked as `failed`
- Pipeline run status stays `running`
- Cycle phase does NOT advance
- Orchestrator is expected to handle retry (re-start the stage after fixes)

### GET /api/cycles/:id/pipeline

**Response:** `200 OK` — PipelineRun for the cycle (with stages)

**Errors:**
- `404` — Cycle not found or no pipeline linked

---

## Modified Endpoints

### POST /api/cycles (Modified)

**Existing behavior preserved.** Additionally:
- Creates a PipelineRun record linked to the new cycle
- Creates 5 PipelineStage records (all `pending`)
- Auto-starts stage 1 (sets to `running`)
- Sets `pipeline_run_id` on the cycle

**Response:** `201 Created` — DevelopmentCycle with `pipeline_run_id` set

### GET /api/cycles/:id (Modified)

**Existing behavior preserved.** Additionally:
- If `pipeline_run_id` is present, hydrates `pipeline_run` with its stages

### PATCH /api/cycles/:id (Modified — DD-13 + FR-039)

**New guard:** If the cycle has a `pipeline_run_id` and the PATCH includes a `status` field:
- Return `409 Conflict` with message: `"This cycle is orchestrated via pipeline RUN-XXXX. Use pipeline stage completion to advance phases."`
- `spec_changes` field updates are still allowed (pipeline agents may update spec_changes text)

### GET /api/dashboard/summary (Modified)

**Existing behavior preserved.** `active_cycle` object gains three new fields:
- `pipeline_run_id: string | null`
- `pipeline_stage: number | null`
- `pipeline_status: PipelineRunStatus | null`

---

## Critical Design Decisions (Addendum)

| ID | Decision | Rationale |
|----|----------|-----------|
| DD-12 | Stage completion auto-advances cycle phase | Eliminates manual phase management for orchestrated cycles |
| DD-13 | Manual PATCH status preserved for non-pipeline cycles | Backwards compatibility |
| DD-14 | Stage 5 completion reuses existing completeCycle() | No duplication of Learning/Feature/CI-CD sim logic |
| DD-15 | Stages must complete linearly (N before N+1) | Matches TheATeam pipeline DAG structure |
| DD-16 | Rejected verdict does not advance cycle; stays in current phase | Orchestrator handles retries externally |
| DD-17 | pipeline_run_id on cycles is nullable | Non-breaking schema change; existing cycles unaffected |

---

## Database Schema Changes

```sql
-- New table: pipeline_runs
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL UNIQUE,
  team TEXT NOT NULL DEFAULT 'TheATeam',
  status TEXT NOT NULL DEFAULT 'queued',
  current_stage INTEGER NOT NULL DEFAULT 0,
  stages_total INTEGER NOT NULL DEFAULT 5,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE CASCADE
);

-- New table: pipeline_stages
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id TEXT PRIMARY KEY,
  pipeline_run_id TEXT NOT NULL,
  stage_number INTEGER NOT NULL,
  stage_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  verdict TEXT,
  agent_ids TEXT NOT NULL DEFAULT '[]',
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (pipeline_run_id) REFERENCES pipeline_runs(id) ON DELETE CASCADE
);

-- Modify existing: cycles table
-- Add nullable pipeline_run_id column
ALTER TABLE cycles ADD COLUMN pipeline_run_id TEXT;
```

**Migration approach:** Idempotent (CREATE TABLE IF NOT EXISTS). The ALTER TABLE for cycles requires handling the case where the column already exists — use a try/catch or check for column existence.
