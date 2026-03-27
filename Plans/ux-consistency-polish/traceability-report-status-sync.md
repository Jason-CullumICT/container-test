# Traceability Report: Status Sync and Traceability (UX Consistency Polish)

**Date:** 2026-03-27 (v2 — re-verified)
**Branch:** `cycle/run-1774590558624-dd1975d8`
**Reviewer:** traceability_report agent (TheFixer)
**RISK_LEVEL: medium**

---

## 1. Summary

This branch addresses status synchronization between orchestrator runs and feature request/bug report portals. It adds linked-run display panels to `BugDetail` and `FeatureRequestDetail`, action buttons for status transitions when runs complete or fail, auto-sync polling, batch submit status updates, and applies UX consistency polish (color system, empty states, loading text, polling indicator) to `RunsTab` and `RunDetailRow`.

### Files Changed (7)
| File | Purpose |
|------|---------|
| `Source/Frontend/src/components/bugs/BugDetail.tsx` | Linked run display, status sync buttons, auto-sync on run complete, onUpdate prop |
| `Source/Frontend/src/components/feature-requests/FeatureRequestDetail.tsx` | Linked run display, status sync buttons, auto-sync on run complete |
| `Source/Frontend/src/components/features/TraceabilityReport.tsx` | TraceabilityReport component (unchanged but consumed) |
| `Source/Frontend/src/components/orchestrator/RunDetailRow.tsx` | Color system: merged badge purple→blue |
| `Source/Frontend/src/components/orchestrator/RunsTab.tsx` | Color system, empty state SVG, loading text, polling indicator |
| `Source/Frontend/src/pages/BugReportsPage.tsx` | Pass onUpdate prop, batch submit status update to in_development |
| `Source/Frontend/tests/OrchestratorRuns.test.tsx` | Test assertions updated for new color system |

---

## 2. Requirement Traceability Matrix

### Dispatch Plan Coverage

| Dispatch Plan Requirement | Implemented? | Notes |
|--------------------------|-------------|-------|
| **Problem 1: Status Disconnect** — no status sync between orchestrator runs and features/bugs | DONE (frontend) | Frontend polling approach: detail views poll `listRuns()` every 15s, match by task title prefix, display linked run with status/phases/PR info. Auto-sync updates status when run completes. No backend `orchestrator_run_id` column created. |
| **Problem 2: Batch Submit Missing Status Update** | DONE | `BugReportsPage.handleBatchSubmit` (line 91-94) now updates each bug to `in_development` after submit |
| **Problem 3: BugDetail.onUpdate Not in Props** | DONE | `onUpdate?` added as optional prop, BugReportsPage passes it (line 172) |
| **Problem 4: Missing Traceability Reports** | NOT DONE | No `traceability_report` column added; `<TraceabilityReport>` component exists but not rendered in detail views |
| **Problem 5: Action Buttons Don't Reflect Run State** | DONE | "Mark as Resolved"/"Reset to Triaged" (bugs) and "Mark as Completed"/"Reset to Approved" (features) buttons shown based on linked run status |

### FR Traceability

| FR ID | Description | Verified? | Files |
|-------|-------------|-----------|-------|
| FR-026 | Bug reports management | YES | BugDetail.tsx, BugReportsPage.tsx |
| FR-068 | BugDetail traceability | YES | BugDetail.tsx |
| FR-085 | BugDetail image attachments | YES (unchanged) | BugDetail.tsx |
| FR-025 | Feature requests management | YES | FeatureRequestDetail.tsx |
| FR-084 | FeatureRequestDetail images | YES (unchanged) | FeatureRequestDetail.tsx |
| FR-087 | Submit with repo selection | PARTIAL | FeatureRequestDetail.tsx — `repo` param NOT passed to `submitWork()` (see H1) |
| FR-090 | Orchestrator run types | YES | types.ts (unchanged, consumed) |
| FR-091 | Runs dashboard | YES | RunsTab.tsx |
| FR-092 | Run detail row | YES | RunDetailRow.tsx |
| FR-093 | Retry handler | YES | RunsTab.tsx |
| FR-094 | Cleanup handler | YES | RunsTab.tsx |
| FR-095 | Real-time indicators | YES | RunsTab.tsx |
| FR-UX-001 | Status sync (new) | YES (functional) | Not in spec — custom FR used in traceability comments |

---

## 3. Findings

### CRITICAL

None.

Previous v1 finding C1 (duplicate `fetchLinkedRun` effect) is **resolved** — both `BugDetail.tsx` and `FeatureRequestDetail.tsx` now have a single, clean linked-run polling `useEffect`.

---

### HIGH

**H1: FeatureRequestDetail `submitWork()` missing `repo` parameter**

`FeatureRequestDetail.tsx` line 101-103:
```ts
await orchestrator.submitWork(
  `Implement feature: ${fr.title}\n\n${fr.description}`,
  { images: ..., claudeSessionToken: ..., tokenLabel: ... }
)
```

The `repo: selectedRepo` parameter is missing, while `BugDetail.tsx` correctly passes it (line 146). The `selectedRepo` state and repo dropdown UI are present in `FeatureRequestDetail`, but the value is never sent to the API.

**Severity: HIGH** — feature request submissions to orchestrator will use the default repo instead of user's selection.

**H2: Run linkage via title prefix match is fragile**

Both `BugDetail` and `FeatureRequestDetail` find the linked run by:
```ts
const match = runs.find((r) => r.task?.startsWith(taskPrefix))
```

Where `taskPrefix` is `"Fix bug: " + bug.title` or `"Implement feature: " + fr.title`.

This approach:
- Fails if two features/bugs have similar titles (matches first found).
- Fetches ALL runs every 15 seconds just to find one match — O(n) scan.
- Does not use a stored `orchestrator_run_id` (backend column not created).
- The `startsWith` approach is more reliable than the earlier `includes` approach noted in v1, but still fundamentally fragile.

**Severity: HIGH** — functional correctness risk; could display wrong run.

---

### MEDIUM

**M1: `FR-UX-001` is not a real specification requirement**

The code uses `// Verifies: FR-UX-001` traceability comments in 4 files, but `FR-UX-001` does not exist in `Specifications/dev-workflow-platform.md`. The traceability enforcer does not validate that FR IDs exist in the specification, only that referenced FRs have test coverage.

**Severity: MEDIUM** — traceability gap; traces to non-existent requirement.

**M2: No backend changes for `orchestrator_run_id` or `traceability_report` columns**

The dispatch plan calls for:
- `orchestrator_run_id` column on `feature_requests` and `bugs` tables
- `traceability_report` column on both tables
- `POST /api/orchestrator/sync-status` endpoint
- Updated shared types

None of these backend changes were made. The frontend implementation works around this by polling all runs and matching by title prefix (see H2).

**Severity: MEDIUM** — incomplete implementation per dispatch plan.

**M3: Silent error handling in status sync buttons**

Both `BugDetail` and `FeatureRequestDetail` inline async `onClick` handlers catch errors silently:
```ts
} catch { /* handled by parent */ }
```
There is no parent error handler. If the API call fails, the user gets no feedback.

Affected buttons:
- "Mark as Resolved" / "Reset to Triaged" in BugDetail (lines 307, 320)
- "Mark as Completed" / "Reset to Approved" in FeatureRequestDetail (lines 332, 345)
- Auto-sync `bugs.update()` and `featureRequests.update()` inside polling effects (lines 66, 90)

**Severity: MEDIUM** — poor error UX on status transition failure.

---

### LOW

**L1: `onUpdate` callback stability in polling dependency arrays**

Both `BugDetail.tsx` (line 81) and `FeatureRequestDetail.tsx` (line 105) include `onUpdate` in their `useEffect` dependency arrays. If `onUpdate` is not memoized by the parent, this causes the effect to re-run on every render, creating and destroying polling intervals rapidly.

- `BugReportsPage` passes `(updated) => { setSelectedBug(updated); refetch() }` (line 172) — **not memoized**, will re-create on every render.
- This should use `useCallback` in the parent to prevent excessive re-renders and polling restarts.

**Severity: LOW** — potential performance issue.

**L2: `TraceabilityReport` component exists but is unused in detail views**

The dispatch plan mentions attaching traceability reports to features/bugs when completed. The `TraceabilityReport` component exists at `components/features/TraceabilityReport.tsx` and renders structured report data, but it is not imported or rendered in `BugDetail` or `FeatureRequestDetail` detail panels.

**Severity: LOW** — feature gap vs dispatch plan, but non-blocking.

---

### INFO

**I1: Color system changes in RunsTab and RunDetailRow are correct per UX design**

| Change | Design Doc Reference |
|--------|---------------------|
| `planning`: yellow→blue | Target Color System: Primary = blue-600 |
| `implementing`: purple→blue | Target Color System: Primary = blue-600 |
| `qa_running`: yellow→amber | Target Color System: Warning = amber-500 |
| `validating`: indigo→blue | Target Color System: Primary = blue-600 |
| `medium` risk: yellow→gray | Target Color System: Neutral = gray-500 |
| `merged` PR: purple→blue | Target Color System: Primary = blue-600 |
| Team badge: indigo→blue | Target Color System: Primary = blue-600 |

All color changes align with `Plans/ux-consistency-polish/design.md`.

**I2: Empty state and loading state improvements in RunsTab are correct**
- Loading spinner standardized to `h-8 w-8` with "Loading runs..." text
- Empty state uses SVG clipboard icon (no emoji)
- Polling indicator ("Last updated: Xs ago") added

**I3: BugDetail and FeatureRequestDetail status color maps updated correctly**
- `in_development`: yellow→amber per design
- `completed`/`resolved`: purple→green per design
- `SEVERITY_COLORS.medium`: yellow→gray per design
- `SEVERITY_COLORS.high`: orange→amber per design
- "Submit to Orchestrator" button: purple→blue per design

**I4: Test assertions updated**
`OrchestratorRuns.test.tsx` test assertions were updated to match the new color system (gray for medium risk, blue for merged PR). Zero new test failures.

---

## 4. Test Results

### Unit Tests
- **Baseline (master):** 21 failed / 231 passed (252 total)
- **Branch:** 21 failed / 231 passed (252 total)
- **New failures: 0** ✅
- **Pre-existing failures: 21** (all related to missing `repos` and `orchestrator` mock exports in `ImageUpload.test.tsx`, `BugReports.test.tsx`, `FeatureRequests.test.tsx`, and `Traceability.test.tsx`)

### Traceability Enforcer
- **PASS** — All 69 implemented FRs have test coverage

### E2E Tests
- 17 E2E test cases in `status-sync-traceability.spec.ts`
- Additional E2E files: `status-sync.spec.ts`, `status-sync-integration.spec.ts`, `chaos-status-sync.spec.ts`
- Tests use relative URLs correctly
- Cannot run in-context (requires running app + Playwright)

---

## 5. Architecture Compliance

| Rule | Status | Notes |
|------|--------|-------|
| No direct DB calls from route handlers | N/A | Frontend-only changes |
| Shared types are single source of truth | PASS | Uses `OrchestratorRun` from `types.ts` |
| Business logic has no framework imports | PASS | Status sync logic is in React effects (acceptable for frontend) |
| No hardcoded secrets | PASS | No secrets in changes |
| New routes must have observability | N/A | No new routes |
| Specs are source of truth | WARN | `FR-UX-001` not in spec (M1) |
| Every FR needs a test with traceability | PASS | All FRs have `// Verifies:` comments and test coverage |

---

## 6. Security Review

| Check | Status |
|-------|--------|
| No XSS vectors | PASS — no `dangerouslySetInnerHTML`, all user content rendered via JSX text nodes |
| No injection risks | PASS — no raw SQL, no eval, no template literal injection |
| No hardcoded credentials | PASS |
| External link safety | PASS — `target="_blank" rel="noopener noreferrer"` on PR links |
| Session token handling | PASS — session token inputs use `type="password"`, values not logged |

---

## 7. Recommendations

### Must Fix Before Merge
1. **Add `repo: selectedRepo` to `FeatureRequestDetail.submitWork()` call** (H1) — one-line fix, currently silently drops user's repo selection

### Should Fix
2. **Add error feedback to status sync buttons** (M3) — use existing `setError` pattern instead of silent catch
3. **Memoize `onUpdate` callback in `BugReportsPage`** (L1) — wrap with `useCallback` to prevent polling interval churn
4. **Create `FR-UX-001` in specification** or remap traceability comments to existing FRs (M1)

### Consider for Follow-up
5. **Implement backend `orchestrator_run_id` column** per dispatch plan (M2) — replaces fragile title-matching
6. **Render `<TraceabilityReport>` in detail views** when completed runs have report data (L2)

---

## 8. Verdict

**CONDITIONAL PASS** — The implementation correctly addresses the core task: status sync visibility between orchestrator runs and feature/bug portals, with appropriate action buttons and UX consistency polish. Zero new test failures. The one must-fix is the missing `repo` parameter in `FeatureRequestDetail.submitWork()` (H1). The run-linkage by title prefix (H2) is functional but fragile — acceptable for now with a follow-up to add backend `orchestrator_run_id` support.
