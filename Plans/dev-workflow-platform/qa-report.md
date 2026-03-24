# QA Report: Development Workflow Platform

**QA Reviewer:** qa-reviewer agent
**Pipeline Run:** run-1774234977-187
**Date:** 2026-03-23
**Verdict:** FAILED

---

## 1. Test Results Summary

### Backend Tests
- **Status:** ALL PASSED
- **Files:** 16 test files
- **Tests:** 221 passed, 0 failed
- **Duration:** ~3.56s

### Frontend Tests
- **Status:** ALL PASSED
- **Files:** 6 test files
- **Tests:** 49 passed, 0 failed
- **Duration:** ~5.13s

> **Note:** All tests pass because they use mocked databases (`vi.mock('../src/database/connection')`). This means runtime SQL errors and column name mismatches are not caught by the test suite.

---

## 2. Code Review Findings

### BLOCKER Issues

#### BLOCKER-1: DB Column Name Mismatch — `human_approval_at` vs `human_approval_approved_at`

**Files affected:**
- `/workspace/Source/Backend/src/database/schema.ts` — line 27: defines column `human_approval_approved_at`
- `/workspace/Source/Backend/src/services/featureRequestActionService.ts` — lines 22, 50, 54, 116, 149: uses column `human_approval_at`

**Impact:** At runtime on a real SQLite database, both `approveFeatureRequest` and `denyFeatureRequest` will throw an SQL error (`table feature_requests has no column named human_approval_at`) when attempting the UPDATE. Additionally, the SELECT after update will return `undefined` for `row.human_approval_at` instead of the expected timestamp, so `human_approval` will never be populated on any returned FeatureRequest via this service.

**Why tests pass:** All service-level tests mock `getDb()`, so the real SQLite never executes.

**Fix required:** In `featureRequestActionService.ts`, rename all references to `human_approval_at` → `human_approval_approved_at` (lines 22, 50, 54, 116, 149), and update the TypeScript interface accordingly (`human_approval_at: string | null` → `human_approval_approved_at: string | null`).

---

#### BLOCKER-2: Human Approval Workflow Is Logically Unreachable

**Files affected:**
- `/workspace/Source/Backend/src/services/featureRequestService.ts` — `simulateVotingForFR` (lines 387–421)
- `/workspace/Source/Backend/src/services/featureRequestActionService.ts` — `approveFeatureRequest` (lines 98–99)

**Impact:** The AI voting simulation (`POST /api/feature-requests/:id/vote`) performs three status transitions in a single call:
1. Sets status to `voting`
2. Casts votes
3. Immediately sets final status to `approved` or `denied`

After `POST /vote` completes, the FR is already in `approved` or `denied` status. The `approveFeatureRequest` service then checks `if (row.status !== 'voting')` and returns `NOT_IN_APPROVABLE_STATE` — so `POST /api/feature-requests/:id/approve` can **never succeed** in normal workflow.

**Contract says:** `POST /vote` "transitions FR to `approved` or `denied`" AND `POST /approve` "Human approves an FR that has majority-approve vote result. FR transitions to `approved`." These two endpoints cannot both work as described — the vote endpoint already auto-approves/denies, leaving no `voting` state for the human to act on.

**Fix required (design decision needed):** Either:
- Option A: `simulateVotingForFR` should leave the FR in `voting` status after casting votes, so a human can call `POST /approve` or `POST /deny`. The majority result should be advisory, not auto-transitioning.
- Option B: The `approveFeatureRequest` service should accept FRs in `approved` or `denied` status and re-confirm/override.

This is a design conflict between Backend Coder 1 (featureRequestService) and Backend Coder 2 (featureRequestActionService).

---

### WARNING Issues

#### WARNING-1: Missing `try/catch` + `next(err)` in Most Route Files

**Files affected:** `bugs.ts`, `cycles.ts`, `dashboard.ts`, `learnings.ts`, `features.ts`, `featureRequestActions.ts`

**Only `featureRequests.ts` uses the correct pattern:**
```typescript
try {
  // ...
} catch (err) {
  next(err);
}
```

All other route files handle known error cases inline but do **not** wrap handlers in `try/catch`. If the service layer or database throws an unexpected exception (e.g., DB unavailable, constraint violation), Express will call its default error handler, which returns HTML — not `{ error: "message" }` JSON. This violates the architecture rule: "error handler returns `{error: "message"}` format."

**Fix:** Wrap all route handlers in the remaining files with `try/catch` + `next(err)` to route unhandled errors through the centralized `errorHandler`.

---

#### WARNING-2: Inconsistent Logger Import Style

**Detail:** Services import `{ logger }` as a named export (`import { logger } from '../lib/logger'`), while `index.ts`, `errorHandler.ts`, `connection.ts`, and `schema.ts` import as default (`import logger from '../lib/logger'`). Both styles work since `logger.ts` exports both (`export const logger = {...}` and `export default logger`), but the inconsistency is a maintenance risk.

---

#### WARNING-3: Status Transition Deviations from Contract

**File:** `/workspace/Source/Backend/src/services/featureRequestService.ts` — `VALID_TRANSITIONS` (lines 24–31)

The service's `VALID_TRANSITIONS` map allows:
- `potential` → `denied` (not in contract)
- `approved` → `denied` (not in contract)

The contract only specifies:
- `potential` → `voting`
- `voting` → `approved` | `denied`
- `approved` → `in_development`
- `in_development` → `completed`

These extra transitions are not necessarily harmful (and may be intentional), but they deviate from the specified contract without documentation.

---

#### WARNING-4: Frontend `dashboardApi.summary()` Has Mismatched Return Type Annotation

**File:** `/workspace/Source/Frontend/src/api/client.ts` — line 231–232

```typescript
summary(): Promise<DashboardSummaryResponse> {
  return request<DashboardSummary>('/dashboard/summary')
```

The method signature declares `Promise<DashboardSummaryResponse>` but calls `request<DashboardSummary>`. Since `DashboardSummaryResponse = DashboardSummary` (a type alias in `api.ts`), these resolve to the same type and there is no functional impact — but the inconsistency is confusing.

---

### INFO Issues

#### INFO-1: No Cycle Status Transition Validation

**File:** `/workspace/Source/Backend/src/routes/cycles.ts` (lines 49–69)

The `PATCH /api/cycles/:id` endpoint validates that the provided `status` value is a valid `CycleStatus` enum member, but does **not** validate state machine transitions (e.g., it would allow jumping from `spec_changes` directly to `complete`). The contract diagram shows a strict linear progression: `spec_changes → ticket_breakdown → implementation → review → smoke_test → complete`. This should be enforced similarly to how `FeatureRequest` status transitions are enforced.

---

#### INFO-2: ID Generation Uses COUNT-Based Approach (Race Condition Risk)

**Files:** All services (`featureRequestService.ts`, `bugService.ts`, `cycleService.ts`, etc.)

All services generate IDs by counting existing rows (`SELECT COUNT(*) as cnt FROM table`) and incrementing. With SQLite in WAL mode, concurrent requests could theoretically generate duplicate IDs. However, since SQLite serializes writes and the service is single-process, this is a low risk in practice.

---

#### INFO-3: `featureRequestActionsRouter` Mounted Twice Without Explicit Path Differentiation

**File:** `/workspace/Source/Backend/src/index.ts` — lines 51–52

```typescript
app.use('/api/feature-requests', featureRequestsRouter);
app.use('/api/feature-requests', featureRequestActionsRouter);
```

Both routers are mounted at the same prefix. This works correctly because the routes are distinct (`/:id/vote` in the first, `/:id/approve` and `/:id/deny` in the second), but the approach may cause confusion during maintenance. A comment explaining the split exists and is adequate.

---

## 3. Integration Issues

### Route Coverage vs. Contract

All routes defined in `contracts.md` are implemented and mounted:

| Contract Endpoint | Route File | Mounted in index.ts |
|---|---|---|
| GET/POST/GET:id/PATCH:id/DELETE:id /api/feature-requests | featureRequests.ts | YES |
| POST /:id/vote | featureRequests.ts | YES |
| POST /:id/approve, POST /:id/deny | featureRequestActions.ts | YES |
| GET/POST/GET:id/PATCH:id/DELETE:id /api/bugs | bugs.ts | YES |
| GET/POST/GET:id/PATCH:id /api/cycles | cycles.ts | YES |
| POST /:id/tickets, PATCH /:id/tickets/:ticketId | cycles.ts | YES |
| POST /:id/complete | cycles.ts | YES |
| GET /api/dashboard/summary, GET /api/dashboard/activity | dashboard.ts | YES |
| GET/POST /api/learnings | learnings.ts | YES |
| GET /api/features | features.ts | YES |

No missing routes detected.

### Service Layer Pattern

- All routes delegate to service functions — no direct DB calls in route handlers. ✓
- All services import `getDb()` from `../database/connection` consistently. ✓
- Business logic services (`featureRequestService.ts`) import error classes from middleware (`errorHandler.ts`), which creates an upward dependency from service to middleware layer. This is a minor concern but not a blocker.

### List Endpoint Response Wrappers

All list endpoints return `{ data: T[] }`:

| Endpoint | Returns `{data: [...]}` |
|---|---|
| GET /api/feature-requests | YES |
| GET /api/bugs | YES |
| GET /api/cycles | YES |
| GET /api/dashboard/activity | YES |
| GET /api/learnings | YES |
| GET /api/features | YES |

### Error Handler Format

`errorHandler.ts` correctly returns `{ error: err.message }` for `AppError` subclasses and `{ error: 'Internal server error' }` for unhandled exceptions. ✓

### Frontend–Backend Contract Alignment

- `Source/Frontend/src/api/client.ts` imports all types from `@shared/types` and `@shared/api` (resolved via Vite alias to `../Shared`). ✓
- All 20+ API methods in the client align with backend route paths and HTTP methods. ✓
- Type aliases from `api.ts` are used correctly throughout. ✓
- Minor: `dashboardApi.summary()` declares `Promise<DashboardSummaryResponse>` but passes `DashboardSummary` as type parameter (WARNING-4 above — functionally equivalent).

---

## 4. Verdict

**FAILED**

Two BLOCKER issues prevent production readiness:

1. **BLOCKER-1** will cause a hard SQL error at runtime whenever `POST /api/feature-requests/:id/approve` or `POST /api/feature-requests/:id/deny` is called on a real database. The column name `human_approval_at` does not exist in the schema; the actual column is `human_approval_approved_at`.

2. **BLOCKER-2** is a design conflict: the AI voting endpoint already auto-transitions the FR to `approved`/`denied`, making the human approval endpoint (`POST /approve`) logically unreachable in the normal workflow (it requires `status == 'voting'`, which the voting step immediately exits).

Both issues affect the core Feature Request approval workflow (FR-011, FR-012) and must be resolved before the pipeline can be marked complete.

---

## 5. Recommendations for Resolution

1. **Fix BLOCKER-1:** In `featureRequestActionService.ts`, change all occurrences of `human_approval_at` to `human_approval_approved_at`. Update the `FeatureRequestRow` interface and the SQL UPDATE statements on lines 116 and 149.

2. **Resolve BLOCKER-2 design conflict:** Decide whether `POST /vote` should auto-transition or remain in `voting` status. Update either `featureRequestService.ts` or `featureRequestActionService.ts` accordingly. Update `contracts.md` to reflect the agreed-upon behavior.

3. **Address WARNING-1:** Add `try/catch` + `next(err)` wrappers to all route handlers in `bugs.ts`, `cycles.ts`, `dashboard.ts`, `learnings.ts`, `features.ts`, and `featureRequestActions.ts`.

4. **Add integration tests against a real in-memory SQLite database** to catch column name mismatches and SQL errors before they reach production.
