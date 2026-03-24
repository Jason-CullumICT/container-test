# Quality Oracle Learnings — Updated 2026-03-23 (Second Audit)

## Audit Summary

Second audit of the Development Workflow Platform (Node.js/Express/TypeScript backend, React/Vite/Tailwind frontend, SQLite).

## Spec Coverage Trend

- **First audit: 96.9%** (31/32 FRs traced to source; 30/32 tested)
- **Second audit: 100%** (32/32 FRs traced to source; 32/32 tested)
- FR-032 gap was **FIXED** — 4 frontend test files now carry `// Verifies: FR-032` comments.
- Coverage is improving.

## Useful File Paths (for faster future audits)

| Path | Purpose |
|------|---------|
| `Source/Shared/types.ts` | Domain entity types — source of truth |
| `Source/Shared/api.ts` | API wrapper types — source of truth |
| `Source/Backend/src/routes/` | All route handlers — check for `getDb()` usage |
| `Source/Backend/src/services/` | Service layer — check for framework imports, duplicate types |
| `Source/Backend/src/middleware/errorHandler.ts` | AppError class lives here (framework module) |
| `Source/Backend/src/lib/tracing.ts` | Contains catch block with comment but no logging for OTEL init failure |
| `tools/traceability-enforcer.py` | Reliable enforcer — use as first check. Reports 30 "implemented" + 2 meta (FR-031/032) = 32 total |

## Persistent Pattern Violations (Still Open After Two Audits)

### 1. Route Handlers Obtain DB Reference (QUAL-001)
All 6 route files call `getDb()` directly and pass the `db` object to service functions. Services are library-style (accept db parameter) rather than true service layer abstractions. **Two audits, still open.**

### 2. Services Import Framework Error Class (QUAL-002)
All 5 service files import `AppError` from `../middleware/errorHandler`. **Two audits, still open.**

### 3. Duplicate Type Definitions (QUAL-003)
9 input/update interface types are duplicated between `Source/Shared/api.ts` and backend service files: `CreateBugInput`, `UpdateBugInput`, `CreateFeatureRequestInput`, `UpdateFeatureRequestInput`, `CreateFeatureInput` (service only — no Shared counterpart), `CreateLearningInput`, `UpdateCycleInput`, `CreateTicketInput`, `UpdateTicketInput`. **Two audits, still open.**

### 4. Silent OTEL Initialization Failure (QUAL-004)
`Source/Backend/src/lib/tracing.ts:36` catch block has a comment but does not log the error. **Two audits, still open.**

### 5. ESLint Suppressions (QUAL-005)
Two `// eslint-disable` comments in production source — both justifiable but undocumented. **Two audits, still open.**

## Architecture Notes

- No hardcoded secrets found — all config via `process.env.*`
- No `console.log` in production source (confirmed clean)
- All list endpoints correctly return `{data: T[]}` wrappers
- 343 test cases across 16 test files (up from 271 across 15 in first audit)
- No skipped/todo tests found
- No `test.only`/`describe.only` found
- No files over 500 lines (largest: `cycleService.ts` at 447 lines)
- `AppError` in `middleware/errorHandler.ts` is not itself Express-dependent but co-located with Express middleware

## Grading Context

Based on inspector.config.yml grading thresholds:
- P1 findings: 0
- P2 findings: 3 (duplicate types, service-layer DB injection, service-framework coupling)
- Spec coverage: 100%
- **Expected grade: A** (max_p2: 3, min_spec_coverage: 80)

## Efficiency Notes for Future Audits

- The traceability enforcer (`tools/traceability-enforcer.py`) is the fastest first-pass check. It correctly identifies all 32 FRs and their test coverage.
- FR-031 and FR-032 are meta-requirements (testing requirements) — the enforcer counts test files as both source and test for these.
- `grep -c "it(" *.test.ts` is a reliable way to count test cases.
- The 3 P2 findings are structural and unlikely to change without a deliberate refactoring effort. Check quickly on future audits and move on.

## Third Audit: 2026-03-24

### Spec Coverage Trend
- **Third audit: 79.6% source / 100% test** (39/49 FRs formal source, 49/49 tested)
- Drop from 100% due to 6 new pipeline FRs using informal // FR-XXX comments instead of // Verifies: FR-XXX
- Traceability enforcer requirements file only checks FR-001 through FR-032 — needs FR-033 through FR-049 added

### New Findings
- QUAL-006 (P2): Traceability enforcer requirements outdated
- QUAL-007 (P3): 6 pipeline FRs lack formal Verifies comments (FR-033, FR-034, FR-035, FR-039, FR-041, FR-042)
- QUAL-008 (P3): pipelineService.ts imports from middleware/metrics (extends QUAL-002 pattern)
- QUAL-009 (P4): pipelines.test.ts at 1010 lines exceeds 500-line guideline

### Test Statistics
- 429 test cases across 18 files (up from 343/16)
- 86 new pipeline tests (55 backend + 15 frontend + 16 updates)

### All Prior Findings Still Open
QUAL-001 through QUAL-005 remain STILL OPEN (3 audits running).
