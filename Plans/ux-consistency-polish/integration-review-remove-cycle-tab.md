# Integration Review Report — Remove Cycle Tab

**Task:** Remove the Cycles tab from Orchestrator page, keep Runs only
**Reviewer:** integration
**Team:** TheFixer
**Date:** 2026-03-26

RISK_LEVEL: low

## Summary

The implementation correctly removes the Cycles tab from the Orchestrator page, replacing the tabbed view with a direct display of the RunsTab component. Three component files and one test file were deleted; the remaining files were updated to remove tab-related logic.

## Files Changed

| File | Change | Status |
|------|--------|--------|
| `OrchestratorCyclesPage.tsx` | Removed tab bar, cycles state, polling, error handling; renders RunsTab directly | OK |
| `RunsTab.tsx` | Removed `onSwitchToCycles` prop and cycle link button | OK |
| `CompletedCyclesSection.tsx` | Deleted | OK |
| `CycleCard.tsx` | Deleted | OK |
| `CycleLogStream.tsx` | Deleted | OK |
| `OrchestratorCycleCard.test.tsx` | Deleted (tested deleted component) | OK |
| `OrchestratorCycles.test.tsx` | Rewritten to test runs-only view | OK |
| `OrchestratorRuns.test.tsx` | Removed FR-095 cycle link tests and tab integration tests | OK |

## Findings

### MEDIUM — FR-070 Missing Test Coverage

**Description:** The traceability enforcer reports FR-070 is implemented in `OrchestratorCyclesPage.tsx` (via `// Verifies: FR-070` comments) but no test file has a matching `// Verifies: FR-070` comment. The `OrchestratorCycles.test.tsx` tests were rewritten with only FR-075 and FR-091 traceability comments.

**Impact:** Traceability gate fails.

**Recommendation:** Add `// Verifies: FR-070` to at least one test in `OrchestratorCycles.test.tsx` (e.g., the header render test).

### LOW — Deleted Components Still Referenced in Dispatch Plan

**Description:** The dispatch plan (`Plans/ux-consistency-polish/dispatch-plan.md`) references `CycleCard.tsx` and `CompletedCyclesSection.tsx` (items 6 and 7 in frontend-coder-1's file list) for color changes. These files are now deleted, so those tasks are no longer applicable.

**Impact:** Other coders in the UX polish pipeline may try to modify deleted files.

**Recommendation:** Flag to team leader that dispatch plan items 6 and 7 under frontend-coder-1 should be skipped.

### INFO — Pre-existing Test Failures

21 tests in 4 files (BugReports, FeatureRequests, ImageUpload, Traceability) were already failing before this change. These are NOT caused by the cycle tab removal. Confirmed by running the same tests against the stashed (pre-change) state.

### INFO — Clean Removal

- No dangling imports of deleted components (`CycleCard`, `CompletedCyclesSection`, `CycleLogStream`)
- No references to removed `onSwitchToCycles` prop
- No references to removed `tab-bar`, `tab-cycles`, `tab-runs` testids in source
- RunsTab component works standalone (63 tests pass)

## Security Review

No security concerns. This change only removes UI components and simplifies the page. No new API calls, no new user input handling, no auth changes.

## Architecture Compliance

- No direct DB calls from route handlers: N/A (frontend-only)
- Service layer usage: N/A (frontend-only)
- Shared types: `OrchestratorCycle` type in `types.ts` still exists but is no longer imported by page — acceptable, may be used by other consumers
- Observability: No new endpoints or logging concerns

## Test Results

| Suite | Result |
|-------|--------|
| OrchestratorCycles.test.tsx | 5/5 passed |
| OrchestratorRuns.test.tsx | 58/58 passed |
| All frontend tests | 231/252 passed (21 pre-existing failures) |
| Traceability enforcer | FAIL — FR-070 missing test (see finding above) |

## E2E Tests

Created: `Source/E2E/tests/cycle-run-1774503900770-14d8b0ab/remove-cycle-tab.spec.ts`

- Verifies orchestrator page renders without tab bar
- Verifies no Cycles/Runs tab buttons exist
- Verifies RunsTab content displays directly
- Verifies runs table or empty state appears
- Verifies subtitle text updated
- Checks for no console errors

## Verdict

**PASS with 1 medium finding.** The FR-070 traceability comment should be added to a test before merge. All other aspects are clean — the deletion is thorough, no dangling references, zero new test failures.
