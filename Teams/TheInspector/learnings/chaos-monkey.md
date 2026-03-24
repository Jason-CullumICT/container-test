# Chaos Monkey Learnings

## Audit Session: 2026-03-23 (First Audit — Static Mode)

### Mode Selected: Static
**Reason:** All services were DOWN at time of audit. No live fault injection was possible.

---

## Patterns Observed

### Robust Error Handling Patterns
- All route handlers use `try/catch + next(err)` uniformly — no empty catch blocks in routes.
- Centralized `errorHandler` middleware distinguishes `AppError` (domain errors) from unhandled errors; logs both with structured output.
- `withSpan()` in `lib/tracing.ts` wraps all route logic, records exceptions to spans, and always calls `span.end()` in `finally` — clean span lifecycle even on errors.
- All state machine transitions are guarded with explicit allow-lists (`STATUS_TRANSITIONS`, `CYCLE_STATUS_ORDER`, `TICKET_STATUS_TRANSITIONS`) — no direct status writes bypass validation.
- `completeCycle` wraps multi-table writes in a `db.transaction()` — partial completion is prevented.
- Body size limit `16kb` is set on `express.json()` — file upload vector is closed (no multipart endpoints exist).
- Dashboard activity feed has a hard cap of 200 items (`MAX_ACTIVITY_LIMIT`) — prevents unbounded in-memory arrays.

### Fragile / Missing Patterns (Active Findings)
1. **No SIGTERM/SIGINT handler** — process exits abruptly without closing DB or draining connections. (CHAOS-001, P2)
2. **Tracing init swallows errors silently** — `catch (err) {}` in `initTracing()` drops SDK initialization errors with no log. (CHAOS-002, P3)
3. **`getDb()` throws synchronously into unguarded context at startup** — if `startServer()` fails DB init, the thrown error is uncaught; no `process.on('uncaughtException')` safety net. (CHAOS-003, P2)
4. **Sequential ID generation is a TOCTOU race** — `SELECT ... ORDER BY ROWID DESC LIMIT 1` pattern used for FR/BUG/CYCLE/TKT/LRN/FEAT IDs has no uniqueness guarantee under concurrent inserts. (CHAOS-004, P2)
5. **Bug state machine has no transition guards** — `updateBug()` accepts any valid enum value with no transition table; arbitrary jumps (e.g., `reported` -> `resolved`) are permitted. (CHAOS-005, P2)
6. **`createCycle` performs multi-table writes without a transaction** — INSERT into cycles + UPDATE work item status are separate unguarded writes; crash between them leaves inconsistent state. (CHAOS-006, P1)
7. **`/health` endpoint does not probe the database** — a corrupt or locked DB will not be reflected in the health check. (CHAOS-007, P3)
8. **No `process.on('unhandledRejection')` handler** — an unhandled async rejection outside Express will crash Node.js silently in older versions or produce a noisy warning without structured logging in newer ones. (CHAOS-008, P2)
9. **Dashboard activity query loads entire tables into memory** — no SQL-level `LIMIT` on the per-table SELECT statements; large datasets are fully hydrated before slicing. (CHAOS-009, P3)
10. **No input length limits on free-text fields** — PARTIALLY FIXED: `featureRequestService` now has `TITLE_MAX_LENGTH=200` and `DESCRIPTION_MAX_LENGTH=10000`. Bug, ticket, and learning services still lack limits. (CHAOS-010, P3)

---

## Audit Session: 2026-03-23 (Second Audit — Static Mode, Re-verification)

### Mode Selected: Static
**Reason:** All services were DOWN at time of audit. No live fault injection was possible.

### Key Findings from Re-verification
- **Zero prior findings were fully fixed.** All 10 prior findings remain open or only partially fixed.
- CHAOS-010 is PARTIALLY FIXED: `featureRequestService.ts` now validates title (200 chars) and description (10000 chars), but `bugService`, `cycleService` (tickets), and `learningService` still accept unbounded text.
- CHAOS-006 was re-scoped: `completeCycle()` does correctly use `db.transaction()` now, but `createCycle()` has the same class of bug — multi-table writes without transaction protection. The P1 severity applies to `createCycle`.

### New Discoveries
1. **Frontend has no request timeouts** — `apiFetch()` in `client.ts` uses `fetch()` with no `AbortController` or timeout. Backend hang = permanent frontend loading state. (CHAOS-011, P3)
2. **Frontend useApi hook has no unmount cleanup** — No `AbortController` abort on unmount, leading to stale state updates on unmounted components. (CHAOS-012, P3)
3. **Delete operations create dangling cycle references** — `deleteFeatureRequest()` and `deleteBug()` do not check if the entity is referenced by an active cycle. Deleting a work item mid-cycle leaves `cycles.work_item_id` as a dangling reference. (CHAOS-013, P2)
4. **deleteFeatureRequest is not transactional** — Two DELETEs (votes then FR) without `db.transaction()`. Crash between them loses votes but keeps the FR. Could rely on `ON DELETE CASCADE` instead. (CHAOS-014, P3)
5. **No process manager for auto-restart** — No pm2, Docker, or systemd config found. Any crash is permanent. (CHAOS-015, P3)
6. **Frontend does not distinguish network errors from API errors** — `fetch()` `TypeError` propagates as generic error message with no retry or user-friendly messaging. (CHAOS-016, P4)

### Pattern: better-sqlite3 Synchronous Nature Mitigates Some Races
- `better-sqlite3` runs all queries synchronously on the main thread. This means the TOCTOU race in ID generation (CHAOS-004) is NOT exploitable within a single Node.js process — JS is single-threaded and `better-sqlite3` calls are blocking. The race only manifests with multiple processes sharing the same DB file (cluster mode, multiple deployments). This mitigates the practical severity for current single-process deployment, but the design is still fragile.

### Pattern: Polymorphic Foreign Keys are Unprotectable
- `cycles.work_item_id` references either `bugs.id` or `feature_requests.id` depending on `work_item_type`. SQLite cannot enforce a foreign key across two tables. This is a known anti-pattern that makes referential integrity checks the application's responsibility — and the application is currently not performing them (CHAOS-013).

---

## Recovery Times (Static Mode — Estimated)
- No live measurements available.
- Cold start estimated < 2s based on synchronous SQLite init and no heavy bootstrap logic.
- No auto-restart mechanism (no `pm2`, `nodemon` in production, or systemd config found in repo).

## MCP Tools Available
- No MCP tools were available or configured for this project.

## Recommendations for Next Audit (Dynamic Mode)
- Run `POST /api/feature-requests/:id/vote` and immediately `DELETE /api/feature-requests/:id` concurrently to test TOCTOU on ID generation.
- Kill backend mid-`createCycle` call (between INSERT cycles and UPDATE work item) to verify non-transactional multi-table write.
- Hit `/health` while DB is locked with a long-running write to confirm health endpoint false-positives.
- Send a 16KB `title` field to `POST /api/bugs` to confirm unbounded text acceptance.
- Delete a feature request that has an active cycle to confirm dangling reference behavior in `completeCycle()`.
- Observe frontend behavior when backend is stopped mid-request (confirm indefinite loading state from CHAOS-011).

---

## Audit Session: 2026-03-24 (Third Audit -- Hybrid Mode)

### Mode Selected: Hybrid (static + dynamic)
**Reason:** Both backend (localhost:3001) and frontend (localhost:5173) services were UP. Dynamic fault injection was possible for pipeline orchestration tests.

### Key Findings

#### CHAOS-010 is now FIXED
- All entity creation endpoints now have input length limits:
  - `bugService.ts`: `TITLE_MAX_LENGTH=200`, `DESCRIPTION_MAX_LENGTH=10000`
  - `learningService.ts`: `CONTENT_MAX_LENGTH=10000`
  - `cycleService.ts` (tickets): `TICKET_TITLE_MAX_LENGTH=200`, `TICKET_DESCRIPTION_MAX_LENGTH=10000`
- Dynamically confirmed: POST /api/bugs with 250-char title returns 400; POST /api/learnings with 15000-char content returns 400.

#### Three P1 Pipeline State Corruption Bugs Found
1. **CHAOS-017**: Stage 5 completion writes pipeline as `completed` BEFORE calling `completeCycle()`. If `completeCycle()` throws (e.g., incomplete tickets), pipeline says `completed` but cycle is NOT complete. Deadlock: cannot re-complete stage (409), cannot manually advance cycle (409 pipeline guard). **Dynamically reproduced on RUN-0003/CYCLE-0003.**
2. **CHAOS-018**: `POST /cycles/:id/complete` has no pipeline guard. Can directly complete a pipeline-linked cycle while pipeline is running. Pipeline stage completions then rewrite the cycle status backward. **Dynamically reproduced: CYCLE-0003 went from `complete` back to `ticket_breakdown`.**
3. **CHAOS-019**: `createPipelineRun()` does 7 DB writes (1 pipeline_runs INSERT + 5 stage INSERTs + 1 cycle UPDATE) without a transaction. Route handler also calls `createCycle()` + `createPipelineRun()` without a wrapping transaction.

#### Pipeline State Machine Guards Work Well
- Cannot complete a non-running stage (409)
- Cannot start stage N before stage N-1 is completed (409)
- Invalid verdict values are rejected (400)
- Out-of-range stage numbers are rejected (400)
- Missing verdict field is rejected (400)
- Double-completion of a stage is rejected (409)
- Failed stages CAN be restarted (startStage allows 'failed' status) -- good recovery path
- Manual cycle status changes blocked on pipeline-linked cycles (FR-039) -- BUT bypassed via POST /complete (CHAOS-018)

#### Dynamic Bug State Machine Test
- CHAOS-005 dynamically confirmed: BUG-0001 transitioned `reported -> resolved` then `resolved -> reported` via PATCH with no guard. Any valid status can be set from any other status.

#### Dynamic Dangling Reference Test
- CHAOS-013 dynamically confirmed: `DELETE /api/feature-requests/FR-0001` returned 204 while CYCLE-0001 referenced it.

### Patterns: Pipeline Orchestration Code Quality
- Pipeline routes use the same `try/catch + next(err) + withSpan()` pattern as all other routes -- consistent.
- Pipeline stage configuration is cleanly separated (PIPELINE_STAGES array, STAGE_TO_CYCLE_PHASE map).
- The `completeCycle()` function correctly uses `db.transaction()` internally, but calling code does not wrap the multi-step pipeline completion in a transaction.
- The cycle-to-pipeline linking uses a nullable `pipeline_run_id` column added via idempotent migration -- good backwards compatibility.
- `pipeline_runs.cycle_id` has UNIQUE constraint and `ON DELETE CASCADE` FK -- good referential integrity at the DB level.

### Recommendations for Next Audit
- After CHAOS-017/018/019 fixes: re-test stage 5 completion with incomplete tickets to confirm atomicity.
- Test concurrent pipeline stage completions (two agents complete same stage simultaneously).
- Test what happens if pipeline_runs table is manually corrupted (e.g., status set to invalid value).
- Verify that the PipelineStepper frontend component handles edge states gracefully (failed pipeline, null stages).
