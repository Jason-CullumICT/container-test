# Runs Dashboard & Retry Workflow — Requirements

## Overview
Add a Runs History tab to the Orchestrator page with run details, retry capability, and cleanup actions. Frontend-only changes — the orchestrator API already has all needed endpoints.

## Functional Requirements

### FR-090: API Client Extensions
Add `retryRun(id, opts?)` and `cleanupRun(id)` methods to the orchestrator API client. `retryRun` calls `POST /api/orchestrator/api/runs/{id}/retry`. `cleanupRun` calls `POST /api/orchestrator/api/cycles/{id}/cleanup`. Add typed interfaces for run data.

### FR-091: Runs History Tab
Add a "Runs" tab alongside the existing "Cycles" tab on OrchestratorCyclesPage. The tab calls `orchestrator.listRuns()` with polling every 10 seconds. Displays runs in a table with columns: truncated run ID (last 8 chars, full ID as tooltip), status badge (complete/failed/implementing/planning with appropriate colors), team badge, risk level badge (low=green, medium=yellow, high=red), task summary (first 80 chars, truncated), time-ago timestamp, feedback loop count.

### FR-092: Run Detail Expandable Row
Clicking a run row expands an inline detail section showing: full task description, phase results (leader/implementation/qa/smoketest/inspector with pass/fail indicators), E2E test results if present (tests/passed/failed counts), PR info if present (number, URL, AI review verdict, merge status), and retryOf link if this run is a retry of another.

### FR-093: Retry Button
Failed runs display a Retry button. Clicking calls `orchestrator.retryRun(id)`. On success, show an inline notification banner with the new run ID and auto-expand the new run row. Disable the button while the retry request is in-flight.

### FR-094: Cleanup Button
Completed and failed runs display a small cleanup/dismiss button. Clicking calls `orchestrator.cleanupRun(id)` and removes the row from the local list immediately (optimistic removal).

### FR-095: Real-Time Status Indicators
Runs in an active state (planning, implementing, qa_running, validating) display a pulsing dot indicator. If a matching cycle exists in the cycles list, show a link to switch to the Cycles tab and highlight that cycle.

## Non-Functional Requirements
- No backend changes
- Follow existing component patterns from `Source/Frontend/src/components/orchestrator/`
- Use local TypeScript interfaces for run data (not shared types)
- All list state uses `{data: T[]}` wrapper pattern
- Inline error banners, no external toast library
