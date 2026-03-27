# Status Sync and Traceability — Design Critic Report (Updated)

**Reviewer:** design-critic (TheFixer)
**Date:** 2026-03-27
**Task:** Fix bug: Statuses for bug reports and features don't match the run, and orchestrator statuses
**RISK_LEVEL: medium** (3-5 files changed, frontend + backend gap, no schema changes)

---

## Executive Summary

The implementation has been significantly improved since the initial review. The core status sync functionality between bug/feature detail views and orchestrator runs is now correctly implemented. Color system standardization is complete. However, one **MEDIUM** backend gap remains: traceability reports are not populated when features are created from completed cycles.

**Overall verdict: CONDITIONAL PASS — 1 MEDIUM, 2 LOW findings remain.**

---

## Resolved Findings (from previous review)

| # | Previous Severity | Finding | Status |
|---|-------------------|---------|--------|
| 1 | HIGH | Batch submit doesn't update bug status to in_development | **FIXED** — BugReportsPage.tsx lines 90-95 now call `bugs.update(b.id, { status: 'in_development' })` after each batch submit |
| 2 | HIGH | No auto-sync (unlike FeatureRequestDetail which auto-completes) | **FIXED** — BugDetail.tsx lines 63-68 now auto-sync bug to `resolved` when linked run completes |
| 3 | MEDIUM | Linked run matching uses loose `includes()` instead of strict `startsWith()` | **FIXED** — BugDetail.tsx line 55 now uses `startsWith(taskPrefix)` with `taskPrefix = "Fix bug: ${bug.title}"` |
| 5 | LOW | Duplicate fetchLinkedRun polling logic (2x API calls) | **FIXED** — FeatureRequestDetail.tsx has a single polling effect (lines 73-105) |

---

## Remaining Findings

### FINDING 1 — MEDIUM: Traceability reports not populated when features created on cycle completion

**File:** `Source/Backend/src/services/cycleService.ts` lines 487-493

**Current behavior:** When `completeCycle()` creates a Feature record via `createFeature()`, it does not pass a `traceability_report` field:
```ts
createFeature(db, {
  title: workItemTitle,
  description: `Completed work item: ${cycle.work_item_id} (${cycle.work_item_type})`,
  source_work_item_id: cycle.work_item_id,
  cycle_id: cycleId,
  // <-- traceability_report is missing
});
```

**Infrastructure exists:**
- `Feature.traceability_report` field in Shared/types.ts (line 102)
- `CreateFeatureInput.traceability_report` in Shared/api.ts (line 112)
- Database column exists (schema.ts line 185-186)
- `FeatureBrowser.tsx` already renders `TraceabilityReport` when the field is populated (lines 117-119)
- `TraceabilityReport.tsx` component handles both JSON array and raw text formats

**Task requirement:** "traceability reports should be attached to features and bugs when completed for visibility."

**Fix (Backend):** In `completeCycle()`, aggregate cycle data (tickets, their statuses, associated test results) into a JSON traceability report string and pass it to `createFeature()`:
```ts
const traceabilityEntries = cycle.tickets.map(t => ({
  id: t.id,
  description: t.title,
  status: t.status === 'done' ? 'covered' : 'partial',
  coverage: t.status === 'done' ? '100%' : '0%'
}));
createFeature(db, {
  title: workItemTitle,
  description: `Completed work item: ${cycle.work_item_id}`,
  source_work_item_id: cycle.work_item_id,
  cycle_id: cycleId,
  traceability_report: JSON.stringify(traceabilityEntries),
});
```

**Owner:** backend-coder

---

### FINDING 2 — LOW: RunsTab status colors deviate from original design spec

**File:** `Source/Frontend/src/components/orchestrator/RunsTab.tsx` lines 12-19

**Original design spec** (`Plans/runs-dashboard/design.md`):
```
planning: 'bg-purple-100 text-purple-700'
qa_running: 'bg-yellow-100 text-yellow-700'
validating: 'bg-indigo-100 text-indigo-700'
```

**Implementation** (updated by UX polish pass):
```
planning: 'bg-blue-100 text-blue-700'
qa_running: 'bg-amber-100 text-amber-700'
validating: 'bg-blue-100 text-blue-700'
```

**Assessment:** The implementation correctly follows the updated UX consistency color system from `Plans/ux-consistency-polish/design.md`. The runs-dashboard design doc is stale. **No code change needed — docs update only.**

---

### FINDING 3 — LOW: Manual "Mark as Resolved"/"Reset to Triaged" buttons remain alongside auto-sync

**Files:** `BugDetail.tsx` lines 304-329, `FeatureRequestDetail.tsx` lines 328-353

**Observation:** Both components now auto-sync statuses (bugs -> resolved, features -> completed) when the linked run completes. However, manual action buttons ("Mark as Resolved", "Mark as Completed", "Reset to Triaged/Approved") still render.

**Assessment:** This is **acceptable** and actually good UX — the manual buttons serve as fallbacks if:
- Auto-sync fires but the API call fails silently
- The user wants to override the status for a different reason
- The linked run match is incorrect

**No change needed.** Keeping both auto-sync and manual buttons is the correct approach.

---

## Status Sync Matrix: Current vs Expected

| Event | Bug (Current) | Bug (Expected) | Feature (Current) | Feature (Expected) |
|-------|---------------|----------------|-------------------|-------------------|
| Individual submit to orchestrator | -> in_development ✅ | -> in_development | -> in_development ✅ | -> in_development |
| Batch submit to orchestrator | -> in_development ✅ | -> in_development | N/A | N/A |
| Run completes | Auto -> resolved ✅ | Auto -> resolved | Auto -> completed ✅ | Auto -> completed |
| Run fails | Manual button ✅ | Manual button (OK) | Manual button ✅ | Reset to approved (OK) |
| Traceability report attached | **Never** ❌ | Auto-attach on complete | **Never** ❌ | Auto-attach on complete |

---

## Color System Audit

All status badges have been verified against the UX consistency design spec:

| Component | Status | Color | Correct? |
|-----------|--------|-------|----------|
| BugDetail STATUS_COLORS.in_development | amber-100/amber-700 | ✅ |
| BugDetail SEVERITY_COLORS.medium | gray-100/gray-500 | ✅ |
| BugDetail SEVERITY_COLORS.high | amber-100/amber-700 | ✅ |
| FeatureRequestDetail STATUS_COLORS.completed | green-100/green-700 | ✅ |
| FeatureRequestDetail STATUS_COLORS.in_development | amber-100/amber-700 | ✅ |
| RunsTab RUN_STATUS_COLORS.complete | green-100/green-700 | ✅ |
| RunsTab RUN_STATUS_COLORS.failed | red-100/red-700 | ✅ |
| RunsTab RUN_STATUS_COLORS.implementing | blue-100/blue-700 | ✅ |
| RunsTab RISK_COLORS.medium | gray-100/gray-500 | ✅ |
| RunDetailRow MERGE_COLORS.merged | blue-100/blue-700 | ✅ |
| RunDetailRow VERDICT_COLORS.approved | green-100/green-700 | ✅ |

**Submit to Orchestrator button:** Both BugDetail (line 373) and FeatureRequestDetail (line 472) correctly use `bg-blue-600` (was purple). ✅

---

## Action Consistency Audit

| Feature/Bug Status | Available Actions | Correct? |
|-------------------|-------------------|----------|
| Bug: reported | Submit to Orchestrator, batch submit | ✅ |
| Bug: triaged | Submit to Orchestrator, batch submit | ✅ |
| Bug: in_development | View linked run, Mark as Resolved (if run complete), Reset to Triaged (if run failed) | ✅ |
| Bug: resolved | View linked run (informational) | ✅ |
| Feature: potential | Trigger AI Voting, Deny | ✅ |
| Feature: voting | Approve, Deny | ✅ |
| Feature: approved | Submit to Orchestrator | ✅ |
| Feature: in_development | View linked run, Mark as Completed (if run complete), Reset to Approved (if run failed) | ✅ |
| Feature: completed | View linked run (informational) | ✅ |

---

## Verification Gates

| Gate | Result |
|------|--------|
| Traceability enforcer | PASS — All 69 implemented FRs have test coverage |
| Frontend unit tests | PASS — 58/58 orchestrator run tests pass |
| Color system consistency | PASS — All badges use amber/blue/green/red/gray palette |
| Architecture rules | PASS — Service layer properly used, no direct DB calls from routes |
| Security | PASS — No hardcoded secrets, proper error handling |

---

## E2E Test Coverage

Existing E2E tests at `Source/E2E/tests/cycle-run-1774590558624-dd1975d8/status-sync-traceability.spec.ts` adequately cover:
- Page rendering (bug reports, feature requests, orchestrator runs)
- Bug/feature detail open/close
- Orchestrator run section visibility for in_development items
- Color system consistency (no purple/yellow in badges)
- Console error checks on all pages
- Runs tab loading/empty/polling states
- Run detail row expansion and badge colors

Additional E2E test file added: `design-critic-review.spec.ts` for cross-cutting design consistency verification.

---

## Findings Summary

| # | Severity | Area | Finding | Owner | Status |
|---|----------|------|---------|-------|--------|
| 1 | **MEDIUM** | cycleService.ts | Traceability reports not populated when features created on cycle completion | backend-coder | OPEN |
| 2 | **LOW** | runs-dashboard/design.md | Design spec stale (colors correct per updated UX system) | docs only | OPEN |
| 3 | **LOW** | BugDetail/FeatureRequestDetail | Manual buttons remain alongside auto-sync | N/A | ACCEPTED (by design) |

---

## Recommendations

1. **Priority 1 (MEDIUM):** Backend-coder should populate `traceability_report` field in `completeCycle()` when creating Feature records. The full infrastructure exists — only the wiring in cycleService.ts line 488 is missing.
2. **Priority 2 (LOW):** Update `Plans/runs-dashboard/design.md` color spec to match the implemented UX consistency system.

**Conclusion:** The status sync implementation is now functionally correct for the frontend. Bug/feature statuses properly transition on orchestrator submit (individual and batch), auto-sync to resolved/completed when linked runs complete, and provide manual fallback actions for failed runs. The remaining gap is backend-only: traceability report attachment on cycle completion. After that fix, the reported bug will be fully resolved.
