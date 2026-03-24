# Performance Profiler Findings

**Date:** 2026-03-23
**Mode:** STATIC (backend is down, no load testing)
**Profiler:** performance-profiler (claude-opus-4-6)
**Files Analyzed:** 7 service files, 6 route files, 1 schema file, 1 connection file, 1 frontend API client

---

## Re-Verification of Prior Findings

| Prior Finding | Status | Notes |
|---------------|--------|-------|
| N+1 in listFeatureRequests | **STILL OPEN** | featureRequestService.ts:152 still loops getVotesForFR per row |
| N+1 in listCycles | **STILL OPEN** | cycleService.ts:143 still loops getTicketsForCycle per row |
| All list endpoints unbounded | **STILL OPEN** | No LIMIT on any list query in any service |
| Missing FK indexes | **STILL OPEN** | schema.ts still has zero explicit indexes |
| O(N) Jaccard duplicate detection | **STILL OPEN** | featureRequestService.ts:187 still loads all titles |
| Redundant double reads on writes | **STILL OPEN** | All create/update methods still re-SELECT after INSERT/UPDATE |
| COUNT(*) ID generation | **FIXED** | ID generation now uses `ORDER BY ROWID DESC LIMIT 1` instead of COUNT(*) |
| Synchronous fs calls in getDb() | **STILL OPEN** | connection.ts:14-16 still uses require('fs') + existsSync + mkdirSync |
| Dashboard activity full-scan | **STILL OPEN** | dashboardService.ts:72-227 still fetches all rows from 6 tables |

---

## Findings

### PERF-001: N+1 Query Pattern in listFeatureRequests
- **Severity:** P1
- **Category:** n-plus-1
- **File:** `Source/Backend/src/services/featureRequestService.ts:152`
- **Detail:** `listFeatureRequests` fetches all feature_request rows then calls `getVotesForFR(db, row.id)` once per row in a `.map()`. For N feature requests, this executes N+1 queries. With 100 FRs, this is 101 SELECT statements per list call.
- **Recommendation:** Replace with a single JOIN query (`SELECT fr.*, v.* FROM feature_requests fr LEFT JOIN votes v ON v.feature_request_id = fr.id`) or batch the votes query using `WHERE feature_request_id IN (...)` after collecting all IDs. Expected improvement: O(1) queries instead of O(N).
- **Cross-ref:** [CROSS-REF: schema-auditor] (missing index on votes.feature_request_id compounds this)
- **Re-verification:** STILL OPEN from prior audit

### PERF-002: N+1 Query Pattern in listCycles
- **Severity:** P1
- **Category:** n-plus-1
- **File:** `Source/Backend/src/services/cycleService.ts:143`
- **Detail:** `listCycles` fetches all cycle rows then calls `getTicketsForCycle(db, row.id)` once per row. For N cycles, this is N+1 queries. This compounds with PERF-001 since the dashboard activity feed also queries tickets indirectly.
- **Recommendation:** Use a single JOIN query or batch tickets query with `WHERE cycle_id IN (...)`. Expected improvement: O(1) queries instead of O(N).
- **Cross-ref:** [CROSS-REF: schema-auditor] (missing index on tickets.cycle_id compounds this)
- **Re-verification:** STILL OPEN from prior audit

### PERF-003: Missing Database Indexes on Foreign Keys
- **Severity:** P1
- **Category:** missing-index
- **File:** `Source/Backend/src/database/schema.ts`
- **Detail:** The schema defines zero explicit indexes. SQLite auto-indexes only PRIMARY KEY columns. Every foreign key lookup and filtered query performs a full table scan. Missing indexes:
  - `votes.feature_request_id` -- used in every `getVotesForFR` call (PERF-001)
  - `tickets.cycle_id` -- used in every `getTicketsForCycle` call (PERF-002)
  - `learnings.cycle_id` -- used as optional filter in listLearnings
  - `feature_requests.status` -- used in listFeatureRequests filter and createCycle work item selection
  - `feature_requests.source` -- used in listFeatureRequests filter
  - `bugs.status` -- used in listBugs filter and createCycle work item selection
  - `bugs.severity` -- used in listBugs filter
  - `cycles.status` -- used in createCycle active-cycle check and dashboard summary
- **Recommendation:** Add `CREATE INDEX IF NOT EXISTS` statements for all columns listed above. The FK indexes (votes.feature_request_id, tickets.cycle_id) are the highest priority as they affect every N+1 query execution.
- **Cross-ref:** [CROSS-REF: schema-auditor]
- **Re-verification:** STILL OPEN from prior audit

### PERF-004: Unbounded List Queries -- All List Endpoints
- **Severity:** P2
- **Category:** unbounded
- **Files:**
  - `Source/Backend/src/services/featureRequestService.ts:150` -- `listFeatureRequests` has no LIMIT
  - `Source/Backend/src/services/bugService.ts:69` -- `listBugs` has no LIMIT
  - `Source/Backend/src/services/cycleService.ts:142` -- `listCycles` has no LIMIT
  - `Source/Backend/src/services/learningService.ts:63` -- `listLearnings` has no LIMIT
  - `Source/Backend/src/services/featureService.ts:57` -- `listFeatures` has no LIMIT
- **Detail:** Every list endpoint returns all rows from its table with no pagination. The CLAUDE.md architecture rules require paginated list endpoints to return `PaginatedResponse<T>` with `{data, page, limit, total, totalPages}`, but none of these endpoints implement pagination. As data grows, response payload sizes grow without bound, increasing serialization time, memory usage, and network transfer time.
- **Recommendation:** Add `LIMIT ? OFFSET ?` to all list queries, accept `page` and `limit` query parameters in routes, and return `PaginatedResponse<T>` wrappers. Default limit of 50 with a max of 200.
- **Cross-ref:** [CROSS-REF: api-contract-auditor] (violates documented PaginatedResponse pattern)
- **Re-verification:** STILL OPEN from prior audit

### PERF-005: Dashboard Activity Feed -- Full Table Scans Across Six Tables
- **Severity:** P1
- **Category:** unbounded
- **File:** `Source/Backend/src/services/dashboardService.ts:72-227`
- **Detail:** `getDashboardActivity` issues 6 unbounded SELECT queries across all tables (feature_requests, bugs, cycles, tickets, learnings, features), materializes ALL rows into a JavaScript array, potentially doubling entries (created + updated events), sorts the entire array in memory with `activities.sort()`, then slices to the requested limit. For a database with 1,000 rows across tables, this could build an array of ~2,000 ActivityItem objects, sort them all, then return 20. The `ORDER BY` clauses in each sub-query are wasted work since results are merged and re-sorted anyway.
- **Recommendation:** Use a UNION ALL query with LIMIT applied at the SQL level, or at minimum add per-table LIMIT clauses (e.g., `LIMIT 200` per sub-query) to cap the in-memory array size. Better: use a single SQL query with `UNION ALL` of the 6 tables, `ORDER BY timestamp DESC LIMIT ?` to push sorting to SQLite.
- **Re-verification:** STILL OPEN from prior audit

### PERF-006: O(N) Jaccard Similarity Duplicate Detection on Every FR Create
- **Severity:** P2
- **Category:** algorithmic
- **File:** `Source/Backend/src/services/featureRequestService.ts:187-194`
- **Detail:** `createFeatureRequest` loads ALL feature request titles (`SELECT id, title FROM feature_requests`) into memory and computes Jaccard similarity against each one in a loop. This is O(N) computation on every create, in the hot path of the request handler. At 10,000 feature requests, this loop runs 10,000 iterations with string splitting and set operations.
- **Recommendation:** Either (a) precompute trigram/word hashes and store in a lookup table for O(1) checks, (b) use SQLite FTS5 for similarity searches, or (c) limit the comparison to recent FRs only (e.g., last 100) with `LIMIT 100 ORDER BY created_at DESC`. At minimum, add `LIMIT 500` to the existing query.
- **Re-verification:** STILL OPEN from prior audit

### PERF-007: Redundant Double Reads on Write Operations
- **Severity:** P3
- **Category:** latency-budget
- **Files:**
  - `Source/Backend/src/services/featureRequestService.ts:206` -- createFeatureRequest re-reads after INSERT
  - `Source/Backend/src/services/featureRequestService.ts:282` -- updateFeatureRequest reads at start AND re-reads at end
  - `Source/Backend/src/services/featureRequestService.ts:319` -- approveFeatureRequest reads at start AND re-reads at end
  - `Source/Backend/src/services/featureRequestService.ts:347` -- denyFeatureRequest reads at start AND re-reads at end
  - `Source/Backend/src/services/featureRequestService.ts:386` -- voteOnFeatureRequest reads at start AND re-reads at end
  - `Source/Backend/src/services/bugService.ts:98` -- createBug re-reads after INSERT
  - `Source/Backend/src/services/bugService.ts:115-165` -- updateBug reads at start AND re-reads at end
  - `Source/Backend/src/services/cycleService.ts:217` -- createCycle re-reads after INSERT (which also triggers N+1 for tickets)
  - `Source/Backend/src/services/cycleService.ts:226,271` -- updateCycle reads at start AND re-reads at end
  - `Source/Backend/src/services/cycleService.ts:283,294-295` -- createTicket reads full cycle (with all tickets) just to check existence, then re-reads ticket
  - `Source/Backend/src/services/cycleService.ts:311-312,363-364` -- updateTicket reads full cycle (with all tickets) to validate, then re-reads ticket
  - `Source/Backend/src/services/cycleService.ts:380,446` -- completeCycle reads cycle at start AND re-reads at end
  - `Source/Backend/src/services/learningService.ts:89` -- createLearning re-reads after INSERT
  - `Source/Backend/src/services/featureService.ts:79` -- createFeature re-reads after INSERT
- **Detail:** Almost every write operation follows a "read-validate-write-read" pattern. The initial read is needed for validation, but the final re-read is wasteful -- the function already knows the data it just wrote. Each `getFeatureRequestById` call also triggers a sub-query for votes (PERF-001), so the cost is amplified. For `createTicket`, calling `getCycleById` loads the full cycle with all its tickets just to verify the cycle exists, when a simple `SELECT id FROM cycles WHERE id = ?` would suffice.
- **Recommendation:** (a) Return the constructed object directly from known insert data instead of re-reading; (b) For existence checks, use `SELECT 1 FROM table WHERE id = ? LIMIT 1` instead of loading the full entity with children.
- **Re-verification:** STILL OPEN from prior audit

### PERF-008: Synchronous fs Calls in getDb()
- **Severity:** P4
- **Category:** synchronous-io
- **File:** `Source/Backend/src/database/connection.ts:14-16`
- **Detail:** `getDb()` uses `require('fs')` (synchronous CommonJS require inside function body), `fs.existsSync()`, and `fs.mkdirSync()`. While this is a one-time initialization cost (singleton pattern), the use of `require()` inside a function body blocks the event loop if called on a cold path after server startup. Additionally, `better-sqlite3` operations are synchronous by design, so the async/await wrappers in route handlers add microtask overhead without benefit.
- **Recommendation:** Move `require('fs')` to a top-level import. Use `import fs from 'fs'`. The sync filesystem calls are acceptable for one-time init but should use the import statement at module top.
- **Re-verification:** STILL OPEN from prior audit

### PERF-009: Triple Read in Route Handler for PATCH /api/feature-requests/:id
- **Severity:** P3
- **Category:** latency-budget
- **File:** `Source/Backend/src/routes/featureRequests.ts:91-118`
- **Detail:** The PATCH route handler calls `getFeatureRequestById(db, id)` to check existence (line 98), then calls `updateFeatureRequest(db, id, ...)` which internally calls `getFeatureRequestById` again at the start (featureRequestService.ts:229), and again at the end (line 282). That is 3 full reads of the same entity (each including a sub-query for votes) in a single PATCH request. The same pattern exists for PATCH /api/bugs/:id (routes/bugs.ts:97-98 + bugService.ts:116,165) and PATCH /api/cycles/:id (routes/cycles.ts:88-89 + cycleService.ts:226,271).
- **Recommendation:** Remove the existence check from the route handler since the service layer already performs it. This eliminates one full read per PATCH request.
- **Cross-ref:** [CROSS-REF: code-quality-auditor] (DRY violation)

### PERF-010: createCycle Fetches Full Rows When Only ID/Title/Severity Needed
- **Severity:** P3
- **Category:** large-payload
- **File:** `Source/Backend/src/services/cycleService.ts:165-198`
- **Detail:** `createCycle` runs `SELECT * FROM bugs WHERE status = 'triaged'` and `SELECT * FROM feature_requests WHERE status = 'approved'` to find work items. Both queries fetch all columns (including potentially large `description` fields) when only `id`, `title`, and `severity`/`priority` are needed. The rows are then sorted in JavaScript rather than in SQL.
- **Recommendation:** Change to `SELECT id, title, severity FROM bugs WHERE status = 'triaged' ORDER BY CASE severity WHEN 'critical' THEN 4 ... END DESC LIMIT 1` to let SQLite do the sort and only return the winning row.

### PERF-011: Features Search Uses LIKE Without Index
- **Severity:** P3
- **Category:** missing-index
- **File:** `Source/Backend/src/services/featureService.ts:49-53`
- **Detail:** `listFeatures` with a search query uses `LIKE '%term%'` on both `title` and `description` columns. LIKE with a leading wildcard cannot use a standard B-tree index, resulting in a full table scan on every search request. This is unbounded (no LIMIT) and scans the entire `features` table.
- **Recommendation:** Use SQLite FTS5 for text search, or at minimum add a LIMIT to cap results. For small datasets this is acceptable, but as features grow this becomes a performance bottleneck.

### PERF-012: In-Memory Sort in createCycle
- **Severity:** P4
- **Category:** algorithmic
- **File:** `Source/Backend/src/services/cycleService.ts:177,195`
- **Detail:** `createCycle` fetches all triaged bugs or approved FRs, then sorts them in JavaScript by severity/priority. This should be done at the SQL level with `ORDER BY` to avoid loading unnecessary rows into memory.
- **Recommendation:** Use `ORDER BY CASE severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 END DESC LIMIT 1` in SQL to return only the single highest-priority row.

### PERF-013: Frontend Client Has No Request Deduplication or Caching
- **Severity:** P3
- **Category:** large-payload
- **File:** `Source/Frontend/src/api/client.ts`
- **Detail:** The frontend API client (`apiFetch`) makes raw `fetch()` calls with no request deduplication, caching, or stale-while-revalidate strategy. If multiple React components call the same list endpoint simultaneously (e.g., on dashboard load), each triggers a separate HTTP request. Combined with the unbounded list endpoints (PERF-004), this multiplies network and backend load.
- **Recommendation:** Integrate a caching layer such as React Query (TanStack Query) or SWR for automatic request deduplication, caching, and background refresh. This is a frontend concern but directly impacts perceived latency and backend load.
- **Cross-ref:** [CROSS-REF: frontend-auditor]

### PERF-014: deleteFeatureRequest Loads Full Entity Just to Check Existence
- **Severity:** P4
- **Category:** latency-budget
- **File:** `Source/Backend/src/services/featureRequestService.ts:286-287`
- **Detail:** `deleteFeatureRequest` calls `getFeatureRequestById(db, id)` which loads the full feature request row plus all its votes, just to verify the entity exists before deleting. A simple `SELECT 1 FROM feature_requests WHERE id = ?` would suffice.
- **Recommendation:** Replace the full read with an existence check: `const exists = db.prepare('SELECT 1 FROM feature_requests WHERE id = ? LIMIT 1').get(id)`.

### PERF-015: completeCycle Triggers Cascading Reads and Writes
- **Severity:** P2
- **Category:** latency-budget
- **File:** `Source/Backend/src/services/cycleService.ts:375-447`
- **Detail:** `completeCycle` performs a heavy sequence of operations: (1) `getCycleById` which loads cycle + all tickets via N+1 (PERF-002), (2) filters tickets in JS, (3) queries work item title, (4) in a transaction: updates cycle, creates Feature (which re-reads after insert), creates Learning (which re-reads after insert), updates work item status, optionally creates Bug (which re-reads after insert), (5) calls `getCycleById` again at the end (another N+1). This single endpoint could execute 10+ queries. Under the p95=500ms default budget, this is at risk.
- **Recommendation:** Consolidate reads. Use the ticket data already loaded (don't re-read). Skip the final `getCycleById` by constructing the return object from known state. Use batch inserts where possible.

---

## Summary Table

| ID | Severity | Category | Status | File(s) |
|----|----------|----------|--------|---------|
| PERF-001 | P1 | n-plus-1 | STILL OPEN | featureRequestService.ts |
| PERF-002 | P1 | n-plus-1 | STILL OPEN | cycleService.ts |
| PERF-003 | P1 | missing-index | STILL OPEN | schema.ts |
| PERF-004 | P2 | unbounded | STILL OPEN | all service files |
| PERF-005 | P1 | unbounded | STILL OPEN | dashboardService.ts |
| PERF-006 | P2 | algorithmic | STILL OPEN | featureRequestService.ts |
| PERF-007 | P3 | latency-budget | STILL OPEN | all service files |
| PERF-008 | P4 | synchronous-io | STILL OPEN | connection.ts |
| PERF-009 | P3 | latency-budget | NEW | routes/featureRequests.ts, routes/bugs.ts, routes/cycles.ts |
| PERF-010 | P3 | large-payload | NEW | cycleService.ts |
| PERF-011 | P3 | missing-index | NEW | featureService.ts |
| PERF-012 | P4 | algorithmic | NEW | cycleService.ts |
| PERF-013 | P3 | large-payload | NEW | client.ts |
| PERF-014 | P4 | latency-budget | NEW | featureRequestService.ts |
| PERF-015 | P2 | latency-budget | NEW | cycleService.ts |

---

## Latency Budget Risk Assessment (Static Estimate)

| Endpoint | Budget (p95) | Risk Level | Key Bottlenecks |
|----------|-------------|------------|-----------------|
| `GET /api/feature-requests` | 500ms | HIGH | N+1 votes (PERF-001), no LIMIT (PERF-004), no FK index (PERF-003) |
| `GET /api/cycles` | 500ms | HIGH | N+1 tickets (PERF-002), no LIMIT (PERF-004), no FK index (PERF-003) |
| `GET /api/dashboard/activity` | 500ms | CRITICAL | 6 full-table scans + in-memory sort (PERF-005) |
| `POST /api/feature-requests` | 500ms | MEDIUM | O(N) Jaccard scan (PERF-006), double read (PERF-007) |
| `POST /api/cycles/:id/complete` | 500ms | HIGH | Cascading reads/writes, 10+ queries (PERF-015) |
| `PATCH /api/feature-requests/:id` | 500ms | MEDIUM | Triple read (PERF-009), votes sub-queries |
| `GET /api/bugs` | 500ms | LOW | No LIMIT but no N+1 |
| `GET /api/learnings` | 500ms | LOW | No LIMIT but no N+1 |
| `GET /api/features` | 500ms | LOW-MEDIUM | LIKE scan without index (PERF-011) when search query provided |
| `GET /api/dashboard/summary` | 500ms | LOW | Efficient GROUP BY queries |

---

```json
{
  "audit_date": "2026-03-23",
  "mode": "static",
  "total_findings": 15,
  "by_severity": {
    "P1": 4,
    "P2": 3,
    "P3": 5,
    "P4": 3
  },
  "by_category": {
    "n-plus-1": 2,
    "missing-index": 2,
    "unbounded": 2,
    "algorithmic": 2,
    "latency-budget": 4,
    "synchronous-io": 1,
    "large-payload": 2
  },
  "re_verification": {
    "still_open": 8,
    "fixed": 1,
    "regressed": 0,
    "new": 7
  },
  "files_analyzed": 15,
  "endpoints_at_risk": {
    "critical": 1,
    "high": 3,
    "medium": 2,
    "low": 4
  }
}
```
