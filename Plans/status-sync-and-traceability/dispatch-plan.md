# Fix: Status Sync Between Orchestrator Runs, Features, and Bugs + Traceability Report Attachment

**Task:** Statuses for bug reports and features don't match the run and orchestrator statuses. Traceability reports should be attached to features and bugs when completed.

**RISK_LEVEL: medium**

Rationale: Touches ~10-15 files across backend (schema, services, routes) and frontend (detail components, RunsTab, types). Adds new DB columns and a new API endpoint. No auth/security changes.

---

## Root Cause Analysis

### Problem 1: Status Disconnect
Two separate status systems exist with no bridge between them:
- **Internal pipeline** (`cycles` → `pipeline_runs` → `pipeline_stages`) updates feature/bug status via `completeCycle()` when pipeline stage 5 is approved.
- **External orchestrator** (runs with statuses: `planning → implementing → qa_running → validating → complete | failed`) is a pure proxy with no callback mechanism.

When a user submits a feature/bug to the orchestrator:
1. The frontend immediately sets the work item to `in_development` regardless of actual orchestrator run state.
2. When the orchestrator run completes or fails, **nothing updates the feature/bug status** — it stays `in_development` forever.
3. No `orchestrator_run_id` is stored on feature_requests or bugs, so there's no way to reconcile.

### Problem 2: Batch Submit Missing Status Update
`BugReportsPage.handleBatchSubmit` submits bugs to the orchestrator but never updates their statuses to `in_development`.

### Problem 3: BugDetail.onUpdate Not in Props
`BugDetail.tsx` calls `onUpdate(updated)` at line 110, but `BugDetailProps` only defines `bug` and `onClose`. This causes a runtime TypeError when submitting a bug to the orchestrator from the detail view.

### Problem 4: Missing Traceability Reports
- `completeCycle()` in `cycleService.ts` never passes `traceability_report` when calling `createFeature()`, so every Feature record has `traceability_report = NULL`.
- Neither `feature_requests` nor `bugs` tables have a `traceability_report` column.
- `FeatureRequestDetail` has zero traceability UI.
- `BugDetail` only shows navigational links (related_work_item_id, related_cycle_id), not a `<TraceabilityReport>` component.

### Problem 5: Action Buttons Don't Reflect Run State
Once `in_development`, no actions are available on feature/bug tiles — even if the orchestrator run failed. Users cannot re-submit or mark as complete.

---

## Fix Strategy

### Approach: Backend Status Sync Endpoint + Frontend Polling

Rather than implementing webhooks (which require the external orchestrator to call back), we add:
1. A **backend sync endpoint** `POST /api/orchestrator/sync-status` that the frontend calls after detecting a run state change.
2. Store `orchestrator_run_id` on `feature_requests` and `bugs` so the system can correlate.
3. Add a `traceability_report` column to `feature_requests` and `bugs`.
4. Frontend RunsTab polling detects completed/failed runs and triggers status sync.

---

## Files to Change

### Backend Files
| File | Change |
|------|--------|
| `Source/Backend/src/database/schema.ts` | Add `orchestrator_run_id` and `traceability_report` columns to `feature_requests` and `bugs` |
| `Source/Shared/types.ts` | Add `orchestrator_run_id` and `traceability_report` fields to `FeatureRequest` and `BugReport` types |
| `Source/Shared/api.ts` | Update `UpdateFeatureRequestInput` and `UpdateBugInput` to include new fields |
| `Source/Backend/src/services/featureRequestService.ts` | Handle `orchestrator_run_id` and `traceability_report` in update |
| `Source/Backend/src/services/bugService.ts` | Handle `orchestrator_run_id` and `traceability_report` in update |
| `Source/Backend/src/routes/orchestratorRoutes.ts` (NEW) | Add `POST /api/orchestrator/sync-status` endpoint that queries orchestrator run, maps status, updates feature/bug |
| `Source/Backend/src/index.ts` | Register new orchestrator sync route |

### Frontend Files
| File | Change |
|------|--------|
| `Source/Frontend/src/components/feature-requests/FeatureRequestDetail.tsx` | Store orchestrator_run_id on submit; show traceability report; add re-submit action when run failed |
| `Source/Frontend/src/components/bugs/BugDetail.tsx` | Fix onUpdate prop; store orchestrator_run_id on submit; show traceability report; add re-submit action |
| `Source/Frontend/src/pages/BugReportsPage.tsx` | Update bug statuses in batch submit; pass onUpdate to BugDetail |
| `Source/Frontend/src/components/orchestrator/RunsTab.tsx` | On poll, detect completed/failed runs and call sync endpoint |
| `Source/Frontend/src/api/client.ts` | Add `syncRunStatus(runId, workItemId, workItemType)` API method |
| `Source/Frontend/src/components/features/TraceabilityReport.tsx` | No changes needed (reuse as-is) |

---

## Detailed Fix Instructions

### backend-fixer-1

**Scope:** Backend schema, services, routes, and shared types.

**Step 1: Add DB columns** (`Source/Backend/src/database/schema.ts`)

After the existing `target_repo` migration block (around line 217), add idempotent migrations:

```
-- feature_requests: add orchestrator_run_id TEXT
-- feature_requests: add traceability_report TEXT
-- bugs: add orchestrator_run_id TEXT
-- bugs: add traceability_report TEXT
```

Use the same `PRAGMA table_info` + `some()` pattern as existing migrations.

**Step 2: Update shared types** (`Source/Shared/types.ts`)

Add to `FeatureRequest` interface:
- `orchestrator_run_id: string | null`
- `traceability_report: string | null`

Add to `BugReport` interface:
- `orchestrator_run_id: string | null`
- `traceability_report: string | null`

**Step 3: Update shared API input types** (`Source/Shared/api.ts`)

Add `orchestrator_run_id?: string` and `traceability_report?: string` to `UpdateFeatureRequestInput` and `UpdateBugInput`.

**Step 4: Update featureRequestService.ts** (`Source/Backend/src/services/featureRequestService.ts`)

In the `updateFeatureRequest` function, ensure `orchestrator_run_id` and `traceability_report` are included in the SET clause when provided. Follow the existing dynamic field update pattern.

**Step 5: Update bugService.ts** (`Source/Backend/src/services/bugService.ts`)

Same as Step 4 — ensure `orchestrator_run_id` and `traceability_report` are handled in `updateBug`.

**Step 6: Create orchestrator sync route** (`Source/Backend/src/routes/orchestratorRoutes.ts` — NEW file)

Create a new route file with:

```
POST /api/orchestrator/sync-status
Body: { runId: string, workItemId: string, workItemType: 'feature_request' | 'bug' }
```

Logic:
1. Fetch the orchestrator run status by proxying `GET /api/orchestrator/api/runs/{runId}` internally (use `fetch` to the orchestrator URL).
2. Map orchestrator status to work item status:
   - `planning` / `implementing` / `qa_running` / `validating` → `in_development` (feature) or `in_development` (bug)
   - `complete` → `completed` (feature) or `resolved` (bug)
   - `failed` → revert to `approved` (feature) or `triaged` (bug) — so users can re-submit
3. If run status is `complete`, also fetch the run's traceability data (if the run response includes it) and store it as `traceability_report` on the work item.
4. Update the feature_request or bug record with the mapped status and optional traceability_report.
5. Return the updated work item.

Register this route in `Source/Backend/src/index.ts` before the existing orchestrator proxy catch-all.

**Step 7: Update existing orchestrator proxy** (`Source/Backend/src/index.ts`)

Ensure the new `/api/orchestrator/sync-status` route is registered BEFORE the catch-all proxy at `/api/orchestrator/*` so it doesn't get swallowed by the proxy.

---

### frontend-fixer-1

**Scope:** Frontend components, API client, and status sync integration.

**Step 1: Add syncRunStatus to API client** (`Source/Frontend/src/api/client.ts`)

Add to the `orchestrator` object:
```ts
syncRunStatus(runId: string, workItemId: string, workItemType: 'feature_request' | 'bug'): Promise<any> {
  return apiFetch('/api/orchestrator/sync-status', {
    method: 'POST',
    body: JSON.stringify({ runId, workItemId, workItemType }),
  })
}
```

**Step 2: Fix BugDetail props and onUpdate** (`Source/Frontend/src/components/bugs/BugDetail.tsx`)

- Add `onUpdate?: (bug: BugReport) => void` to `BugDetailProps` interface.
- Guard the `onUpdate` call: `if (onUpdate) onUpdate(updated)`.

**Step 3: Update BugDetail orchestrator submit** (`Source/Frontend/src/components/bugs/BugDetail.tsx`)

In `handleSubmitToOrchestrator`:
- After `orchestrator.submitWork(...)` succeeds, capture the returned `{ id }` (the orchestrator run ID).
- Update the bug with both status and orchestrator_run_id: `bugs.update(bug.id, { status: "in_development", orchestrator_run_id: result.id })`.

**Step 4: Update FeatureRequestDetail orchestrator submit** (`Source/Frontend/src/components/feature-requests/FeatureRequestDetail.tsx`)

Same as Step 3 — capture the orchestrator run ID from `submitWork` response and store it:
`featureRequests.update(fr.id, { status: "in_development", orchestrator_run_id: result.id })`.

**Step 5: Fix BugReportsPage batch submit** (`Source/Frontend/src/pages/BugReportsPage.tsx`)

In `handleBatchSubmit`, after each successful `orchestrator.submitWork()`, update the bug status:
```ts
await bugs.update(bug.id, { status: "in_development" })
```
Also pass `onUpdate` prop to `BugDetail` component.

**Step 6: Add traceability report display to FeatureRequestDetail** (`Source/Frontend/src/components/feature-requests/FeatureRequestDetail.tsx`)

Import `TraceabilityReport` from `../features/TraceabilityReport`.
When `fr.traceability_report` is non-null, render `<TraceabilityReport report={fr.traceability_report} />` in the detail view, similar to how `FeatureBrowser.tsx` does it.

**Step 7: Add traceability report display to BugDetail** (`Source/Frontend/src/components/bugs/BugDetail.tsx`)

Same as Step 6 — import and render `<TraceabilityReport>` when `bug.traceability_report` is non-null. Place it near the existing traceability links section.

**Step 8: Add re-submit action for failed runs** (`Source/Frontend/src/components/feature-requests/FeatureRequestDetail.tsx` and `Source/Frontend/src/components/bugs/BugDetail.tsx`)

Currently, the "Submit to Orchestrator" button only shows when status is `approved` (features) or `reported`/`triaged` (bugs). Add an additional condition:
- For features: also show when `fr.status === 'in_development'` AND the orchestrator run has failed (status reverted to `approved` by sync).
  - Simplification: since the sync endpoint reverts status to `approved` on failure, the existing condition `fr.status === 'approved'` already covers re-submit. No change needed IF sync works correctly.
- For bugs: since sync reverts to `triaged`, the existing condition already covers re-submit. Verify this is correct.

**Step 9: Integrate status sync in RunsTab polling** (`Source/Frontend/src/components/orchestrator/RunsTab.tsx`)

This is the trigger mechanism. In the `fetchRuns` callback:
1. After fetching runs, compare with previous runs state.
2. For any run that transitioned to `complete` or `failed`, call `orchestrator.syncRunStatus(run.id, ...)`.
3. Problem: RunsTab doesn't know which work item a run belongs to. The orchestrator run's `task` field contains the description but not the work item ID.

**Alternative approach for Step 9:** Instead of RunsTab triggering sync, have the detail pages (FeatureRequestDetail, BugDetail) poll for their specific run status when `orchestrator_run_id` is set and status is `in_development`:
- Add a `useEffect` that polls `orchestrator.getRun(fr.orchestrator_run_id)` every 15 seconds.
- When the run reaches `complete` or `failed`, call `orchestrator.syncRunStatus(...)` to update the backend.
- This is simpler and more targeted than RunsTab integration.

Implement this polling in both `FeatureRequestDetail` and `BugDetail` when:
- The work item has an `orchestrator_run_id`
- The work item status is `in_development`

---

## Verification Checklist

- [ ] Feature request submitted to orchestrator stores `orchestrator_run_id`
- [ ] Bug submitted to orchestrator stores `orchestrator_run_id`
- [ ] Batch bug submit updates statuses to `in_development`
- [ ] BugDetail no longer throws TypeError on submit (onUpdate prop fixed)
- [ ] When orchestrator run completes, feature status updates to `completed`
- [ ] When orchestrator run completes, bug status updates to `resolved`
- [ ] When orchestrator run fails, feature status reverts to `approved` (re-submittable)
- [ ] When orchestrator run fails, bug status reverts to `triaged` (re-submittable)
- [ ] Traceability report stored on feature_requests and bugs tables
- [ ] TraceabilityReport component renders on FeatureRequestDetail when data exists
- [ ] TraceabilityReport component renders on BugDetail when data exists
- [ ] No new test failures introduced
- [ ] Existing feature request and bug CRUD still works
