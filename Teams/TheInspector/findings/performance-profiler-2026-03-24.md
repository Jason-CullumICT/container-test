# Performance Profiler Findings -- 2026-03-24

## Mode: hybrid (static + dynamic)

## Summary

Pipeline orchestration introduces 7 new performance findings. The N+1 query pattern in listPipelineRuns, missing indexes on pipeline tables, and unbatched writes in createPipelineRun are the most significant. Dynamic latency measurements show all endpoints pass budgets at current small dataset, but structural issues will degrade with data growth. All 15 prior findings remain open (1 compounded by pipeline cascade).

## Latency Baselines (Dynamic)

| Endpoint | p50 (ms) | p95 (ms) | p99 (ms) | Budget (ms) | Status |
|----------|----------|----------|----------|-------------|--------|
| GET /api/pipeline-runs | 1.30 | 1.99 | 1.99 | 500 | PASS |
| GET /api/pipeline-runs/:id | 1.45 | 2.05 | 2.05 | 200 | PASS |
| GET /api/cycles/:id/pipeline | 1.43 | 1.87 | 1.87 | 200 | PASS |
| POST stages/:n/start | ~1.9 | ~2.2 | ~2.2 | 200 | PASS |
| POST stages/1-4/complete | ~2.0 | ~2.5 | ~2.5 | 200 | PASS |
| POST stages/5/complete (cascade) | ~3.8 | ~3.8 | ~3.8 | 200 | PASS |

## New Findings

### PERF-016: N+1 Query in listPipelineRuns (P2)
- **Category:** N+1
- **File:** `Source/Backend/src/services/pipelineService.ts:174`
- **Description:** Fetches all runs then calls getStagesForRun per run in .map(). N+1 queries.
- **Recommendation:** Use JOIN query or batch with WHERE IN.

### PERF-017: Missing Indexes on Pipeline Tables (P1)
- **Category:** Missing Index
- **File:** `Source/Backend/src/database/schema.ts:102-130`
- **Description:** No indexes on pipeline_stages.pipeline_run_id or pipeline_runs.status.
- **Recommendation:** Add CREATE INDEX statements.

### PERF-018: createPipelineRun 7 INSERTs Without Batching (P3)
- **Category:** Unbatched Writes
- **File:** `Source/Backend/src/services/pipelineService.ts:120-156`
- **Recommendation:** Wrap in transaction, use multi-row INSERT.

### PERF-019: Double-Read in startStage/completeStageAction (P3)
- **Category:** Redundant Read
- **File:** `Source/Backend/src/services/pipelineService.ts:201-228, 241-308`
- **Recommendation:** Return constructed object instead of re-reading.

### PERF-020: getCyclePipelineHandler Redundant Cycle Check (P4)
- **Category:** Redundant Read
- **File:** `Source/Backend/src/routes/pipelines.ts:115-136`
- **Recommendation:** Remove getCycleById call.

### PERF-021: POST /api/cycles Creates Then Re-Reads Twice (P3)
- **Category:** Redundant Read
- **File:** `Source/Backend/src/routes/cycles.ts:41-68`
- **Recommendation:** Set pipeline_run_id on in-memory object.

### PERF-022: listPipelineRuns No Pagination (P2)
- **Category:** Unbounded Query
- **File:** `Source/Backend/src/services/pipelineService.ts:162-175`
- **Recommendation:** Add LIMIT/OFFSET and PaginatedResponse.

## Re-Verification of Prior Findings

| ID | Title | Status |
|----|-------|--------|
| PERF-001 | N+1 in listFeatureRequests | STILL OPEN |
| PERF-002 | N+1 in listCycles | STILL OPEN |
| PERF-003 | Missing FK indexes (all tables) | STILL OPEN |
| PERF-004 | Unbounded list queries | STILL OPEN |
| PERF-005 | Dashboard activity full-scan | STILL OPEN |
| PERF-006 | O(N) Jaccard duplicate detection | STILL OPEN |
| PERF-007 | Redundant double reads | STILL OPEN |
| PERF-008 | Sync fs calls in getDb() | STILL OPEN |
| PERF-009 | Triple read in PATCH handlers | STILL OPEN |
| PERF-010 | createCycle full row fetch | STILL OPEN |
| PERF-011 | LIKE without FTS | STILL OPEN |
| PERF-012 | In-memory sort in createCycle | STILL OPEN |
| PERF-013 | Frontend no deduplication | STILL OPEN |
| PERF-014 | deleteFeatureRequest loads full entity | STILL OPEN |
| PERF-015 | completeCycle cascading reads | COMPOUNDED |

## Cross-References
- [CROSS-REF: chaos-monkey] PERF-018 / CHAOS-019: non-transactional writes
- [CROSS-REF: quality-oracle] PERF-022: violates PaginatedResponse pattern
