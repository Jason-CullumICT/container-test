# Runs Dashboard & Retry Workflow — Design Review Report

**Reviewer:** design (design-critic)
**Date:** 2026-03-26
**Feature:** Runs Dashboard (FR-090 through FR-095)
**Branch:** cycle/run-1774486940077-6519f274

RISK_LEVEL: medium

## Verification Gate Results

| Gate | Status | Notes |
|------|--------|-------|
| Unit Tests (`vitest run`) | PASS | 300/300 tests pass, 0 new failures |
| TypeScript (`tsc --noEmit`) | PASS (pre-existing only) | All TS errors are pre-existing in other test files (BugReports, DevelopmentCycle, FeatureBrowser, PipelineStepper). No new type errors from runs-dashboard code. |
| Traceability Enforcer | PASS | All 71 implemented FRs have test coverage; FR-090 through FR-095 all traced |
| E2E Tests | PRESENT | `Source/E2E/tests/cycle-run-1774486940077-6519f274/runs-dashboard.spec.ts` covers FR-091-095 |

## Implementation vs. Specification Compliance

### FR-090: API Client Extensions — PASS
- `retryRun(id, opts?)` correctly calls `POST /api/orchestrator/api/runs/{id}/retry` with `encodeURIComponent`
- `cleanupRun(id)` correctly calls `POST /api/orchestrator/api/cycles/{id}/cleanup` per contracts.md
- Types in `types.ts` match contracts.md exactly: `OrchestratorRunStatus`, `RunPhaseResult`, `RunTestResults`, `RunPRInfo`, `OrchestratorRun`
- All types have `// Verifies: FR-090` traceability comments

### FR-091: Runs History Tab — PASS
- Tab bar with Cycles/Runs on `OrchestratorCyclesPage.tsx` using `useState<TabId>`
- `RunsTab` polls `orchestrator.listRuns()` every 10s (matches DD-04)
- Polling only runs when Runs tab is active (cycles page controls this via conditional render)
- Table columns match design spec: ID (last 8, tooltip), status badge, team badge, risk badge, task (80 char truncation with ellipsis), time-ago, feedback loops, actions
- Status color map matches `design.md` exactly
- Risk color map matches `design.md` exactly
- Empty state, loading spinner, and error banner all present

### FR-092: Run Detail Expandable Row — PASS
- `RunDetailRow` renders nothing when `expanded=false`
- Shows full task description, phase results grid (5 phases), E2E test results, PR info, retryOf link
- Phase icons: green check (passed), red X (failed), gray dash (skipped) — matches spec
- PR info shows link, AI review verdict badge, merge status badge with correct color maps
- RetryOf link shows truncated ID, calls `onNavigateToRun` on click
- Error message section when `run.error` present
- Conditional rendering for all optional sections (no empty placeholders)

### FR-093: Retry Button — PASS
- Retry button appears only on `failed` runs
- Disables while in-flight with "Retrying..." text
- Shows green notification banner on success with new run ID
- Auto-expands new run via `setExpandedRunId(result.id)`
- Notification auto-dismisses after 5 seconds (matches DD-05)
- Shows red error notification on failure

### FR-094: Cleanup Button — PASS
- Cleanup button appears on `complete` and `failed` runs
- Optimistic removal from local state (matches DD-06)
- Re-fetches on API error to restore accurate state
- Shows error notification on failure

### FR-095: Real-Time Status Indicators — PASS
- Pulsing dot (`animate-pulse bg-blue-500`) for active statuses: planning, implementing, qa_running, validating
- Matches design.md HTML spec exactly
- Cycle link button shown when `run.cycleId` exists and run is active
- `onSwitchToCycles` prop correctly wired from page-level `setActiveTab('cycles')`

## Architecture Compliance

| Rule | Status | Notes |
|------|--------|-------|
| No direct DB calls from handlers | N/A | Frontend-only changes |
| Shared types single source | PASS | Uses local types in `orchestrator/types.ts` (external service data, per DD-03) |
| FR has test with traceability | PASS | All FR-090-095 have `// Verifies: FR-0XX` comments in tests and source |
| No hardcoded secrets | PASS | No credentials in code |
| List endpoints use `{data: T[]}` | PASS | `listRuns()` returns `{ data: OrchestratorRun[] }` |
| No framework imports in business logic | PASS | `formatTimeAgo` is pure; color maps are plain objects |
| Observability (no console.log) | PASS | No console.log statements found |

## UI/UX Assessment

### Strengths
- **Consistent patterns**: Tab bar, badges, loading states, error banners all follow existing orchestrator page patterns
- **Good data density**: Table layout shows all important info at a glance without clutter
- **Progressive disclosure**: Expandable rows keep the table scannable while providing deep detail on demand
- **Optimistic UI**: Cleanup feels instant; errors restore state gracefully
- **Accessibility**: `data-testid` attributes throughout; button states clearly indicated; tooltips on truncated text

### Issues Found

| ID | Severity | Description |
|----|----------|-------------|
| D-001 | LOW | `formatTimeAgo` doesn't handle future dates gracefully beyond "just now" — acceptable for this use case since server timestamps should always be in the past |
| D-002 | LOW | Phase results grid uses `grid-cols-5` which is fixed at 5 phases. If the orchestrator adds a new phase in the future, it won't display. The `PHASE_NAMES` constant handles this — new phases would need a code change. Acceptable given this is an external service schema. |
| D-003 | INFO | The `cleanupRun` method name references "run" but calls the `/cycles/{id}/cleanup` endpoint. This matches the contracts.md spec and reflects the backend API design (cleanup is a cycle-level operation). No action needed — just noting for awareness. |
| D-004 | INFO | Pre-existing TypeScript errors in 5 other test files (BugReports, DevelopmentCycle, FeatureBrowser, PipelineStepper) due to missing properties on mock objects. Not caused by this feature. |

## Test Coverage Assessment

| Category | Count | Quality |
|----------|-------|---------|
| Unit tests (OrchestratorRuns.test.tsx) | 51 tests | Comprehensive: covers all FRs, edge cases, error paths, polling lifecycle |
| E2E tests (runs-dashboard.spec.ts) | 5 tests | Good: covers tab navigation, row expansion, console error check. Gracefully handles empty state (API may not be running). |

## Conclusion

**PASS** — Implementation is complete, well-structured, and fully compliant with the design specification, API contracts, and architecture rules. No critical or high-severity issues found. All verification gates pass with zero new test failures. The feature is ready for merge review.
