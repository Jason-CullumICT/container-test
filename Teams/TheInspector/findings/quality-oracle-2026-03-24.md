# Quality Oracle Findings -- 2026-03-24

## Mode: static

## Summary

Third audit covering pipeline orchestration (FR-033 through FR-049). 17 new FRs implemented with 86 new test cases (429 total across 18 files). All implemented pipeline FRs have test traceability. However, 6 of 17 pipeline FRs lack formal `// Verifies: FR-XXX` source traceability, and the traceability enforcer's requirements file has not been updated to include FR-033 through FR-049. All 5 prior findings remain open. Spec coverage at 79.6% formal source traceability, 100% test traceability.

## Spec Coverage
- Total FRs in spec: 49 (32 original + 17 pipeline)
- FRs with formal `// Verifies:` source traceability: 39 of 49 (79.6%)
- FRs with test traceability: 49 of 49 (100%)
- Traceability enforcer result: PASS (only checks 32 of 49 FRs)
- Test cases: 429 total (319 backend + 110 frontend)

## New Findings

### QUAL-006: Traceability Enforcer Requirements File Outdated (P2)
- **Rule violated:** Specs are source of truth
- **File:** `Plans/dev-workflow-platform/requirements.md`
- **Description:** Enforcer only checks FR-001 through FR-032. FR-033 through FR-049 missing.
- **Recommendation:** Add FR-033 through FR-049 to requirements file.

### QUAL-007: Six Pipeline FRs Lack Formal Verifies Comments (P3)
- **Rule violated:** Every FR needs `// Verifies: FR-XXX` traceability comments
- **Files:** types.ts (FR-033), api.ts (FR-034), schema.ts (FR-035), cycleService.ts (FR-039), cycles.ts (FR-041), dashboardService.ts (FR-042)
- **Description:** These FRs have informal inline comments but not the formal pattern.
- **Recommendation:** Add formal `// Verifies:` comments.

### QUAL-008: Pipeline Service Imports from Middleware Layer (P3)
- **Rule violated:** Business logic has no framework imports
- **File:** `Source/Backend/src/services/pipelineService.ts:19`
- **Description:** Imports `pipelineStageCompletionsCounter` from middleware/metrics (framework module).
- **Recommendation:** Extract counter definitions into lib/metrics.ts.

### QUAL-009: pipelines.test.ts Exceeds 500-Line Guideline (P4)
- **Rule violated:** File size guideline
- **File:** `Source/Backend/tests/pipelines.test.ts` (1010 lines)
- **Description:** Only file in codebase exceeding 500 lines.
- **Recommendation:** Split by concern.

## Re-Verification of Prior Findings

| ID | Title | Status | Evidence |
|----|-------|--------|----------|
| QUAL-001 | Route handlers call getDb() | STILL OPEN | All 7 route files including pipelines.ts |
| QUAL-002 | Services import AppError | STILL OPEN | All 6 service files including pipelineService.ts |
| QUAL-003 | Duplicate type definitions | STILL OPEN | Same 9 duplicated types |
| QUAL-004 | Silent OTEL init failure | STILL OPEN | tracing.ts:36-38 still silent |
| QUAL-005 | ESLint suppressions undocumented | STILL OPEN | Same 2 suppressions |

## Cross-References
- [CROSS-REF: red-teamer] Pipeline service imports from middleware (QUAL-008) compounds QUAL-002
- [CROSS-REF: performance-profiler] getDb() in route handlers (QUAL-001) enables direct DB access pattern
