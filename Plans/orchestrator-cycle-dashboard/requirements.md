# Requirements Review: Orchestrator Cycle Dashboard

**Reviewer:** team_leader (planning mode)
**Date:** 2026-03-25
**Design:** Plans/orchestrator-cycle-dashboard/design.md

---

## Verdict: APPROVED

Frontend-only feature that replaces the Dev Cycle page with an orchestrator-aware dashboard. No backend changes. Uses existing API client methods. Clean component decomposition with polling + SSE for real-time updates.

---

## Functional Requirements

| ID | Description | Layer | Weight | Acceptance Criteria |
|----|-------------|-------|--------|---------------------|
| FR-070 | Create `OrchestratorCyclesPage` that polls `orchestrator.listCycles()` every 5 seconds and separates active vs completed cycles | [frontend] | M | Page loads, shows spinner, then displays cycles; auto-refreshes every 5s; interval cleaned up on unmount |
| FR-071 | Create `CycleCard` component displaying cycle ID, team badge, current phase, progress bar, elapsed time, and port links | [frontend] | M | Card renders all fields; progress bar reflects percentage; elapsed time updates; port links are clickable anchors opening in new tab |
| FR-072 | Add stop button to `CycleCard` that calls `orchestrator.stopCycle(id)` with confirmation | [frontend] | S | Stop button visible on active cycles; confirm dialog shown; on confirm, API called and list refreshes |
| FR-073 | Create `CycleLogStream` component connecting to SSE endpoint `/api/orchestrator/api/cycles/:id/logs` with real-time rendering | [frontend] | M | EventSource connects on mount, disconnects on unmount; log lines rendered with timestamp and agent role; auto-scrolls to bottom; dark themed monospace display |
| FR-074 | Create `CompletedCyclesSection` as a collapsible section showing completed/stopped/failed cycles | [frontend] | S | Section collapsed by default; shows count in header; expands to show compact cycle rows with status badge and duration |
| FR-075 | Update `App.tsx` to import `OrchestratorCyclesPage` and route `/cycle` to it instead of `DevelopmentCyclePage` | [frontend] | S | Route `/cycle` renders the new page; no import errors |
| FR-076 | Update `Sidebar.tsx` nav item label from "Dev Cycle" to "Orchestrator" for the `/cycle` path | [frontend] | S | Sidebar shows "Orchestrator" label with appropriate icon |

---

## Scoping / Bin-Packing Plan

### Frontend Layer

| FR | Weight | Points |
|----|--------|--------|
| FR-070 | M | 2 |
| FR-071 | M | 2 |
| FR-072 | S | 1 |
| FR-073 | M | 2 |
| FR-074 | S | 1 |
| FR-075 | S | 1 |
| FR-076 | S | 1 |
| **Total** | | **10** |

**Scaling decision:** 10 points -> 2 frontend coders

**Coder assignments:**

- **frontend-coder-1** (5 pts): FR-070 (OrchestratorCyclesPage), FR-074 (CompletedCyclesSection), FR-075 (App.tsx route), FR-076 (Sidebar update)
  - Rationale: Page shell + routing + completed section are tightly coupled

- **frontend-coder-2** (5 pts): FR-071 (CycleCard), FR-072 (stop button), FR-073 (CycleLogStream)
  - Rationale: Card + log stream are tightly coupled child components

### Backend Layer

No backend changes required. The orchestrator proxy already exists.

---

## Non-Functional Requirements

- Polling interval must be cleaned up on component unmount (no memory leaks)
- SSE EventSource must be closed on component unmount
- No `console.log` — use structured logging if needed (per CLAUDE.md)
- Components must handle error states (API down, SSE disconnect)
- All new components must have `// Verifies: FR-0XX` traceability comments
