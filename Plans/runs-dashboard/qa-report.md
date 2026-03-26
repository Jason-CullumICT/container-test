# Runs Dashboard & Retry Workflow — QA Report

**Date:** 2026-03-26
**QA Agent:** qa (TheATeam)
**Branch:** cycle/run-1774486940077-6519f274

RISK_LEVEL: medium

## Verification Gates

| Gate | Result | Notes |
|------|--------|-------|
| `npx vitest run` | **PASS** | 15 test files, 300 tests, 0 failures |
| `npx tsc --noEmit` | **PASS (no new errors)** | Pre-existing TS errors in BugReports, DevelopmentCycle, FeatureBrowser, PipelineStepper tests — none related to this feature |
| `python3 tools/traceability-enforcer.py` | **PASS** | FR-090 through FR-095 all have implementation and test coverage |
| E2E tests present | **PASS** | `Source/E2E/tests/cycle-run-1774486940077-6519f274/runs-dashboard.spec.ts` — 5 test cases |

## Files Changed/Created

| File | Action | Status |
|------|--------|--------|
| `Source/Frontend/src/api/client.ts` | Modified — added `retryRun()`, `cleanupRun()` | PASS |
| `Source/Frontend/src/components/orchestrator/types.ts` | Modified — added run types | PASS — matches contracts.md |
| `Source/Frontend/src/pages/OrchestratorCyclesPage.tsx` | Modified — added tab bar + RunsTab | PASS |
| `Source/Frontend/src/components/orchestrator/RunsTab.tsx` | Created | PASS — all FRs implemented |
| `Source/Frontend/src/components/orchestrator/RunDetailRow.tsx` | Created | PASS — all sections present |
| `Source/Frontend/tests/OrchestratorRuns.test.tsx` | Created | PASS — 55+ tests |
| `Source/E2E/tests/cycle-run-*/runs-dashboard.spec.ts` | Created | PASS — 5 E2E tests |

## FR Verification

### FR-090: API Client Extensions — PASS
- `retryRun(id, opts?)` calls `POST /api/orchestrator/api/runs/{id}/retry` with `encodeURIComponent(id)`
- `cleanupRun(id)` calls `POST /api/orchestrator/api/cycles/{id}/cleanup` with `encodeURIComponent(id)`
- `retryRun` sends optional body as JSON when opts provided, undefined when not
- Types added: `OrchestratorRunStatus`, `RunPhaseResult`, `RunTestResults`, `RunPRInfo`, `OrchestratorRun` — all match contracts.md exactly
- Traceability: `// Verifies: FR-090` present on all new types and API methods

### FR-091: Runs History Tab — PASS
- Tab bar renders with Cycles/Runs buttons, active tab has blue border + color differentiation
- Polling at 10s interval with proper cleanup on unmount
- Only polls when Runs tab is active (cycles polling stops when not on Cycles tab)
- Table columns: ID (last 8 chars + tooltip), Status badge, Team badge, Risk badge, Task (80 char truncation), Time-ago, Feedback loops — all match design.md
- Empty state, loading spinner, and error banner all present
- Color maps (`RUN_STATUS_COLORS`, `RISK_COLORS`) match design.md exactly

### FR-092: Run Detail Expandable Row — PASS
- Click to expand, click again to collapse
- Full task description (no truncation, `whitespace-pre-wrap`)
- Phase results grid: 5 phases (leader, implementation, qa, smoketest, inspector) with ✓/✗/— icons and green/red/gray colors
- E2E test results: total/passed/failed with color coding, conditionally rendered
- PR info: number as external link (`target="_blank"`, `rel="noopener noreferrer"`), verdict badge, merge status badge
- RetryOf link: truncated ID (last 8 chars), calls `onNavigateToRun`
- Error message display for failed runs

### FR-093: Retry Button — PASS
- Retry button appears only on `status === 'failed'`
- Disabled while in-flight (`retryingId === run.id`), shows "Retrying…"
- Success: green notification banner with new run ID, auto-dismiss 5s
- Error: red notification banner
- Auto-expands new run row, re-fetches runs list after retry

### FR-094: Cleanup Button — PASS
- Cleanup button on `complete` and `failed` runs only
- Optimistic removal via `setRuns(prev => prev.filter(...))`
- On API error: re-fetches list + shows error notification (per DD-06)

### FR-095: Real-Time Status Indicators — PASS
- Pulsing dot for active statuses: `planning`, `implementing`, `qa_running`, `validating`
- CSS: `animate-pulse bg-blue-500 w-2 h-2 rounded-full` — matches design.md spec
- Cycle link: shown when `run.cycleId && isActive(run.status) && onSwitchToCycles`
- `onSwitchToCycles` wired in parent page via `handleSwitchToCycles` callback

## Test Coverage

### Unit Tests (OrchestratorRuns.test.tsx) — 55+ tests
- **FR-090**: 5 tests (method existence, endpoint calls, optional params)
- **FR-091**: 14 tests (loading, table, columns, badges, truncation, polling, cleanup, error, time-ago)
- **FR-092**: 17 tests (expand/collapse, task, phases, icons, tests, PR, verdict, merge, retryOf, error, absent sections)
- **FR-093**: 6 tests (visibility, disabled state, success/error notifications, re-enable, correct ID)
- **FR-094**: 5 tests (visibility on correct statuses, optimistic removal, API call, error recovery)
- **FR-095**: 6 tests (pulsing indicator, classes, cycle link visibility, click handler, absent cycleId)
- **Integration**: 3 tests (module exports)

### E2E Tests (runs-dashboard.spec.ts) — 5 tests
- Page render with tab bar
- Tab switching to Runs content
- Run row columns verification (gracefully handles empty state)
- Expandable row click/collapse
- Console error check (filters expected network errors)

## Findings

### CRITICAL — None

### HIGH — None

### MEDIUM

**M-1: PR link URL not protocol-validated** (defense-in-depth)
- **File:** `RunDetailRow.tsx:98` — `href={run.pr.url}`
- **Issue:** PR URL from orchestrator API rendered directly as `<a href>`. If orchestrator returned `javascript:` URL, it could be XSS. Mitigated by `rel="noopener noreferrer"` and `target="_blank"`, but `javascript:` protocol is not blocked.
- **Impact:** Low — data comes from trusted internal orchestrator service, not user input
- **Recommendation:** Optional defense-in-depth: validate URL starts with `https://` before rendering

**M-2: Unused import in test file**
- **File:** `OrchestratorRuns.test.tsx:12` — `import { MemoryRouter } from 'react-router-dom'`
- **Issue:** `MemoryRouter` imported but never used in any test
- **Impact:** No runtime impact; minor code cleanliness
- **Recommendation:** Remove unused import

### LOW

**L-1: String concatenation vs template literal inconsistency**
- **File:** `client.ts:373` — `retryRun` uses string concatenation while `cleanupRun` (line 381) uses template literal
- **Impact:** Cosmetic only — both functionally correct
- **Recommendation:** Standardize on template literal

**L-2: Table uses div grid instead of semantic table elements**
- **File:** `RunsTab.tsx:163-174`
- **Impact:** Screen readers may not interpret table structure. Consistent with existing codebase pattern (CycleCard, CompletedCyclesSection also use divs).
- **Recommendation:** Consider ARIA table roles in future accessibility pass

### INFO

**I-1:** `listRuns()` returns `Promise<{ data: any[] }>` — cast at call site per contracts.md design decision. Correct.

**I-2:** E2E tests gracefully handle missing orchestrator API — checks for table or empty state. Good practice.

**I-3:** All new components follow existing codebase patterns:
- Status badge pattern (CycleCard)
- Polling pattern (OrchestratorCyclesPage)
- Button loading/disabled pattern (CycleCard)
- Error banner pattern (bg-red-50 border-red-200 text-red-700)
- Expandable section pattern (CompletedCyclesSection)
- Test mock pattern (OrchestratorCycles.test.tsx)

## Security Review

| Check | Result |
|-------|--------|
| XSS via task/error rendering | PASS — React auto-escapes, no `dangerouslySetInnerHTML` |
| URL injection via PR link | PASS (see M-1 for defense-in-depth note) |
| API input encoding | PASS — `encodeURIComponent(id)` on URL params |
| No secrets or credentials | PASS |
| No `console.log` | PASS — all error handling is structured |

## Architecture Compliance

| Rule | Status |
|------|--------|
| No backend changes | PASS — frontend-only |
| Types in local types.ts (not shared) | PASS |
| `{data: T[]}` list wrapper | PASS |
| Traceability comments on all FRs | PASS — FR-090 through FR-095 all traced |
| Existing component patterns followed | PASS |

## Verdict

**PASS** — All 6 functional requirements (FR-090 through FR-095) correctly implemented per specifications, contracts, and design. All verification gates pass with zero new failures. Test coverage is comprehensive (55+ unit tests, 5 E2E tests, full traceability). Two MEDIUM findings (unused import, optional URL defense-in-depth) — neither blocking.

**Recommendation: Approve for merge.**
