# Feature: Orchestrated Development Cycles via TheATeam Pipeline

## Problem Statement

Currently, development cycles are manually advanced through phases (spec_changes → ticket_breakdown → implementation → review → smoke_test → complete). There is no automated orchestration connecting the cycle lifecycle to the TheATeam agent pipeline. Features and bugs must be manually shepherded through each phase.

## Desired Behavior

1. **Work items wait for approval**: Feature requests go through the existing intake → voting → human approval flow. Bug reports go through reported → triaged flow. No changes to the approval pipeline.

2. **Approved items enter the backlog**: When a feature is approved (status = `approved`) or a bug is triaged (status = `triaged`), it is ready to be picked up by the next development cycle. This already works.

3. **Dev cycle starts and orchestrates through TheATeam**: When a dev cycle is started (`POST /api/cycles`), the system picks the highest-priority item (bugs before FRs, by severity/priority, then oldest) — this selection model already exists. **NEW**: The cycle is now linked to a pipeline run that maps to TheATeam's pipeline stages.

4. **Automatic status progression**: As the pipeline progresses through stages (requirements → api-contract → coding → QA → integration), the cycle status automatically advances through its phases. The work item status (FR or bug) updates alongside.

5. **Pipeline visibility**: The UI shows pipeline progress alongside cycle phases — which stage is active, which agents are running, verdicts from completed stages.

## Selection Priority (Existing, No Change)

1. Triaged bugs, ordered by severity (critical > high > medium > low), then oldest
2. Approved feature requests, ordered by priority (critical > high > medium > low), then oldest

## Scope

- Add pipeline orchestration entities (PipelineRun, PipelineStage)
- Link cycles to pipeline runs
- Add stage-completion callback endpoints
- Auto-advance cycle phases as pipeline stages complete
- Frontend pipeline progress display
- Dashboard pipeline status integration
