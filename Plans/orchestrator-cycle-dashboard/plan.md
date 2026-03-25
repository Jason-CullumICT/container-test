# Implementation Plan: Orchestrator Cycle Dashboard

**Date:** 2026-03-25
**Team:** TheATeam
**Design:** Plans/orchestrator-cycle-dashboard/design.md
**Contracts:** Plans/orchestrator-cycle-dashboard/contracts.md
**Requirements:** Plans/orchestrator-cycle-dashboard/requirements.md

---

## Overview

Frontend-only feature. Replace the Dev Cycle page with an orchestrator-aware real-time dashboard. No backend changes.

## Implementation Stages

### Stage 1: Requirements Review
**Status:** COMPLETE (inline in this planning session)
**Verdict:** APPROVED — see requirements.md

### Stage 2: API Contract
**Status:** COMPLETE (inline in this planning session)
**Verdict:** No new backend endpoints. Frontend types defined in contracts.md.

### Stage 3: Implementation

#### frontend-coder-1: Page Shell + Routing (5 pts)

**Assigned FRs:** FR-070, FR-074, FR-075, FR-076

**Files to create:**
- `Source/Frontend/src/pages/OrchestratorCyclesPage.tsx`
- `Source/Frontend/src/components/orchestrator/CompletedCyclesSection.tsx`
- `Source/Frontend/src/components/orchestrator/types.ts`

**Files to modify:**
- `Source/Frontend/src/App.tsx` — change import from `DevelopmentCyclePage` to `OrchestratorCyclesPage`
- `Source/Frontend/src/components/layout/Sidebar.tsx` — update label "Dev Cycle" to "Orchestrator"

**Implementation details:**

1. **types.ts** — Define `OrchestratorCycle` and `CycleLogEntry` interfaces per contracts.md

2. **OrchestratorCyclesPage.tsx** (FR-070):
   - Import `orchestrator` from `../../api/client`
   - Import `Header` from `../components/layout/Header`
   - State: `cycles: OrchestratorCycle[]`, `loading: boolean`, `error: string | null`
   - `useEffect` with `setInterval` polling `orchestrator.listCycles()` every 5000ms
   - Cleanup interval on unmount
   - Separate cycles into active (`status === 'running'`) and completed (everything else)
   - Render `Header` with title "Orchestrator Cycles"
   - Render `CycleCard` for each active cycle (imported from sibling coder's work — use a simple placeholder card inline if CycleCard not yet available, or import it)
   - Render `CompletedCyclesSection` for completed cycles
   - Handle loading spinner and error states
   - Add `// Verifies: FR-070` comment

3. **CompletedCyclesSection.tsx** (FR-074):
   - Props: `{ cycles: OrchestratorCycle[] }`
   - State: `expanded: boolean` (default false)
   - Header with chevron toggle and count
   - When expanded, render compact rows with: cycle ID, team, status badge (color-coded), duration (completedAt - startedAt), completion timestamp
   - Add `// Verifies: FR-074` comment

4. **App.tsx** (FR-075):
   - Replace `import { DevelopmentCyclePage }` with `import { OrchestratorCyclesPage }`
   - Change `<Route path="/cycle" element={<DevelopmentCyclePage />} />` to `<Route path="/cycle" element={<OrchestratorCyclesPage />} />`

5. **Sidebar.tsx** (FR-076):
   - Change `{ path: '/cycle', label: 'Dev Cycle', icon: '🔄' }` to `{ path: '/cycle', label: 'Orchestrator', icon: '🔄' }`

---

#### frontend-coder-2: Cycle Card + Log Stream (5 pts)

**Assigned FRs:** FR-071, FR-072, FR-073

**Files to create:**
- `Source/Frontend/src/components/orchestrator/CycleCard.tsx`
- `Source/Frontend/src/components/orchestrator/CycleLogStream.tsx`

**Implementation details:**

1. **CycleCard.tsx** (FR-071, FR-072):
   - Props: `{ cycle: OrchestratorCycle; onStop: (id: string) => void; onRefresh: () => void }`
   - Import `OrchestratorCycle` from `./types`
   - White card with left border color based on status:
     - `running` → blue (border-l-blue-500)
     - `completed` → green (border-l-green-500)
     - `failed` → red (border-l-red-500)
     - `stopped` → gray (border-l-gray-400)
   - **Top row:** Cycle ID (font-mono text-sm) | team badge (if present — indigo pill like existing CycleView) | elapsed time
   - **Elapsed time:** Compute from `cycle.startedAt` using a `useState` + `setInterval(1000ms)` that updates a display string like "2m 34s" or "1h 15m"
   - **Middle:** Task description (line-clamp-2) | Phase label (bold) | Progress bar (div with percentage width, bg-blue-600)
   - **Bottom row:**
     - Port links: For each entry in `cycle.ports`, render a button/link `<a href="http://localhost:{port}" target="_blank">` labeled with key + port (e.g. "App :5173")
     - Stop button (FR-072): Red outlined button "Stop". On click, show `window.confirm('Stop cycle {id}?')`. If confirmed, call `onStop(cycle.id)`.
   - **Log toggle:** A "View Logs" button that toggles `showLogs` state, rendering `<CycleLogStream cycleId={cycle.id} expanded={showLogs} />`
   - Add `// Verifies: FR-071` and `// Verifies: FR-072` comments

2. **CycleLogStream.tsx** (FR-073):
   - Props: `{ cycleId: string; expanded: boolean }`
   - If not expanded, render nothing
   - On mount (when expanded), create `new EventSource('/api/orchestrator/api/cycles/{cycleId}/logs')`
   - `onmessage` handler: parse `event.data` as JSON `CycleLogEntry`, append to `logs` state array
   - `onerror` handler: set reconnecting state, EventSource auto-reconnects
   - On unmount or when `expanded` becomes false, call `eventSource.close()`
   - Render: dark container (`bg-gray-900 text-green-400 font-mono text-xs`), max-h-64 overflow-y-auto
   - Each log line: `[HH:MM:SS]` timestamp | agent role badge (if present) | message
   - Auto-scroll to bottom using `useRef` on container + `scrollTop = scrollHeight` after new entries
   - Add `// Verifies: FR-073` comment

---

### Stage 4: QA & Review

Standard QA pipeline:
- **qa-review-and-tests**: Verify all FR traceability comments present, components render without errors, polling cleanup works
- **traceability-reporter**: Verify FR-070 through FR-076 all have `// Verifies:` comments
- **visual-playwright**: Screenshot the /cycle page with mock data
- **security-qa**: Review for XSS in log rendering, ensure port links don't allow injection
- **chaos-tester**: Test with empty cycle list, API errors, SSE disconnect

---

## Dependency Graph

```
types.ts (no deps)
  ├── CycleCard.tsx (depends on types.ts)
  │     └── CycleLogStream.tsx (depends on types.ts)
  ├── CompletedCyclesSection.tsx (depends on types.ts)
  └── OrchestratorCyclesPage.tsx (depends on CycleCard, CompletedCyclesSection, types)
        ├── App.tsx (imports OrchestratorCyclesPage)
        └── Sidebar.tsx (label change only, no import dep)
```

Both coders can work in parallel. Coder-1 creates types.ts first (shared), then the page shell can use inline placeholders for CycleCard until coder-2 finishes.

## Risk Mitigations

- **Orchestrator API shape unknown**: Types are based on client signatures + reasonable assumptions. The `any` return types mean we must handle missing fields gracefully with optional chaining.
- **SSE endpoint may not exist yet**: CycleLogStream should handle EventSource connection errors gracefully (show "Logs unavailable" message).
- **Port links on localhost**: Only useful in dev. Render them as-is since this is a dev tool.
