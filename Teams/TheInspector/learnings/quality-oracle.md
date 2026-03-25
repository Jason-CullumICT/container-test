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

## Fourth Audit: 2026-03-25 — Image Upload Feature

### Spec Coverage: Image Upload FRs (FR-070 through FR-089)

- **Image upload FRs: FR-070 – FR-089 = 20 requirements**
- Enforcer PASS: all implemented FRs have test coverage
- FR-070 and FR-071 carry section-comment references (`// --- Image Attachment Types (FR-070) ---`) but NOT formal `// Verifies: FR-070` annotations — the enforcer does not scan section comments, only `Verifies:` lines. These two are untraced in the enforcer sense.
- All other 18 FRs (FR-072 through FR-089) have proper `// Verifies: FR-XXX` annotations in source and tests.
- Enforcer requirements file (`Plans/dev-workflow-platform/requirements.md`) still only lists FR-001–FR-032 — image upload FRs live in `Plans/image-upload/requirements.md` and are NOT loaded by the enforcer. The enforcer reports 32 total requirements and 62 implemented — the 20 new FRs are silently excluded from the "pending" count.

### New Image Upload Findings
- QUAL-010 (P3): FR-070 and FR-071 lack `// Verifies: FR-070/071` comments — section labels exist but not enforcer-visible annotations
- QUAL-011 (P2): `imageService.ts` sequential ID generation (`generateImageId`) is NOT safe under concurrent inserts — uses SELECT MAX(id) in a transaction but the transaction wraps only INSERT, not the SELECT. Under concurrent load, two callers could read the same max ID and produce duplicate IMG-XXXX collisions. Should use uuid-based IDs or a single atomic sequence.
- QUAL-012 (P3): `ImageUploadResponse` and `ImageAttachmentListResponse` types defined in `Source/Shared/api.ts` are never imported by the backend routes — they exist as dead exports. Routes inline `{ data: images }` JSON directly without using the shared response type. Extends QUAL-003 (unused shared types).
- QUAL-013 (P2): Traceability enforcer requirements file still does not include image-upload FRs (FR-070–FR-089). The enforcer's "32 total requirements" count is stale — QUAL-006 remains open and image upload has made it worse.

### Architecture Compliance (Image Upload)
- Service layer pattern: STILL OPEN (QUAL-001). Image upload routes call `getDb()` directly, same pattern as all other routes.
- AppError import from middleware: STILL OPEN (QUAL-002). `imageService.ts` imports `AppError` from `../middleware/errorHandler`.
- No `console.log` in new files: CLEAN
- All new list endpoints return `{data: T[]}`: CLEAN
- Structured logging used correctly in imageService and routes: CLEAN
- `imageUploadsCounter` Prometheus metric added to metrics.ts: CLEAN (FR-079)
- Static file serving mounted at `/uploads/`: CLEAN (FR-077)
- Multer config matches contracts.md spec exactly (5MB, 5 files, 4 MIME types): CLEAN (FR-073)

### Test Statistics (Fourth Audit)
- New test files: images.test.ts, imageService.test.ts, imageRoutes.test.ts, orchestratorProxy.test.ts (backend); ImageComponents.test.tsx, ImageUpload.test.tsx (frontend)
- All new test files carry `// Verifies: FR-XXX` file-level headers
- Dual coverage: images.test.ts and imageRoutes.test.ts both test routes (FR-075–FR-077), imageService.test.ts and images.test.ts both test the service (FR-074) — provides redundant coverage
- FR-088 (backend tests) and FR-089 (frontend tests) meta-requirements: COVERED

### Prior Findings Status
- QUAL-001 through QUAL-009: ALL STILL OPEN (4 audits running for QUAL-001–005)

## Fifth Audit: 2026-03-25 — Runs Dashboard (Not Implemented)

### Critical Finding: Implementation Missing
FR-090 through FR-098 have plans, design docs, contracts, and even E2E test specs — but zero source code. No files were created or modified in Source/Frontend/.

### Spec Coverage: Runs Dashboard FRs
- FR-090–FR-098: 9 requirements defined, 0 implemented, 0% coverage
- E2E specs exist at `Source/E2E/tests/` but target nonexistent UI elements
- Traceability enforcer counts E2E specs as test coverage, inflating metrics

### New Findings
- QUAL-014 (P2): Orchestrator API client uses `any` types in 7 return positions — defeats TypeScript
- QUAL-015 (P3): Duplicate elapsed-time formatting in CycleCard.tsx and CompletedCyclesSection.tsx
- QUAL-016 (P2): 15 dead E2E tests reference UI elements that don't exist
- QUAL-017 (P2): Traceability enforcer counts E2E-only FRs as covered
- QUAL-018 (P4): Duplicated response handling in `handleResponse` / `apiFetch`

### Prior Findings Status
- QUAL-001, QUAL-002: STILL OPEN (5th audit running)
- QUAL-003: PARTIALLY FIXED (no new duplicates, orchestrator types correctly isolated)
- QUAL-006: STILL OPEN (enforcer still only tracks FR-001–032)
- QUAL-010: FIXED (FR-070/071 now have proper Verifies comments)
- QUAL-013: STILL OPEN (enforcer doesn't include image upload or runs dashboard FRs)

### Test Statistics
- 688 unit/integration tests across 28 files (239 frontend + 434 backend + 15 dead E2E)
- No new unit tests for this feature (expected, since no implementation exists)

### Key Takeaway
The traceability enforcer has a blind spot: it counts test files that contain `// Verifies: FR-XXX` regardless of whether implementation exists. E2E specs created before implementation inflate coverage metrics. The enforcer needs an implementation-existence cross-check.
