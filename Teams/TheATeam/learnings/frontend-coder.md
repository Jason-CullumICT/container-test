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

### Image Upload Feature (FR-080, FR-081, FR-086, FR-089)
- New `common/` component directory at `src/components/common/` for shared UI components
- `ImageUpload` and `ImageThumbnails` use named exports (linter converts default → named)
- Import path from `src/components/common/` to Shared is `../../../../Shared/types` (4 levels up)
- `images` API client namespace uses raw `fetch` with `FormData` for uploads — NOT `apiFetch` (which sets JSON Content-Type)
- `handleResponse` helper extracted for reuse by both `images.upload` and `orchestrator.submitWork` multipart path
- Vite config needs `/uploads` proxy alongside `/api` for static file serving in dev
- `URL.createObjectURL` / `URL.revokeObjectURL` must be mocked in jsdom tests for file preview testing
- When mocking `createObjectURL` to return same string, React warns about duplicate keys in preview grid — non-blocking
- Pre-existing Layout.test.tsx failures (3 tests) are due to Sidebar prop changes unrelated to image upload work
- Pre-existing TS errors in BugReports, DevelopmentCycle, FeatureBrowser, PipelineStepper tests due to missing optional fields from FR-050/FR-051 type additions
- Test file: `tests/ImageComponents.test.tsx` — 23 tests covering ImageUpload, ImageThumbnails, and API client

### Image Upload — Form & Detail Integration (FR-082 through FR-089, frontend-coder-2)
- Two-step upload pattern (DD-IMG-01): form creates entity first, then uploads images as second step
- `FeatureRequestForm.onSubmit` signature changed to `(input, imageFiles: File[])` — page handler does the two-step
- `FeatureRequestDetail` and `BugDetail` fetch images on mount via `useEffect` + `useCallback` for stable ref
- Detail views allow additional uploads and deletion from the detail view itself
- Orchestrator submit (FR-087): downloads image blobs from `/uploads/{filename}`, converts to File objects, sends via `orchestrator.submitWork(..., { images })`. Only shown for `approved` status FRs
- When testing components that call `images.list()` on mount, mock must return `{ data: [...] }` not just `[...]`
- `screen.getByAlt` does not exist — use `screen.getByAltText` (RTL naming)
- Test file: `tests/ImageUpload.test.tsx` — 27 tests covering form integration, detail views, orchestrator submit
