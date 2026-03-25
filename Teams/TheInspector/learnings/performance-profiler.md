# Performance Profiler Learnings -- TheInspector Audit

**Last updated:** 2026-03-23
**Audit count:** 2 (both static mode)
**Profiler model:** claude-opus-4-6 (1M context)

---

## Key Discoveries

### 1. N+1 Query Pattern Is Pervasive (High Severity)

The project uses a "fetch all rows, then loop to fetch child rows" pattern in multiple list endpoints. This is the classic N+1 anti-pattern in SQLite.

- `listFeatureRequests` (featureRequestService.ts:152): Fetches N feature request rows then calls `getVotesForFR` once per row -- N+1 queries for votes.
- `listCycles` (cycleService.ts:143): Fetches N cycle rows then calls `getTicketsForCycle` once per row -- N+1 queries for tickets.
- `updateTicket` (cycleService.ts:311): Calls `getCycleById` to validate the cycle, which internally fetches tickets. Then it queries the specific ticket separately. Redundant double-fetch on the cycle-with-tickets sub-query.
- `updateCycle` (cycleService.ts:226): Calls `getCycleById` (which loads all tickets) just to check cycle existence before updating.

**Fix pattern:** Use a single JOIN query or batch the child queries using `WHERE parent_id IN (...)`.

### 2. All List Endpoints Are Unbounded

Every list endpoint returns every row in the table with no LIMIT. There is no pagination on:
- `GET /api/feature-requests`
- `GET /api/bugs`
- `GET /api/cycles` (also loads N tickets per cycle)
- `GET /api/learnings`
- `GET /api/features`

The dashboard activity feed (`getDashboardActivity`) is the only endpoint with a cap (200 rows), but its implementation fetches ALL rows from ALL six tables into memory, builds a combined array (potentially thousands of entries), sorts them in JavaScript, then slices. As data grows, this will be the single worst-performing endpoint.

### 3. Missing Database Indexes on Foreign Keys and Filtered Columns

The schema has zero explicit indexes. SQLite only auto-indexes PRIMARY KEY columns. Every foreign key lookup and WHERE clause filter performs a full table scan.

Missing indexes:
- `votes.feature_request_id` -- used in every `getVotesForFR` call
- `tickets.cycle_id` -- used in every `getTicketsForCycle` call
- `learnings.cycle_id` -- used as an optional filter
- `feature_requests.status` -- used as a filter in `listFeatureRequests` and in `createCycle`
- `feature_requests.source` -- used as a filter in `listFeatureRequests`
- `bugs.status` -- used as a filter in `listBugs` and in `createCycle`
- `bugs.severity` -- used as a filter in `listBugs`
- `cycles.status` -- used in createCycle active-cycle check and dashboard summary

### 4. O(N) Duplicate Detection on Every Create

`createFeatureRequest` (featureRequestService.ts:187) loads ALL feature request titles from the database into memory and computes Jaccard similarity against each one in a JavaScript loop. This is O(N) computation in the request handler with no early exit beyond the first match. At 10,000 records this becomes expensive.

### 5. Redundant Double Reads on Write Operations

Multiple write operations follow the "read-validate-write-read-again" pattern:
- `createFeatureRequest` ends with `return getFeatureRequestById(db, id)!` -- a SELECT after INSERT that could use the already-known inserted data.
- `createBug` ends with `return getBugById(db, id)!` -- same pattern.
- `createTicket` ends with `db.prepare(...SELECT...WHERE id = ?).get(id)` -- redundant SELECT after INSERT.
- `approveFeatureRequest`, `denyFeatureRequest`, `voteOnFeatureRequest` all call `getFeatureRequestById` (which also runs the votes SELECT) at the end after having just written.
- `updateBug` calls `getBugById(db, id)` at the start AND at the end.
- `updateCycle`, `updateFeatureRequest`, `updateTicket` follow the same double-fetch pattern.

### 6. Synchronous fs.existsSync / fs.mkdirSync in Connection Initialization

`getDb()` (connection.ts:14-16) calls `require('fs')`, `fs.existsSync`, and `fs.mkdirSync` synchronously on every first call to get the database. While this is typically a one-time cost, it uses `require()` inside a function body -- blocking the event loop.

### 7. ID Generation Now Uses ROWID DESC LIMIT 1 (Fixed)

**Previously:** All ID generators used `SELECT COUNT(*) as cnt FROM table` -- O(N) and race-condition prone.
**Now:** ID generators use `SELECT id FROM table ORDER BY ROWID DESC LIMIT 1` -- O(1) with SQLite's ROWID index. Still has a minor race condition under concurrent inserts but is much more performant. This was fixed between audits.

### 8. Dashboard Activity Endpoint: Full Table Scans Across Six Tables

`getDashboardActivity` (dashboardService.ts:72-227) issues 6 unbounded SELECT queries (feature_requests, bugs, cycles, tickets, learnings, features), materialises all rows into a JavaScript array, sorts in memory, then slices. The `ORDER BY` clauses in each sub-query are wasted work since results are merged and re-sorted anyway.

### 9. Route Handlers Duplicate Service-Layer Existence Checks (New)

PATCH route handlers for feature-requests, bugs, and cycles call `getById` before delegating to the service `update` function, which also calls `getById` internally. This creates a triple-read pattern (route check + service start + service end) that wastes 2 extra queries per PATCH request.

### 10. completeCycle Is the Most Query-Heavy Single Endpoint (New)

`completeCycle` (cycleService.ts:375-447) executes 10+ queries in a single request: getCycleById (with N+1 tickets), work item title lookup, cycle update, feature create (with re-read), learning create (with re-read), work item status update, optional bug create (with re-read), and final getCycleById (another N+1). This is the most latency-risky endpoint in the application.

### 11. Frontend Has No Request Deduplication (New)

The frontend API client (`client.ts`) is a thin fetch wrapper with no caching, deduplication, or stale-while-revalidate. Multiple components hitting the same endpoint simultaneously will each trigger independent HTTP requests.

---

## General Architecture Observations

- `better-sqlite3` is synchronous by design; the async/await wrappers in route handlers add overhead without benefit (the library does not benefit from `await`).
- WAL mode is correctly enabled -- good for concurrent reads.
- Foreign keys ON is correctly enabled -- good for integrity.
- The connection module correctly uses a singleton pattern -- no connection leak risk.

---

## Remediation Priority

| Priority | Finding | File |
|----------|---------|------|
| P1 | Missing FK indexes (votes, tickets, cycles.status) | schema.ts |
| P1 | N+1 queries in listFeatureRequests and listCycles | featureRequestService.ts, cycleService.ts |
| P1 | Dashboard activity full-scan + in-memory sort | dashboardService.ts |
| P2 | Unbounded list queries -- all list endpoints | all service files |
| P2 | O(N) Jaccard duplicate detection on every FR create | featureRequestService.ts |
| P2 | completeCycle cascading query chain | cycleService.ts |
| P3 | Redundant double/triple reads on writes | all service/route files |
| P3 | Frontend request deduplication | client.ts |
| P3 | LIKE search without FTS index | featureService.ts |
| P4 | Synchronous fs calls inside getDb() | connection.ts |
| P4 | In-memory sort in createCycle | cycleService.ts |

---

## Audit History

| Date | Mode | Findings | P1 | P2 | P3 | P4 | Fixed Since Prior |
|------|------|----------|----|----|----|----|-------------------|
| 2026-03-23 (first) | Static | 8 | 3 | 2 | 2 | 1 | N/A |
| 2026-03-23 (second) | Static | 15 | 4 | 3 | 5 | 3 | 1 (COUNT(*) ID gen) |
| 2026-03-24 (third) | Hybrid | 22 | 1 | 3 | 3 | 1 | 0 |
| 2026-03-25 (fourth) | Static | 12 | 1 | 4 | 5 | 2 | 0 |

## Third Audit: 2026-03-24

### New Pipeline-Specific Findings
- PERF-016 (P2): N+1 in listPipelineRuns — getStagesForRun per run in .map()
- PERF-017 (P1): Missing indexes on pipeline_stages.pipeline_run_id and pipeline_runs.status
- PERF-018 (P3): createPipelineRun 7 INSERTs without batching/transaction
- PERF-019 (P3): Double-read in startStage/completeStageAction
- PERF-020 (P4): getCyclePipelineHandler redundant cycle existence check
- PERF-021 (P3): POST /cycles creates then re-reads twice (cycle + pipeline)
- PERF-022 (P2): listPipelineRuns has no pagination

### Dynamic Latency (Small Dataset)
All pipeline endpoints pass budgets. Stage-5 cascade ~3.8ms (includes completeCycle chain).

All 15 prior findings STILL OPEN (1 compounded: PERF-015 now stacks with pipeline stage-5 cascade).

## Fourth Audit: 2026-03-25 (Image Upload Feature)

### New Image-Feature-Specific Findings
- PERF-023 (P1): N+1 ID generation — `generateImageId()` called once per file inside transaction loop in `imageService.ts:80-95`. Also uses lexicographic ORDER BY on `IMG-NNNN` TEXT IDs which corrupts under concurrent inserts.
- PERF-024 (P2): Sync `fs.existsSync`+`fs.mkdirSync` at module load in `upload.ts:16-18`. Second `UPLOAD_DIR` constant in `imageService.ts:14` duplicates the path.
- PERF-025 (P2): Sync `fs.existsSync`+`fs.unlinkSync` in request handler path (`imageService.ts:134-138`). Blocks event loop on every DELETE image request. Fix: use `fs.promises.unlink`.
- PERF-026 (P2): Double DB read on image upload POST — existence check fires full `getBugById`/`getFeatureRequestById` before multer streams files. FR variant fires votes sub-query too.
- PERF-027 (P2): `express.static('/uploads')` has no `maxAge` or `immutable` headers. Every image re-validates per request. Fix: `{ maxAge: '7d', immutable: true }`.
- PERF-028 (P3): `SELECT *` in `deleteImage` fetches full row when only filename+entity fields needed.
- PERF-029 (P3): Frontend `BugDetail`/`FeatureRequestDetail` re-fetch image list after upload instead of using the response body directly.
- PERF-030 (P3): `handleSubmitToOrchestrator` downloads all attached images serially in a `for...of` loop before POSTing. Use `Promise.all` for parallel fetches.
- PERF-031 (P3): No image compression/resize post-processing. Full-resolution files served at thumbnail display sizes. No `sharp` or equivalent in deps.
- PERF-032 (P3): `listImages` has no LIMIT — unbounded result set despite having the composite index.
- PERF-033 (P4): `imageUploadsCounter` tracks count only, not bytes or duration. No upload size/latency histogram.
- PERF-034 (P4): `metricsMiddleware` uses raw `req.path` for static file routes → unbounded label cardinality for `/uploads/:filename`.

### Key Pattern Notes
- The `image_attachments` composite index `(entity_id, entity_type)` is correctly created — good.
- All 22 prior findings remain STILL OPEN going into this audit.
- The upload feature correctly uses `multer.diskStorage` (not memory storage) — avoids RAM exhaustion.
- File size limit (5 MB) and file count limit (5) are correctly set in multer config.
