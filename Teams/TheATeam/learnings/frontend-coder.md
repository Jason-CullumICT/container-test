# Frontend Coder Learnings

## Session: 2026-03-23

### Project Setup
- Tests live at `/workspace/Source/Frontend/tests/` (root-level `tests/` not `src/tests/`)
- Vite config references `./tests/setup.ts` for the setup file
- `@shared` alias is NOT configured in vite.config.ts; Shared types are imported with relative paths like `../../../Shared/types` from `src/components/` or `../../Shared/types` from the `tests/` directory
- Node modules already installed; `npm test` runs `vitest run` directly

### Test Infrastructure
- All 8 test files in `tests/` pass without configuration changes
- React Router `MemoryRouter` is used in tests — no `BrowserRouter` needed for component tests
- Vitest globals are enabled (`globals: true`) so no need to import `describe`, `it`, `expect` from vitest in tests (though importing them explicitly also works)
- Warning: "An update to X inside a test was not wrapped in act(...)" appears but tests still pass — these are non-blocking async state update warnings from React 18

### Traceability
- `python3 tools/traceability-enforcer.py` must pass before completion
- FR-032 (frontend tests) needs `// Verifies: FR-032` comment in the key test files (Dashboard, FeatureRequests, Approvals, DevelopmentCycle)
- The traceability enforcer scans all files under Source/ and reports per-FR coverage

### Architecture Patterns
- `useApi` hook (`src/hooks/useApi.ts`) handles loading/error/data state for all API calls
- `useCallback` wraps all fetch functions passed to `useApi` to avoid infinite re-fetch loops
- Layout component fetches badge counts using `dashboard.getSummary` + `featureRequests.list({status:'voting'})`
- Badge counts refresh every 30 seconds via `setInterval`
- Approvals page shows ONLY `voting`-status FRs (per DD-1: voting does not auto-approve)
- All list pages handle loading/error/empty states

### DD-1 Alignment (Critical)
- `POST /api/feature-requests/:id/vote` leaves FR in `voting` status — does NOT auto-transition
- ApprovalsPage fetches `featureRequests.list({ status: 'voting' })` — correctly shows all voting FRs for human decision
- ApprovalQueue renders approve/deny actions for each item regardless of vote majority (majority is advisory only)

## Session: 2026-03-24

### Pipeline Orchestration (FR-044 through FR-049)
- Shared types for PipelineRun/PipelineStage already existed in `Source/Shared/types.ts` (added by backend-coder as FR-033/FR-034)
- `DevelopmentCycle` type now has `pipeline_run_id: string | null` and optional `pipeline_run?: PipelineRun`
- `DashboardSummary.active_cycle` now includes `pipeline_run_id`, `pipeline_stage`, `pipeline_status` fields
- Import path from `src/components/cycles/` to Shared is `../../../../Shared/types` (4 levels up, NOT 5)

### Pipeline UI Integration
- CycleView hides manual advance/complete buttons for pipeline-linked cycles (`pipeline_run_id !== null`)
- PipelineStepper component shows 5-stage progress with status, agents, verdicts, team label
- SummaryWidgets show pipeline stage N/5 + stage name + status when `pipeline_run_id` is present on active_cycle
- Tests must account for text that appears in BOTH cycle phase badge AND pipeline stage label (use `getAllByText` not `getByText` for "Implementation" etc.)

### Test Patterns for Pipeline
- Mock `pipelineRuns` alongside `cycles` in the mock factory for client.ts
- Use `data-testid="pipeline-stepper"` to target the pipeline stepper in integration tests
- Pipeline test file: `tests/PipelineStepper.test.tsx` — unit tests for component + integration tests via DevelopmentCyclePage
- Import the real module BEFORE `vi.mock()` to test that exports exist (FR-044 traceability)

### Dev Cycle Traceability (FR-063 through FR-069)
- Shared types (FR-050/FR-051) were already updated by backend-coder — check before duplicating work
- Import path from `src/components/cycles/` to Shared is `../../../../../Shared/types` for new nested components (FeedbackLog, ConsideredFixesList)
- When text appears in both filter dropdowns and content badges, use `getAllByText().length >= N` instead of `getByText()` in tests
- FeedbackLog uses `data-testid="feedback-log"` and `data-testid="feedback-entry"` for targeting
- ConsideredFixesList returns null for null/empty arrays — test with `container.innerHTML === ''`
- TraceabilityReport is expandable/collapsible; must click header before asserting table content
- BugDetail now requires `MemoryRouter` wrapper in tests due to `Link` component (from react-router-dom)
- `CycleFeedback` client functions are in `cycleFeedback` namespace (not under `cycles`)
- Mock `cycleFeedback` alongside `cycles` when testing CycleView integration
- New test file: `tests/Traceability.test.tsx` — covers all traceability components (29 tests)

## Session: 2026-03-25

### Orchestrator Cycle Dashboard (FR-070 through FR-076)
- Orchestrator types are LOCAL to `src/components/orchestrator/types.ts` — not shared types (external service schema)
- `orchestrator` API client functions are in `orchestrator` namespace in `src/api/client.ts`
- When parallel coders create a fallback (CycleCardFallback) and real component (CycleCard), wire up the real component and remove the fallback
- CycleCard has its own `window.confirm` for stop — remove any duplicate confirm from the page-level handler to avoid double prompts
- SSE log stream uses native `EventSource` API — mock with `vi.stubGlobal('EventSource', MockEventSource)` in tests
- Layout.test.tsx had stale assertions: `pendingApprovals` prop doesn't exist on Sidebar (only `activeBugs` + `pendingFRs`), and Layout doesn't call `featureRequests.list` directly
- Sidebar label changed from "Dev Cycle" to "Orchestrator" with ⚡ icon — update all test assertions referencing old label
- Pre-existing TS errors in `ConsideredFixesList.tsx` and `FeedbackLog.tsx` (import path `../../../../../Shared/types` not found) — not related to orchestrator work
- Test file `tests/OrchestratorCycles.test.tsx` covers FR-070 through FR-076 (23 tests)
- Additional test file `tests/OrchestratorCycleCard.test.tsx` covers FR-071, FR-072, FR-073 card/log stream unit tests (27 tests)
- When CycleCard contains CycleLogStream, CycleCard tests also need the EventSource stub even if not testing logs directly
- `vi.useFakeTimers({ shouldAdvanceTime: true })` works well for testing elapsed time updates in CycleCard
- `encodeURIComponent` used for cycleId in SSE URL to prevent injection
