# Chaos Test Report — Status Sync and Traceability (v2)

**Date:** 2026-03-27
**Tester:** chaos-tester (TheFixer pipeline)
**Branch:** cycle/run-1774590558624-dd1975d8
**Task:** Fix bug: Statuses for bug reports and features don't match the run, and orchestrator statuses

RISK_LEVEL: medium

---

## Summary

The implementation adds status synchronization between bug/feature detail views and orchestrator runs via polling and title-matching. UX color consistency changes align with the design doc. The previous report's **CRITICAL duplicate polling bug has been resolved** — FeatureRequestDetail now has a single polling mechanism. Test failures for OrchestratorRuns.test.tsx have been fixed (all 58 pass). However, several issues remain: **fabricated traceability references (FR-UX-001)**, **no TraceabilityReport component** on detail views, **fragile title-matching** for run correlation, and **no `orchestrator_run_id` persistence** on work items.

**Zero new test failures introduced.**

---

## Findings

### HIGH — Fabricated Traceability Reference FR-UX-001

**Files:** BugDetail.tsx, FeatureRequestDetail.tsx, RunDetailRow.tsx, BugReportsPage.tsx (12 occurrences total)

All `// Verifies: FR-UX-001` comments reference a requirement that **does not exist** in `Specifications/dev-workflow-platform.md`. The spec contains FR-001 through FR-095, but no FR-UX-001.

Per project rules: "implementation traces to specs, never the other way around."

**Severity:** HIGH — violates traceability architecture rule

---

### HIGH — No Traceability Report Display on Bug/Feature Detail

**Files:** `Source/Frontend/src/components/bugs/BugDetail.tsx`, `Source/Frontend/src/components/feature-requests/FeatureRequestDetail.tsx`

The task explicitly states: "traceability reports should be attached to features and bugs when completed for visibility."

The `TraceabilityReport` component exists at `Source/Frontend/src/components/features/TraceabilityReport.tsx` and is used in `FeatureBrowser.tsx`, but it is **not imported or rendered** in either `BugDetail` or `FeatureRequestDetail`. The dispatch plan (Step 6 and Step 7 of frontend-fixer-1) called for adding this, but it was not implemented.

Additionally:
- No `traceability_report` column exists on `feature_requests` or `bugs` tables
- No `orchestrator_run_id` column exists on either table
- The `OrchestratorRun` type has no `traceabilityReport` field

**Severity:** HIGH — task requirement not fulfilled

---

### MEDIUM — Run Matching by Title Substring is Fragile

**Files:** BugDetail.tsx:55-60, FeatureRequestDetail.tsx:79-84

Run matching uses `r.task?.startsWith("Fix bug: " + bug.title)` and `r.task?.startsWith("Implement feature: " + fr.title)`. Issues:
- Two items with overlapping titles could match the wrong run
- If the submit format changes (e.g., the prefix text), matching silently breaks
- The dispatch plan recommended storing `orchestrator_run_id` on work items for reliable correlation — this was not implemented

The current approach works for the happy path but is not robust.

**Severity:** MEDIUM — could link wrong run to wrong work item in edge cases

---

### MEDIUM — No orchestrator_run_id Persistence

**Files:** All backend and shared type files

The dispatch plan (Steps 1-5 of backend-fixer-1) specified adding `orchestrator_run_id` and `traceability_report` columns to both `feature_requests` and `bugs` tables, plus updating shared types. None of this was implemented. The status sync relies entirely on client-side title matching, which:
- Doesn't survive page refreshes (linkedRun state is lost)
- Requires polling the full run list every time a detail view opens
- Can't reliably identify which run belongs to which work item

**Severity:** MEDIUM — backend portion of the fix was not implemented

---

### MEDIUM — Auto-Sync Behavior is Inconsistent Between Portals

**BugDetail.tsx (L64-69):** Auto-syncs bug to `resolved` when linked run completes, AND provides manual "Mark as Resolved" button.

**FeatureRequestDetail.tsx (L88-93):** Auto-syncs feature to `completed` when linked run completes, AND provides manual "Mark as Completed" button.

Both have auto-sync now (correcting the previous report). However, the auto-sync fires inside a polling interval that also has `onUpdate` in the dependency array. When `onUpdate` triggers a parent re-render and passes a new `onUpdate` reference, the useEffect re-fires, creating a potential re-render cascade. This could cause the sync API call to fire multiple times.

**Severity:** MEDIUM — potential for duplicate API calls on status transition

---

### LOW — Polling Continues When Detail Panel is Closed

**Files:** BugDetail.tsx:76-80, FeatureRequestDetail.tsx:99-104

When a user opens a bug/feature detail and the status is `in_development`, polling starts every 15s. The cleanup function clears the interval on unmount or dependency change. If the parent keeps the component mounted but hidden (e.g., display:none), polling continues in the background.

**Severity:** LOW — minor performance concern

---

### INFO — UX Color Changes Verified Correct

The color changes in RunsTab.tsx and RunDetailRow.tsx (purple->blue, yellow->amber/gray, indigo->blue) are fully consistent with the UX consistency polish design in `Plans/ux-consistency-polish/design.md`:
- `RISK_COLORS.medium`: `bg-gray-100 text-gray-500` (was yellow)
- `MERGE_COLORS.merged`: `bg-blue-100 text-blue-700` (was purple)
- `RUN_STATUS_COLORS.qa_running`: `bg-amber-100 text-amber-700` (was yellow)

OrchestratorRuns.test.tsx has been updated to expect these new colors — all 58 tests pass.

---

### INFO — BugDetail onUpdate Prop Fixed

`BugDetailProps` now correctly includes `onUpdate?: (updated: BugReport) => void` (optional). The `BugReportsPage` passes `onUpdate` to `BugDetail`. This resolves the TypeError that previously occurred on orchestrator submit.

---

### INFO — Batch Submit Status Update Working

`BugReportsPage.handleBatchSubmit` now correctly updates each bug's status to `in_development` after successful orchestrator submission (L91-94).

---

## Test Results

### Backend Tests
- **465 passed, 0 failed** — All backend tests pass

### Frontend Unit Tests
- **228 passed, 21 failed** (4 test files)
- **Pre-existing failures:** 21 (BugReports: 3, FeatureRequests: 2, ImageUpload: 12, Traceability: 4)
- **New failures:** 0
- **Note:** Pre-existing failures are all caused by missing `repos` mock in test files that import BugDetail/FeatureRequestDetail/BugForm

### Traceability Enforcer
- **PASS** — All 69 implemented FRs have test coverage

---

## Verification Gates

| Gate | Status | Notes |
|------|--------|-------|
| `python3 tools/traceability-enforcer.py` | PASS | 69/69 FRs covered |
| Backend tests (`npm test`) | PASS | 465/465 |
| Frontend tests (`npx vitest run`) | PASS | 0 new failures (21 pre-existing) |
| Zero new failures rule | PASS | No regressions introduced |

---

## E2E Tests

E2E tests written at `Source/E2E/tests/cycle-run-1774590558624-dd1975d8/`:
- `chaos-status-sync.spec.ts` — 20 tests covering cross-portal status consistency, color system validation, orchestrator run panel visibility, and action button state
- `status-sync.spec.ts` — Additional coverage of bug/feature status display and sync behavior

---

## Recommendations

1. **SHOULD FIX (before merge):** Replace all `FR-UX-001` traceability comments with actual spec references (e.g., FR-025 for bug status, FR-026 for bug actions, FR-091 for orchestrator run display) or remove them. There are 12 occurrences across 4 files.

2. **SHOULD FIX (future):** Add `TraceabilityReport` component rendering to BugDetail and FeatureRequestDetail when linked run has traceability data. This requires:
   - Adding `traceability_report` column to `feature_requests` and `bugs` tables
   - Adding `orchestrator_run_id` for reliable correlation
   - Importing and rendering `TraceabilityReport` component

3. **SHOULD FIX (future):** Store `orchestrator_run_id` on work items instead of relying on title-matching. This makes the system resilient to title changes and avoids false matches.

4. **CONSIDER:** Stabilize the `onUpdate` reference in useEffect dependency arrays (e.g., using `useCallback` in the parent or a ref) to prevent potential re-render cascades during auto-sync.

5. **CONSIDER:** Add cleanup of polling when detail panel becomes invisible (not just unmounted).
