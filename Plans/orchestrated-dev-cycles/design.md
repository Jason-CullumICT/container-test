# Design: Orchestrated Development Cycles

## Architecture Overview

```
[Approved FR / Triaged Bug]
         |
         v
  POST /api/cycles  ──────────────────────────────────────┐
         |                                                 |
         v                                                 v
  [DevelopmentCycle created]                    [PipelineRun created]
  status: spec_changes                         status: running
         |                                     stage: 1
         |                                                 |
         └──────── linked via pipeline_run_id ─────────────┘
                              |
            ┌─────────────────┼─────────────────┐
            v                 v                  v
    Stage 1: requirements  Stage 2: contract  Stage 3: coders ...
            |                 |                  |
            v                 v                  v
     POST /api/pipeline-runs/:id/stages/:stage/complete
            |
            v
     [Auto-advance cycle phase]
     [Update work item status]
```

## Stage-to-Cycle Phase Mapping

| Pipeline Stage | Stage # | TheATeam Agent(s) | Cycle Phase After Completion |
|----------------|---------|--------------------|-----------------------------|
| Requirements Review | 1 | requirements-reviewer | spec_changes → ticket_breakdown |
| API Contract | 2 | api-contract | ticket_breakdown → implementation |
| Implementation | 3 | backend-coder, frontend-coder | implementation → review |
| QA (Tier 1) | 4 | chaos-tester, security-qa, traceability-reporter, visual-playwright, qa-review-and-tests | review → smoke_test |
| Integration (Tier 2) | 5 | design-critic, integration-reviewer | smoke_test → complete |

**Rationale**: The 5 pipeline stages map naturally to the 6 cycle phases (5 transitions). Each stage completion triggers the next phase transition. Stage 5 completion triggers `complete` with all side-effects (Learning, Feature, CI/CD sim).

## New Domain Entities

### PipelineRun

```typescript
interface PipelineRun {
  id: string;                    // RUN-XXXX
  cycle_id: string;              // FK → cycles.id
  team: string;                  // 'TheATeam'
  status: PipelineRunStatus;     // 'queued' | 'running' | 'completed' | 'failed'
  current_stage: number;         // 1-5
  stages_total: number;          // 5
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}
```

### PipelineStage

```typescript
interface PipelineStage {
  id: string;                    // auto-generated
  pipeline_run_id: string;       // FK → pipeline_runs.id
  stage_number: number;          // 1-5
  stage_name: string;            // 'requirements', 'api_contract', 'implementation', 'qa', 'integration'
  status: PipelineStageStatus;   // 'pending' | 'running' | 'completed' | 'failed'
  verdict: string | null;        // 'approved' | 'rejected' | null
  agent_ids: string;             // JSON array of agent identifiers
  started_at: string | null;
  completed_at: string | null;
}
```

## Modified Entities

### DevelopmentCycle (Extended)

Add `pipeline_run_id` column:
```sql
ALTER TABLE cycles ADD COLUMN pipeline_run_id TEXT;
```

The existing `DevelopmentCycle` TypeScript interface gains:
```typescript
pipeline_run_id: string | null;
pipeline_run?: PipelineRun;      // hydrated on GET
```

## New Database Tables

```sql
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL,
  team TEXT NOT NULL DEFAULT 'TheATeam',
  status TEXT NOT NULL DEFAULT 'queued',
  current_stage INTEGER NOT NULL DEFAULT 0,
  stages_total INTEGER NOT NULL DEFAULT 5,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE CASCADE
);

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
```

## New API Endpoints

### Pipeline Runs

| Method | Path | Description |
|--------|------|-------------|
| `GET /api/pipeline-runs` | List all pipeline runs | `{data: PipelineRun[]}` with optional `?status=` filter |
| `GET /api/pipeline-runs/:id` | Get pipeline run with stages | Includes `stages: PipelineStage[]` |
| `POST /api/pipeline-runs/:id/stages/:stageNumber/start` | Mark stage as running | Sets stage status to `running`, updates `current_stage` |
| `POST /api/pipeline-runs/:id/stages/:stageNumber/complete` | Complete a stage | Advances cycle phase, may trigger cycle completion |
| `GET /api/cycles/:id/pipeline` | Get pipeline run for a cycle | Convenience endpoint |

### Modified Endpoints

| Method | Path | Change |
|--------|------|--------|
| `POST /api/cycles` | Create cycle | Now also creates PipelineRun + 5 PipelineStage records, auto-starts stage 1 |
| `GET /api/cycles/:id` | Get cycle | Response includes `pipeline_run_id` and optionally `pipeline_run` |
| `GET /api/dashboard/summary` | Dashboard | Includes pipeline run status in `active_cycle` |

## Design Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| DD-12 | Stage completion triggers cycle phase advancement automatically | Eliminates manual phase management; pipeline drives cycle state |
| DD-13 | Manual cycle phase advancement (`PATCH /api/cycles/:id` with status) is preserved for non-orchestrated cycles | Backwards compatibility; not all cycles must go through the pipeline |
| DD-14 | Stage 5 completion triggers the existing `completeCycle()` logic (Learning, Feature, CI/CD sim) | Reuse existing side-effects; no duplication |
| DD-15 | Pipeline stage completion requires linear ordering (stage N must complete before stage N+1 can start) | Matches TheATeam's pipeline DAG |
| DD-16 | A failed stage (verdict=rejected) does not auto-advance the cycle; it stays in current phase until resolved or the pipeline is retried | Feedback loops are handled by the orchestrator, not the data model |
| DD-17 | `pipeline_run_id` on cycles is nullable; existing cycles without pipelines continue to work | Non-breaking schema change |

## Service Layer Architecture

```
routes/pipelines.ts  →  services/pipelineService.ts  →  database
routes/cycles.ts     →  services/cycleService.ts      →  database
                              ↕ (cross-service call)
                     pipelineService.advanceStage()
                              → cycleService.updateCycle()
                              → cycleService.completeCycle()
```

## Frontend Changes

### New Components
- `PipelineStepper` — shows 5-stage pipeline progress with agent names and verdicts
- `PipelineStageCard` — individual stage detail (agents, status, verdict)

### Modified Components
- `CycleView` — includes PipelineStepper when cycle has pipeline_run_id
- `SummaryWidgets` — shows pipeline stage in active cycle widget
- `DevelopmentCyclePage` — "Start New Cycle" button now indicates it will start with pipeline orchestration

### New API Client Functions
- `pipelineRuns.list()` / `pipelineRuns.get(id)`
- `pipelineRuns.startStage(runId, stageNumber)`
- `pipelineRuns.completeStage(runId, stageNumber, verdict)`
- `cycles.getPipeline(cycleId)`
