# Design: Orchestrator Cycle Dashboard

## Overview

Replace the existing `DevelopmentCyclePage` (which manages internal dev cycles via the `/api/cycles` REST API) with a new `OrchestratorCyclesPage` that displays real-time orchestrator cycles from the external claude-ai-OS orchestrator, accessed via the existing `/api/orchestrator/*` proxy.

## Architecture Decisions

### DD-01: Frontend-only change
The backend already proxies all orchestrator requests at `/api/orchestrator/*`. No backend changes needed.

### DD-02: Replace, don't augment
The old `DevelopmentCyclePage` is fully replaced. The route `/cycle` now points to the new `OrchestratorCyclesPage`. The old page component and its cycle-specific sub-components remain in the codebase (not deleted) since they may still be imported elsewhere or useful for non-orchestrated cycles.

### DD-03: Polling for cycle list, SSE for logs
- Cycle list: Poll `orchestrator.listCycles()` every 5 seconds using `setInterval` + cleanup in `useEffect`
- Cycle logs: Connect to SSE endpoint `/api/orchestrator/api/cycles/:id/logs` using native `EventSource` API
- No WebSocket needed; SSE is simpler and the backend already supports it

### DD-04: Orchestrator API response shapes (assumed from client signatures)
The orchestrator API returns untyped `any` in the client. We define local TypeScript interfaces for the expected shapes:

```typescript
interface OrchestratorCycle {
  id: string
  status: 'running' | 'completed' | 'stopped' | 'failed'
  team?: string
  task?: string
  phase?: string
  progress?: number          // 0-100
  ports?: Record<string, number>  // e.g. { app: 5173, api: 3001 }
  branch?: string
  startedAt?: string         // ISO timestamp
  completedAt?: string
  error?: string
}
```

### DD-05: Component structure

```
Source/Frontend/src/
  pages/
    OrchestratorCyclesPage.tsx     (NEW - replaces DevelopmentCyclePage import in App.tsx)
  components/
    orchestrator/
      CycleCard.tsx                (NEW - single cycle card with status, progress, controls)
      CycleLogStream.tsx           (NEW - SSE-connected real-time log viewer)
      CompletedCyclesSection.tsx   (NEW - collapsible section for done cycles)
```

### DD-06: Sidebar update
Change the "Dev Cycle" nav item label to "Orchestrator" (or keep "Dev Cycle") and keep path `/cycle`.

## Data Flow

```
OrchestratorCyclesPage
  ├── polls orchestrator.listCycles() every 5s
  ├── separates active vs completed cycles
  ├── renders CycleCard for each active cycle
  │     ├── team badge
  │     ├── phase label + progress bar
  │     ├── elapsed time (computed from startedAt)
  │     ├── port links (clickable URLs)
  │     ├── stop button → orchestrator.stopCycle(id)
  │     └── expandable CycleLogStream (SSE)
  └── renders CompletedCyclesSection
        └── collapsible list of completed/stopped/failed cycles
```

## UI Specifications

### Cycle Card (active)
- White card with left border color by status (blue=running, green=completed, red=failed, gray=stopped)
- Top row: cycle ID (mono font) | team badge (pill) | elapsed time
- Middle: task description (truncated) | phase label | progress bar (0-100%)
- Bottom row: port links as buttons (e.g. "App :5173", "API :3001") | Stop button (red, with confirm)

### CycleLogStream
- Dark background (gray-900), monospace font, auto-scroll
- Each log line: timestamp | agent role badge | message
- Max height with overflow scroll
- Toggle button to expand/collapse

### Completed Cycles Section
- Collapsible via disclosure triangle / chevron
- Summary count in header: "Completed (N)"
- Compact rows: cycle ID | team | status badge | duration | completed timestamp
