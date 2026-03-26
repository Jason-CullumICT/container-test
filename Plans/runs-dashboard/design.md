# Runs Dashboard & Retry Workflow — Design

## Architecture Decisions

### DD-01: Frontend-Only Change
All changes are in `Source/Frontend/`. The orchestrator API already exposes GET /api/runs, GET /api/runs/:id, POST /api/runs/:id/retry, POST /api/cycles/:id/cleanup. The backend proxy at /api/orchestrator/* already forwards everything.

### DD-02: Tab-Based Navigation on Existing Page
Add a tab bar to OrchestratorCyclesPage rather than creating a new page/route. Two tabs: "Cycles" (existing content) and "Runs" (new). This keeps the orchestrator experience unified. Use a simple useState for tab state with inline tab buttons, consistent with the codebase's approach of no external tab library.

### DD-03: Local Types for Run Data
Define `OrchestratorRun` and related interfaces in `Source/Frontend/src/components/orchestrator/types.ts`, alongside the existing `OrchestratorCycle` type. These are local types for external service data (not shared types).

### DD-04: Polling at 10s for Runs
Runs change less frequently than cycles, so use 10s poll interval (vs 5s for cycles). Same useRef + setInterval pattern as existing cycles polling. Only poll when Runs tab is active.

### DD-05: Inline Notification (No Toast Library)
The codebase doesn't use a toast library. After a successful retry, show a green inline banner at the top of the runs list with the new run ID. Auto-dismiss after 5 seconds.

### DD-06: Optimistic Cleanup
When cleanup is clicked, immediately remove the row from local state. If the API call fails, re-fetch the list to restore accurate state and show an error banner.

## Component Structure

### Modified Files
1. **`Source/Frontend/src/api/client.ts`** — Add `retryRun()` and `cleanupRun()` methods
2. **`Source/Frontend/src/components/orchestrator/types.ts`** — Add `OrchestratorRun`, `RunPhaseResult`, `RunTestResults`, `RunPRInfo` interfaces
3. **`Source/Frontend/src/pages/OrchestratorCyclesPage.tsx`** — Add tab bar, import RunsTab component

### New Files
4. **`Source/Frontend/src/components/orchestrator/RunsTab.tsx`** — Main runs tab with table, polling, retry/cleanup handlers, notification banner
5. **`Source/Frontend/src/components/orchestrator/RunDetailRow.tsx`** — Expandable detail view for a single run
6. **`Source/Frontend/tests/OrchestratorRuns.test.tsx`** — Tests for FR-090 through FR-095

## UI Specification

### Tab Bar
```
[ Cycles ] [ Runs ]
           ^^^^^^ active tab has bottom border + bold text
```
Simple inline buttons at top of content area, below the Header component.

### Runs Table Columns
| Column | Width | Content |
|--------|-------|---------|
| ID | 100px | Last 8 chars, `title` attr = full ID |
| Status | 120px | Badge: complete=green, failed=red, implementing=blue, planning=purple |
| Team | 100px | Badge with team name |
| Risk | 80px | Badge: low=green, medium=yellow, high=red |
| Task | flex | First 80 chars + ellipsis |
| Time | 100px | Relative time-ago (e.g., "3m ago") |
| Loops | 60px | Feedback loop count number |
| Actions | 120px | Retry (failed only) + Cleanup (completed/failed) buttons |

### Expandable Row Detail
Shows below the table row when clicked. Contains:
- Full task description text
- Phase results grid (5 phases, each with pass/fail icon)
- E2E test summary (if present)
- PR info card (if present)
- RetryOf link (if present)

### Status Colors
```typescript
const RUN_STATUS_COLORS: Record<string, string> = {
  complete: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  implementing: 'bg-blue-100 text-blue-700',
  planning: 'bg-purple-100 text-purple-700',
  qa_running: 'bg-yellow-100 text-yellow-700',
  validating: 'bg-indigo-100 text-indigo-700',
}

const RISK_COLORS: Record<string, string> = {
  low: 'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-red-100 text-red-700',
}
```

### Active State Pulsing
For active runs, prepend a pulsing dot before the status badge:
```html
<span class="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse mr-1"></span>
```
