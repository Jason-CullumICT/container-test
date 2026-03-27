# Integration Review: Status Sync and Traceability

**Task:** Fix bug: Statuses for bug reports and features don't match the run and orchestrator statuses
**Role:** integration
**Team:** TheFixer
**Date:** 2026-03-27
**RISK_LEVEL: medium**

---

## Scope of Review

Reviewed 5 modified frontend files against:
- `Plans/status-sync-and-traceability/dispatch-plan.md`
- `Plans/ux-consistency-polish/design.md`
- `Specifications/dev-workflow-platform.md`
- Existing shared types and API contracts

## Files Changed

| File | Change Summary |
|------|---------------|
| `BugDetail.tsx` | +127 lines: added `onUpdate` prop, linked run polling, orchestrator run display, status sync buttons (Mark as Resolved / Reset to Triaged) |
| `FeatureRequestDetail.tsx` | +153 lines: linked run polling, orchestrator run display, auto-sync on complete, status sync buttons (Mark as Completed / Reset to Approved) |
| `RunDetailRow.tsx` | +3 lines: `MERGE_COLORS.merged` purple -> blue |
| `RunsTab.tsx` | +41 lines: color system fixes, polling indicator, loading text, SVG empty state |
| `BugReportsPage.tsx` | +1 line: pass `onUpdate` prop to BugDetail |

## Verification Results

| Gate | Result |
|------|--------|
| Traceability Enforcer | PASS (69/69 FRs covered) |
| Unit Tests (vitest) | 4 files failed / 10 passed — **same as baseline** (zero new failures) |
| TypeScript type check | Pre-existing errors only — no new type errors introduced |

## Findings

### CRITICAL — None

### HIGH — Duplicate Polling Effects in FeatureRequestDetail.tsx

**Severity: HIGH**
**File:** `FeatureRequestDetail.tsx` lines 46-66 and 97-125
**Description:** Two separate `useEffect` hooks both:
1. Call `orchestrator.listRuns()` on a 15-second interval
2. Set `linkedRun` state
3. Share the same `runPollRef` timer reference

The first effect (lines 58-66) creates an interval and stores it in `runPollRef`. The second effect (lines 97-125) also creates an interval and stores it in `runPollRef`, **overwriting** the first. When the second effect cleans up, it clears its own interval but the first effect's interval is already lost — it was overwritten and never cleared, causing a **memory leak** and **redundant API calls**.

Additionally, the second effect auto-updates feature status to `completed` on every poll tick when the run is `complete`, potentially firing `featureRequests.update()` repeatedly even after the first successful update.

**Impact:** Memory leak (orphaned interval), doubled API calls (~2x load on orchestrator), potential repeated status update calls.
**Recommendation:** Consolidate into a single polling `useEffect` that handles both linked run display and auto-status-sync.

### MEDIUM — FR-UX-001 Not Defined in Specifications

**Files:** BugDetail.tsx, FeatureRequestDetail.tsx, RunDetailRow.tsx
**Description:** All new traceability comments reference `FR-UX-001` but this requirement ID does not exist in `Specifications/dev-workflow-platform.md`. Per CLAUDE.md: "Specs are source of truth — implementation traces to specs, never the other way around."
**Recommendation:** Add FR-UX-001 to specification before merging.

### MEDIUM — Fragile Run-to-WorkItem Matching via Title Substring

**Files:** BugDetail.tsx (line 55), FeatureRequestDetail.tsx (lines 51, 107)
**Description:** Runs are linked to work items via `r.task?.includes(bug.title)` / `r.task?.startsWith(taskPrefix)`. This approach:
1. Can produce false matches if another run's task contains the same substring
2. Breaks if the title changes after submission
3. Uses inconsistent strategies: `.includes()` for bugs vs `.startsWith()` for features

The dispatch plan explicitly calls for storing `orchestrator_run_id` on the work item for reliable correlation, but this was not implemented (requires backend schema change).
**Recommendation:** At minimum, use consistent matching. Ideally implement `orchestrator_run_id` as specified.

### MEDIUM — Batch Bug Submit Does Not Update Status

**File:** BugReportsPage.tsx lines 67-98
**Description:** `handleBatchSubmit` calls `orchestrator.submitWork()` for each bug group but never updates bug statuses to `in_development`. This is explicitly identified as Problem 2 in the dispatch plan but was NOT fixed.
**Impact:** Bugs submitted via batch remain in their original status, contradicting the feature's purpose.
**Recommendation:** Add `await bugs.update(bug.id, { status: "in_development" })` after each successful submit.

### LOW — Missing TraceabilityReport Component Integration

**Files:** BugDetail.tsx, FeatureRequestDetail.tsx
**Description:** Dispatch plan Steps 6 and 7 call for importing and rendering `<TraceabilityReport>` when work items have traceability data. Not implemented. Understandable since backend schema changes (`traceability_report` column) are also not in place.
**Recommendation:** Deferred work — implement when backend is ready.

### LOW — Auto-sync in FeatureRequestDetail Fires on Every Poll

**File:** FeatureRequestDetail.tsx lines 110-115
**Description:** The second `useEffect` calls `featureRequests.update(fr.id, { status: 'completed' })` every 15 seconds as long as the run is `complete` and the component is mounted with `in_development` status. After the first call succeeds and `onUpdate` fires, the component should re-render with `completed` status and the effect should stop — but there is a timing window where the update succeeds, `onUpdate` is called, but the parent hasn't yet re-rendered and re-passed the updated `fr` prop. This could cause 2-3 redundant API calls.
**Recommendation:** Add a guard flag (`syncedRef.current`) to prevent duplicate sync calls.

### LOW — Empty catch blocks suppress all errors

**Files:** BugDetail.tsx (lines 57, 299, 312), FeatureRequestDetail.tsx (lines 53, 115, 118, 354, 367)
**Description:** Multiple `catch { /* handled by parent */ }` or `catch { /* Non-blocking */ }` blocks silently swallow all errors, including potential auth failures or server errors. While non-blocking is appropriate for supplementary UI, production code should at minimum log errors for observability.
**Impact:** Debugging difficulty in production.
**Recommendation:** Add `console.warn` or structured logger call in catch blocks per CLAUDE.md observability rules.

### INFO — Color System Fixes Correct

RunsTab and RunDetailRow color changes align perfectly with `Plans/ux-consistency-polish/design.md`:
- `planning`: purple -> blue
- `qa_running`: yellow -> amber
- `validating`: indigo -> blue
- `MERGE_COLORS.merged`: purple -> blue
- `RISK_COLORS.medium`: yellow -> gray
- Team badge: indigo -> blue

### INFO — Loading/Empty State Standardized

RunsTab loading spinner standardized to `h-8 w-8`, contextual text "Loading runs..." added, emoji `📋` replaced with SVG icon. All match UX consistency requirements.

### INFO — BugDetail onUpdate Prop Fix Correct

`BugDetailProps` now includes optional `onUpdate`, call guarded with `onUpdate?.()`. BugReportsPage passes the prop correctly with `setSelectedBug(updated); refetch()`.

---

## Architecture Compliance

| Rule | Status | Notes |
|------|--------|-------|
| Specs are source of truth | FAIL | FR-UX-001 not in spec |
| No direct DB calls from handlers | PASS | Frontend-only, uses API client |
| Shared types single source | PASS | Uses existing `BugReport`, `FeatureRequest` types |
| Every FR needs test with traceability | PARTIAL | FR-UX-001 has E2E but no unit test |
| No hardcoded secrets | PASS | Session token input is user-provided |
| Observability | WARN | Empty catch blocks violate logging rules |
| Business logic no framework imports | PASS | |

## Test Results Summary

- **Vitest:** 21 failures / 231 passes — identical to master baseline (0 new failures)
- **TypeScript:** Pre-existing type errors only — no new errors from this branch
- **Traceability Enforcer:** PASS
- **E2E Tests:** 18 specs written covering all 3 pages + cross-cutting color/console checks

## Dispatch Plan Completion Status

| Step | Status | Notes |
|------|--------|-------|
| Backend schema (orchestrator_run_id, traceability_report) | NOT DONE | Requires backend-fixer |
| Shared types update | NOT DONE | |
| Sync endpoint (POST /api/orchestrator/sync-status) | NOT DONE | |
| BugDetail onUpdate prop fix | DONE | |
| BugDetail orchestrator submit stores run ID | PARTIAL | Status updated, no run ID stored |
| FeatureRequestDetail orchestrator submit stores run ID | PARTIAL | Status updated, no run ID stored |
| BugReportsPage batch submit status update | NOT DONE | |
| TraceabilityReport display | NOT DONE | |
| Linked run polling + status sync | DONE | With bugs noted above |
| Color system fixes in RunsTab/RunDetailRow | DONE | |
| Loading/empty state standardization | DONE | |

## Conclusion

The implementation addresses the core visible symptoms (status sync UI, color consistency, polling indicator) but **does not implement the full dispatch plan**. Backend changes were not made, so the frontend relies on a fragile title-matching heuristic instead of the planned `orchestrator_run_id` correlation. The duplicate polling effect in `FeatureRequestDetail.tsx` is the most urgent code quality issue.

**Recommendation:** Merge-safe with the following conditions:
1. **Must fix before merge:** Consolidate duplicate polling effects in FeatureRequestDetail.tsx
2. **Should fix before merge:** Batch submit status update in BugReportsPage.tsx
3. **Follow-up:** Backend schema changes, orchestrator_run_id, TraceabilityReport display, FR-UX-001 spec registration
