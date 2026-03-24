# Chaos Monkey Findings

## Mode: STATIC (all services down, no fault injection)
## Invariants Checked: 16
## Audit Date: 2026-03-23

---

### CHAOS-001: No SIGTERM/SIGINT handler — abrupt process exit [RE-VERIFIED]
- **Status:** STILL OPEN
- **Severity:** P2
- **Category:** graceful-shutdown
- **File:** `Source/Backend/src/index.ts`
- **Detail:** `startServer()` returns the HTTP server but registers no `process.on('SIGTERM')` or `process.on('SIGINT')` handler. On container orchestration signals (Kubernetes pod termination, Docker stop), the process exits immediately without closing the database (`closeDb()` exists but is never called outside tests), draining in-flight requests, or shutting down the OTel SDK. A SIGTERM during a `completeCycle` transaction could leave the SQLite WAL in a dirty state.
- **Expected:** Graceful shutdown: stop accepting new connections, drain in-flight requests, close DB, flush OTel spans, then exit.
- **Recommendation:** Add `process.on('SIGTERM', ...)` and `process.on('SIGINT', ...)` handlers in `startServer()` that call `server.close()`, `closeDb()`, and OTel `sdk.shutdown()`.
- **Cross-ref:** [CROSS-REF: code-quality]

---

### CHAOS-002: Tracing init swallows errors silently [RE-VERIFIED]
- **Status:** STILL OPEN
- **Severity:** P3
- **Category:** error-handling
- **File:** `Source/Backend/src/lib/tracing.ts:36-38`
- **Detail:** The `catch (err) {}` block in `initTracing()` catches and discards OTel SDK initialization errors with no logging. If the OTLP endpoint is misconfigured, operators get zero feedback. The tracing init is also fire-and-forget (uses `Promise.resolve().then(async () => ...)` with no `await` or `.catch()` on the outer promise chain — the empty catch only covers the inner `try/catch`).
- **Expected:** At minimum, log the error with the structured logger so operators can diagnose tracing failures.
- **Recommendation:** Replace `catch (err) {}` with `catch (err) { logger.warn('Tracing initialization failed', { error: (err as Error).message }); }`.
- **Cross-ref:** [CROSS-REF: code-quality]

---

### CHAOS-003: No uncaughtException handler [RE-VERIFIED]
- **Status:** STILL OPEN
- **Severity:** P2
- **Category:** error-handling
- **File:** `Source/Backend/src/index.ts`
- **Detail:** No `process.on('uncaughtException', ...)` handler exists in the application source. If `getDb()` throws during `startServer()` (e.g., disk full, permission denied on DB path), or if any synchronous error escapes Express middleware, the process crashes with no structured logging. The error goes only to stderr.
- **Expected:** A global `uncaughtException` handler that logs the error with the structured logger and exits with a non-zero code.
- **Recommendation:** Add `process.on('uncaughtException', (err) => { logger.error('Uncaught exception', { error: err.message, stack: err.stack }); process.exit(1); });`.
- **Cross-ref:** [CROSS-REF: code-quality]

---

### CHAOS-004: Sequential ID generation has TOCTOU race condition [RE-VERIFIED]
- **Status:** STILL OPEN
- **Severity:** P2
- **Category:** state-invariant
- **Files:** `Source/Backend/src/services/featureRequestService.ts:42-49`, `Source/Backend/src/services/bugService.ts:39-47`, `Source/Backend/src/services/cycleService.ts:119-137`, `Source/Backend/src/services/learningService.ts:32-39`, `Source/Backend/src/services/featureService.ts:29-37`
- **Detail:** All five ID generators use the pattern `SELECT id ... ORDER BY ROWID DESC LIMIT 1` then compute `next = parsed_number + 1`. This is a classic time-of-check-to-time-of-use (TOCTOU) race. If two concurrent requests call `createBug()` simultaneously, both will read the same last ID and generate the same next ID, causing a `UNIQUE constraint failed` on the `id` PRIMARY KEY. Note: `better-sqlite3` is synchronous and single-threaded for a single Node process, which mitigates this in the single-instance case. However, if the application is ever scaled to multiple processes sharing the same DB file (e.g., via cluster mode), this becomes a live data corruption bug. Additionally, the `createCycle` function does the ID generation outside a transaction, so even within one process, an error between ID generation and INSERT could produce ID gaps (low severity on its own, but indicates fragile design).
- **Expected:** IDs generated atomically (e.g., `AUTOINCREMENT` or `INSERT ... RETURNING` or a dedicated sequence table with `UPDATE ... RETURNING`).
- **Recommendation:** Use SQLite `INTEGER PRIMARY KEY AUTOINCREMENT` for the numeric portion, or wrap ID generation + INSERT in the same transaction with a retry on `SQLITE_CONSTRAINT`. Alternatively, use UUIDs (already imported but unused in most services).
- **Cross-ref:** [CROSS-REF: code-quality]

---

### CHAOS-005: Bug status updates have no transition guards [RE-VERIFIED]
- **Status:** STILL OPEN
- **Severity:** P2
- **Category:** state-invariant
- **File:** `Source/Backend/src/services/bugService.ts:141-148`
- **Detail:** `updateBug()` validates that the new status is a valid enum value (`VALID_BUG_STATUSES`) but does NOT enforce transition rules. Any valid status can be set from any other status — e.g., `reported` directly to `resolved` or `closed` back to `reported`. The feature request service has `STATUS_TRANSITIONS`, cycle service has `CYCLE_STATUS_ORDER`, and ticket service has `TICKET_STATUS_TRANSITIONS` — but bugs have no equivalent guard. This means the bug lifecycle is unprotected and can be corrupted by any API consumer.
- **Expected:** A `BUG_STATUS_TRANSITIONS` map enforcing allowed transitions (e.g., `reported -> triaged -> in_development -> resolved -> closed`).
- **Recommendation:** Add a transition map similar to `TICKET_STATUS_TRANSITIONS` and validate in `updateBug()` before applying the update.
- **Cross-ref:** [CROSS-REF: code-quality]

---

### CHAOS-006: createCycle performs multi-table writes without a transaction [RE-VERIFIED]
- **Status:** STILL OPEN
- **Severity:** P1
- **Category:** transaction-boundary
- **File:** `Source/Backend/src/services/cycleService.ts:157-218`
- **Detail:** `createCycle()` performs three separate DB writes: (1) INSERT into `cycles`, (2) UPDATE `bugs` or `feature_requests` to set `in_development` status. These are NOT wrapped in a `db.transaction()`. If the process crashes or is killed between the INSERT and the UPDATE, the cycle record exists but the work item still shows its old status, creating an inconsistent state. The `completeCycle()` function correctly uses `db.transaction()` (fixing the prior CHAOS-006 finding about that specific function), but `createCycle()` has the same class of bug.
- **Expected:** All multi-table writes in `createCycle()` wrapped in a single `db.transaction()`.
- **Recommendation:** Wrap lines 205-215 in `db.transaction(() => { ... })()`.
- **Cross-ref:** [CROSS-REF: code-quality]

---

### CHAOS-007: Health check does not probe the database [RE-VERIFIED]
- **Status:** STILL OPEN
- **Severity:** P3
- **Category:** missing-health-probe
- **File:** `Source/Backend/src/index.ts:49-51`
- **Detail:** The `/health` endpoint returns `{ status: 'ok' }` unconditionally without checking database connectivity. If the SQLite file is deleted, locked, or the DB handle becomes invalid, the health check still reports OK. Any load balancer or orchestrator relying on this endpoint will continue routing traffic to a broken instance.
- **Expected:** Health check executes a lightweight DB probe (e.g., `SELECT 1`) and reports degraded/unhealthy if it fails.
- **Recommendation:** Add `try { getDb().prepare('SELECT 1').get(); } catch { return res.status(503).json({ status: 'degraded', ... }); }` to the health endpoint.

---

### CHAOS-008: No unhandledRejection handler [RE-VERIFIED]
- **Status:** STILL OPEN
- **Severity:** P2
- **Category:** error-handling
- **File:** `Source/Backend/src/index.ts`
- **Detail:** No `process.on('unhandledRejection', ...)` handler. The `initTracing()` function fires an async promise chain that is not awaited — if the inner `.then()` itself rejects in a way not caught by the inner try/catch (e.g., dynamic import resolution failure before the try block), it becomes an unhandled rejection. In Node.js 15+, unhandled rejections terminate the process by default. Without a handler, there is no structured logging of the event.
- **Expected:** Global `unhandledRejection` handler that logs and optionally exits.
- **Recommendation:** Add `process.on('unhandledRejection', (reason) => { logger.error('Unhandled rejection', { reason: String(reason) }); });`.

---

### CHAOS-009: Dashboard activity query loads entire tables into memory [RE-VERIFIED]
- **Status:** STILL OPEN
- **Severity:** P3
- **Category:** resource-limit
- **File:** `Source/Backend/src/services/dashboardService.ts:80-226`
- **Detail:** `getDashboardActivity()` runs six separate `SELECT *` queries with no SQL-level `LIMIT` clause. All rows from `feature_requests`, `bugs`, `cycles`, `tickets`, `learnings`, and `features` are loaded into memory, mapped to activity items (often 2 items per row), concatenated, sorted in JavaScript, and THEN sliced. The in-memory `activities` array can grow to `2 * (total rows across all tables)`. With a 200-item display limit, this is extremely wasteful. Under load with thousands of records, this causes unnecessary GC pressure and memory spikes.
- **Expected:** SQL-level `ORDER BY ... LIMIT` on each sub-query, or a UNION ALL query with a global LIMIT.
- **Recommendation:** Use `UNION ALL` across tables with a global `ORDER BY timestamp DESC LIMIT ?` to fetch only the needed rows from the database.
- **Cross-ref:** [CROSS-REF: code-quality]

---

### CHAOS-010: No input length limits on bug and other entity free-text fields [RE-VERIFIED]
- **Status:** PARTIALLY FIXED
- **Severity:** P3
- **Category:** resource-limit / unbounded-input
- **Files:** `Source/Backend/src/services/bugService.ts:81-98`, `Source/Backend/src/services/cycleService.ts:282-296`, `Source/Backend/src/services/learningService.ts:73-91`
- **Detail:** `createFeatureRequest()` now enforces `TITLE_MAX_LENGTH=200` and `DESCRIPTION_MAX_LENGTH=10000` (fix applied since prior audit). However, `createBug()`, `createTicket()`, and `createLearning()` still accept unbounded `title`, `description`, and `content` fields. The schema also has no column-level constraints (all are `TEXT NOT NULL` with no CHECK). A malicious or buggy client can send megabytes of text (up to the 16KB body limit, which still allows 16KB per field).
- **Expected:** Consistent input length validation across all entity creation endpoints.
- **Recommendation:** Add length validation to `createBug()`, `createTicket()`, and `createLearning()` matching the pattern used in `featureRequestService.ts`.
- **Cross-ref:** [CROSS-REF: code-quality]

---

### CHAOS-011: Frontend API client has no request timeout [NEW]
- **Severity:** P3
- **Category:** missing-timeout
- **File:** `Source/Frontend/src/api/client.ts:40-64`
- **Detail:** The `apiFetch()` wrapper calls `fetch()` with no `AbortController` or timeout mechanism. If the backend hangs (e.g., SQLite BUSY lock, infinite loop), the frontend fetch will wait indefinitely. The `useApi` hook sets `loading: true` and never resolves, leaving the UI stuck in a loading state with no recovery path for the user.
- **Expected:** All outbound HTTP calls have a timeout (e.g., 30s) via `AbortController.signal`.
- **Recommendation:** Add `const controller = new AbortController(); const timeoutId = setTimeout(() => controller.abort(), 30000);` and pass `signal: controller.signal` to `fetch()`. Clear the timeout on response.
- **Cross-ref:** [CROSS-REF: code-quality]

---

### CHAOS-012: Frontend useApi hook does not cancel in-flight requests on unmount [NEW]
- **Severity:** P3
- **Category:** resource-leak
- **File:** `Source/Frontend/src/hooks/useApi.ts:23-36`
- **Detail:** The `useApi` hook's `fetch` callback starts an async operation but provides no cleanup/abort mechanism. If the component unmounts while a request is in flight, the `setData()` / `setError()` calls will fire on an unmounted component. In React 18 strict mode this may produce warnings. More importantly, if the component remounts quickly (e.g., navigation flicker), stale responses can overwrite fresh data.
- **Expected:** `useEffect` cleanup returns an abort function that cancels the in-flight fetch via `AbortController`.
- **Recommendation:** Create an `AbortController` inside the effect, pass its signal to the fetch function, and call `controller.abort()` in the cleanup.

---

### CHAOS-013: deleteFeatureRequest and deleteBug do not check for active cycle references [NEW]
- **Severity:** P2
- **Category:** state-invariant
- **Files:** `Source/Backend/src/services/featureRequestService.ts:285-291`, `Source/Backend/src/services/bugService.ts:168-173`
- **Detail:** `deleteFeatureRequest()` deletes votes and the FR record. `deleteBug()` deletes the bug record. Neither checks if the entity is referenced by an active `cycles.work_item_id`. If a user deletes an FR or bug that has an active cycle, the cycle's `work_item_id` becomes a dangling reference. The `completeCycle()` function then tries to look up the work item title and UPDATE its status, which will silently fail (the query returns undefined, and `workItemTitle` falls back to the ID, but the UPDATE affects 0 rows — the cycle marks itself complete while the work item no longer exists). There is also no `ON DELETE CASCADE` or `ON DELETE RESTRICT` foreign key from `cycles.work_item_id` to bugs/feature_requests since `work_item_id` is a polymorphic reference.
- **Expected:** Deletion should be blocked (409) if the entity is referenced by a non-complete cycle, OR the cycle should be cleaned up.
- **Recommendation:** Add a check in `deleteFeatureRequest()` and `deleteBug()`: `SELECT id FROM cycles WHERE work_item_id = ? AND status != 'complete'`. If found, throw `AppError(409, ...)`.
- **Cross-ref:** [CROSS-REF: code-quality]

---

### CHAOS-014: deleteFeatureRequest is not transactional [NEW]
- **Severity:** P3
- **Category:** transaction-boundary
- **File:** `Source/Backend/src/services/featureRequestService.ts:285-291`
- **Detail:** `deleteFeatureRequest()` performs two SQL statements: `DELETE FROM votes WHERE feature_request_id = ?` then `DELETE FROM feature_requests WHERE id = ?`. These are not wrapped in a transaction. If the process crashes between the two DELETEs, votes are deleted but the FR remains — losing vote data. Note: the schema has `ON DELETE CASCADE` on the votes FK, so deleting the FR first would cascade to votes. The current order (delete votes first, then FR) is redundant but also exposes the partial-delete risk.
- **Expected:** Both deletes in a single transaction, or rely on `ON DELETE CASCADE` by only deleting the FR.
- **Recommendation:** Either wrap in `db.transaction()` or simply remove the explicit `DELETE FROM votes` and rely on the FK cascade.

---

### CHAOS-015: No auto-restart or process manager configured [NEW]
- **Severity:** P3
- **Category:** recovery-failure
- **Files:** No `pm2.config.js`, no `Dockerfile`, no systemd unit, no `nodemon.json` for production
- **Detail:** There is no process manager configuration in the repository. If the backend process crashes (OOM, uncaught exception, SIGKILL), there is no mechanism to restart it automatically. Combined with CHAOS-001 (no SIGTERM handler) and CHAOS-003 (no uncaughtException handler), this means any crash is permanent until manual intervention.
- **Expected:** A process manager (pm2, Docker restart policy, systemd) ensures automatic restart on crash.
- **Recommendation:** Add `pm2` configuration or a `Dockerfile` with restart policy for production deployment. For development, this is lower priority.

---

### CHAOS-016: Frontend apiFetch does not handle network errors distinctly [NEW]
- **Severity:** P4
- **Category:** error-handling
- **File:** `Source/Frontend/src/api/client.ts:44-64`
- **Detail:** If `fetch()` throws (network failure, DNS resolution failure, CORS error), the error propagates as a generic `TypeError: Failed to fetch`. The `useApi` hook catches it and extracts `err.message`, which gives the user a cryptic "Failed to fetch" string. There is no distinction between network errors (server unreachable) and application errors (4xx/5xx), and no retry logic for transient network failures.
- **Expected:** Network errors wrapped in a distinct error type with user-friendly messaging and optional retry.
- **Recommendation:** Wrap the `fetch()` call in a try/catch that catches `TypeError` and throws an `ApiError` with status 0 and a message like "Unable to reach the server. Please check your connection."

---

## Summary

### Re-verified Prior Findings

| ID | Prior Finding | Status |
|----|--------------|--------|
| CHAOS-001 | No SIGTERM handler | STILL OPEN |
| CHAOS-002 | Tracing init error swallowing | STILL OPEN |
| CHAOS-003 | No uncaughtException handler | STILL OPEN |
| CHAOS-004 | Sequential ID race conditions | STILL OPEN |
| CHAOS-005 | Unguarded bug state machine | STILL OPEN |
| CHAOS-006 | createCycle non-transactional multi-table writes | STILL OPEN (scope clarified: createCycle, not completeCycle) |
| CHAOS-007 | Missing health check DB probe | STILL OPEN |
| CHAOS-008 | No unhandledRejection handler | STILL OPEN |
| CHAOS-009 | Full-table scans in dashboard | STILL OPEN |
| CHAOS-010 | Unbounded input on free-text fields | PARTIALLY FIXED (FR service has limits; bug/ticket/learning do not) |

### New Findings

| ID | Finding | Severity |
|----|---------|----------|
| CHAOS-011 | Frontend API client has no request timeout | P3 |
| CHAOS-012 | Frontend useApi hook does not cancel on unmount | P3 |
| CHAOS-013 | Delete FR/Bug does not check for active cycle references | P2 |
| CHAOS-014 | deleteFeatureRequest is not transactional | P3 |
| CHAOS-015 | No auto-restart / process manager | P3 |
| CHAOS-016 | Frontend apiFetch does not distinguish network errors | P4 |

### Severity Distribution

| Severity | Count |
|----------|-------|
| P1 | 1 (CHAOS-006) |
| P2 | 5 (CHAOS-001, CHAOS-003, CHAOS-004, CHAOS-005, CHAOS-008, CHAOS-013) |
| P3 | 8 (CHAOS-002, CHAOS-007, CHAOS-009, CHAOS-010, CHAOS-011, CHAOS-012, CHAOS-014, CHAOS-015) |
| P4 | 1 (CHAOS-016) |

---

```json
{
  "audit_date": "2026-03-23",
  "mode": "static",
  "invariants_checked": 16,
  "total_findings": 16,
  "new_findings": 6,
  "re_verified": 10,
  "status_breakdown": {
    "still_open": 9,
    "partially_fixed": 1,
    "fixed": 0,
    "regressed": 0,
    "new": 6
  },
  "severity_breakdown": {
    "P1": 1,
    "P2": 6,
    "P3": 8,
    "P4": 1
  },
  "findings": [
    { "id": "CHAOS-001", "severity": "P2", "category": "graceful-shutdown", "status": "STILL OPEN", "file": "Source/Backend/src/index.ts" },
    { "id": "CHAOS-002", "severity": "P3", "category": "error-handling", "status": "STILL OPEN", "file": "Source/Backend/src/lib/tracing.ts" },
    { "id": "CHAOS-003", "severity": "P2", "category": "error-handling", "status": "STILL OPEN", "file": "Source/Backend/src/index.ts" },
    { "id": "CHAOS-004", "severity": "P2", "category": "state-invariant", "status": "STILL OPEN", "file": "Source/Backend/src/services/*.ts" },
    { "id": "CHAOS-005", "severity": "P2", "category": "state-invariant", "status": "STILL OPEN", "file": "Source/Backend/src/services/bugService.ts" },
    { "id": "CHAOS-006", "severity": "P1", "category": "transaction-boundary", "status": "STILL OPEN", "file": "Source/Backend/src/services/cycleService.ts" },
    { "id": "CHAOS-007", "severity": "P3", "category": "missing-health-probe", "status": "STILL OPEN", "file": "Source/Backend/src/index.ts" },
    { "id": "CHAOS-008", "severity": "P2", "category": "error-handling", "status": "STILL OPEN", "file": "Source/Backend/src/index.ts" },
    { "id": "CHAOS-009", "severity": "P3", "category": "resource-limit", "status": "STILL OPEN", "file": "Source/Backend/src/services/dashboardService.ts" },
    { "id": "CHAOS-010", "severity": "P3", "category": "unbounded-input", "status": "PARTIALLY FIXED", "file": "Source/Backend/src/services/bugService.ts" },
    { "id": "CHAOS-011", "severity": "P3", "category": "missing-timeout", "status": "NEW", "file": "Source/Frontend/src/api/client.ts" },
    { "id": "CHAOS-012", "severity": "P3", "category": "resource-leak", "status": "NEW", "file": "Source/Frontend/src/hooks/useApi.ts" },
    { "id": "CHAOS-013", "severity": "P2", "category": "state-invariant", "status": "NEW", "file": "Source/Backend/src/services/featureRequestService.ts" },
    { "id": "CHAOS-014", "severity": "P3", "category": "transaction-boundary", "status": "NEW", "file": "Source/Backend/src/services/featureRequestService.ts" },
    { "id": "CHAOS-015", "severity": "P3", "category": "recovery-failure", "status": "NEW", "file": "N/A" },
    { "id": "CHAOS-016", "severity": "P4", "category": "error-handling", "status": "NEW", "file": "Source/Frontend/src/api/client.ts" }
  ]
}
```
