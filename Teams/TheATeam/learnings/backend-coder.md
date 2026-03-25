# Backend Coder Learnings — TheATeam

## Codebase Patterns

### Test Infrastructure
- Tests use `better-sqlite3` in-memory databases (`new Database(':memory:')`) — import `setDb` from connection to inject
- `createTestDb()` helper: creates in-memory DB, sets WAL mode, foreign keys, runs migrations
- Tests import `createApp()` from `src/index`, NOT from the live server; do NOT call `startServer()` in tests
- Test file imports from services using relative paths like `../src/services/featureRequestService`

### TypeScript Path Imports
- Shared types are imported with relative paths from services: `'../../../Shared/types'`
- Tests import shared types with `'../../Shared/types'` (relative from `tests/`)

### Status Transition Pattern
- Feature request transitions: `potential → voting → approved/denied`, `approved → in_development → completed`
- Do NOT add extra transitions (`potential → denied`, `approved → denied`) — these are NOT in the contract
- Voting (POST /vote) leaves FR in `voting` status — DD-1. Majority is advisory. Human calls /approve or /deny.

### Column Naming
- Schema column is `human_approval_approved_at` (NOT `human_approval_at`) — DD-2

### Error Handler Pattern
- All route handlers MUST use `try { ... } catch (err) { next(err); }` — DD-3
- `AppError(statusCode, message)` for known errors; centralized `errorHandler` sanitizes all responses
- Returns `{error: "message"}` format for all errors

### Input Validation
- Enum validation required for `source`, `priority` on FRs; `severity` on bugs; `category` on learnings
- Length limits: title ≤ 200 chars, description ≤ 10,000 chars — Security M-04
- Export validation constants (`TITLE_MAX_LENGTH`, `DESCRIPTION_MAX_LENGTH`) for use in tests

### CORS
- CORS middleware must be first (before body parsing), restricted to `process.env.ALLOWED_ORIGINS` or `http://localhost:5173`
- Allow methods: GET, POST, PATCH, DELETE, OPTIONS
- Allow headers: Content-Type, Authorization, traceparent, tracestate

### Tracing (FR-021)
- `withSpan(name, async (span) => {...})` wraps any async operation
- `initTracing()` is no-op when `OTEL_EXPORTER_OTLP_ENDPOINT` is not set
- Tracing stubs from `@opentelemetry/api` work as no-ops in test environment

### Testing Patterns
- Use `// Verifies: FR-XXX` comment in every `it()` block
- Use injectable randomness for voting tests: `voteOnFeatureRequest(db, id, { random: () => 0.01 })`
- For approval tests: `random: () => 0.01` = all approve; `random: () => 0.99` = all deny

## Pitfalls to Avoid
- Do NOT use `vi.mock('../src/database/connection')` — use real in-memory SQLite to catch SQL errors
- Do NOT call `db.prepare().all(...params)` with spread — better-sqlite3 supports variadic args natively
- Do NOT forget `db.close()` in `afterEach` — prevents memory leaks in test suites

## Running Tests
```bash
cd Source/Backend && npm test
```

## Traceability Check
```bash
python3 tools/traceability-enforcer.py
```

## Run 2026-03-23 (Backend Coder 2 — Second Pass)

### What Was Found
- Previous QA run blockers (BLOCKER-1 and BLOCKER-2) were already resolved in the codebase before this run.
- `featureRequestActionService.ts` (mentioned in QA report) no longer exists — approve/deny consolidated into `featureRequestService.ts`. This is correct.
- All 184 backend tests pass using real in-memory SQLite (not mocks).
- Traceability: 31/32 FRs have coverage; FR-032 is frontend tests (not backend scope).

### Test Baseline
- 7 test files: `approvals.test.ts`, `bugs.test.ts`, `cycles.test.ts`, `dashboard.test.ts`, `features.test.ts`, `featureRequests.test.ts`, `learnings.test.ts`
- 184 tests passing, 0 failing

### Architecture Notes
- Route consolidation: approve/deny are in `featureRequests.ts` (route file) calling functions from `featureRequestService.ts` (service), not separate files.
- `index.ts` mounts feature-requests router with both CRUD and action routes at same prefix `/api/feature-requests` — this is correct.
- Cycle completion (`completeCycle`) uses injectable `random` option for testability — `random: () => 0.05` forces deployment failure, `random: () => 0.5` forces success.

## Run 2026-03-23 (Backend Coder — Run 3 Fixes)

### What Was Fixed
1. **DD-10**: Replaced `ORDER BY ROWID DESC` with `ORDER BY id DESC` in all 6 ID generation functions (featureRequestService, bugService, cycleService×2, learningService, featureService). ROWID ordering can be unreliable after vacuum; id DESC always gives the highest sequential ID.
2. **DD-11/DD-12**: Added input length validation (title max 200, description max 10000) to `bugService.ts` create/update and `learningService.ts` create (content max 10000). Also added ticket title/description validation in `cycleService.ts`.
3. **DD-9**: Already implemented from run 2 — `updateCycle` rejects `status=complete` via PATCH.

### New Tests Added (14 tests)
- Bug ID collision after delete (2 tests) — `bugs.test.ts`
- Bug input length validation on create/update (5 tests) — `bugs.test.ts`
- Learning content length validation (2 tests) — `learnings.test.ts`
- Ticket title/description length validation (3 tests) — `cycles.test.ts`
- FR ID collision after delete (2 tests) — `featureRequests.test.ts`

### Test Baseline
- 8 test files: 295 tests passing, 0 failing (up from 281)
- Traceability: 30/30 FRs covered (PASS)

### Key Pattern: Input Length Validation
- Export `TITLE_MAX_LENGTH`, `DESCRIPTION_MAX_LENGTH`, `CONTENT_MAX_LENGTH` constants for use in tests
- Validate on both create AND update paths
- Tests import the constants so they stay in sync with implementation

## Run 2026-03-24 (Backend Coder — Orchestrated Dev Cycles)

### What Was Implemented
FR-033 through FR-043 + FR-048: Pipeline orchestration for development cycles.

### Circular Dependency Avoidance
- `pipelineService.ts` imports from `cycleService.ts` (for `completeCycle`), and `cycleService.ts` would need `pipelineService.ts` for `createPipelineRun`. This creates a circular dependency.
- **Solution**: Move pipeline creation to the route handler layer (`cycles.ts` POST handler calls `createPipelineRun` after `createCycle`), and move pipeline hydration to the GET handler. This keeps services independent.
- Do NOT use `require()` for lazy imports in vitest — vitest's TypeScript resolution doesn't support CommonJS `require()` for `.ts` files.

### Pipeline Architecture
- `pipelineService.ts` (NEW) — owns all pipeline CRUD and stage advancement logic
- `pipelines.ts` routes (NEW) — thin HTTP layer for pipeline endpoints
- `cycles.ts` routes — creates pipeline run after cycle creation (FR-037), hydrates pipeline on GET (FR-041)
- Pipeline-linked cycles block manual PATCH status changes (FR-039) via `cycle.pipeline_run_id` check in `updateCycle`
- Stage 5 completion reuses existing `completeCycle()` for Learning/Feature/CI-CD sim (DD-14)

### Test Baseline
- 9 test files: 350 tests passing, 0 failing (up from 295)
- Traceability: 39/39 FRs covered (PASS)

## Run 2026-03-24 (Backend Coder — Dev Cycle Full Traceability)

### What Was Implemented
FR-050 through FR-062: Full traceability for development cycles — linking bugs, tickets, and features to parent work items; cycle feedback as a first-class entity; traceability reports on features.

### Key Changes
- **Shared types (FR-050/FR-051)**: Added `CycleFeedback`, `ConsideredFix`, `CycleFeedbackType` types; extended `BugReport`, `Ticket`, `Feature`, `DevelopmentCycle` with new fields; added `CreateCycleFeedbackInput`, `CreateFeatureInput` API types; modified `CreateBugInput`, `CreateTicketInput`, `CompleteStageInput`
- **Schema (FR-052)**: New `cycle_feedback` table; ALTER TABLE on `bugs` (+3 cols), `tickets` (+3 cols), `features` (+2 cols) — all nullable, idempotent
- **feedbackService.ts (FR-053)**: NEW service — `createFeedback`, `listFeedback`, `getFeedbackById` with CFBK-XXXX ID generation
- **bugService (FR-054)**: `createBug` accepts/persists `related_work_item_id`, `related_work_item_type`, `related_cycle_id`; `mapBugRow` returns new fields
- **cycleService (FR-055/FR-056/FR-058)**: `createTicket` accepts `work_item_ref`, `issue_description`, `considered_fixes` (JSON stringify/parse); `completeCycle` passes `cycle_id` to Feature and populates related fields on deployment-failure bugs; `getCycleById` hydrates `feedback[]` and `team_name`
- **featureService (FR-057)**: `createFeature` accepts/persists `cycle_id` and `traceability_report`
- **Feedback routes (FR-059)**: `GET /api/cycles/:id/feedback` (filterable by agent_role, feedback_type) and `POST /api/cycles/:id/feedback`
- **Pipeline feedback (FR-060)**: `completeStageAction` accepts optional `feedback[]` array, stores as `cycle_feedback` records linked to the pipeline run's cycle
- **Observability (FR-061)**: `cycle_feedback_total` Prometheus counter by feedback_type; structured logging in feedbackService

### Circular Dependency Note (feedbackService → cycleService)
- `cycleService.ts` imports `listFeedback` from `feedbackService.ts` for hydration in `getCycleById`
- `feedbackService.ts` does NOT import from `cycleService.ts` — it validates cycle existence with a direct DB query
- `pipelineService.ts` imports `createFeedback` from `feedbackService.ts` for stage completion feedback
- No circular dependency — the import graph is: pipelineService → feedbackService, cycleService → feedbackService

### Test Baseline
- 10 test files: 403 tests passing, 0 failing (up from 350)
- Traceability: 47/47 implemented FRs covered (PASS)
- New test file: `feedback.test.ts` (53 tests covering FR-050 through FR-062)

## Run 2026-03-25 (Backend Coder 1 — Image Upload)

### What Was Implemented
FR-070 through FR-079 + FR-088: Image upload support for feature requests and bug reports.

### Key Files
- `Source/Backend/src/middleware/upload.ts` (NEW) — multer config with UUID filenames, 5MB limit, MIME whitelist
- `Source/Backend/src/services/imageService.ts` (NEW) — uploadImagesService, listImages, deleteImage
- `Source/Backend/src/routes/featureRequests.ts` — added POST/GET/DELETE `:id/images` sub-routes
- `Source/Backend/src/routes/bugs.ts` — added POST/GET/DELETE `:id/images` sub-routes
- `Source/Backend/src/index.ts` — added `express.static` for `/uploads/` serving
- `Source/Backend/src/middleware/metrics.ts` — added `image_uploads_total` Prometheus counter
- `Source/Backend/src/database/schema.ts` — added `image_attachments` table + index
- `Source/Shared/types.ts` — added `ImageAttachment`, `ImageEntityType`
- `Source/Shared/api.ts` — added `ImageAttachmentListResponse`, `ImageUploadResponse`

### Patterns
- **Two-step upload** (DD-IMG-01): entity created first (JSON), then images uploaded via multipart POST
- **Multer callback pattern**: upload middleware called inside route handler (not as Express middleware), allowing entity validation before file upload
- **File cleanup on delete** (DD-IMG-05): `deleteImage` removes both DB record and disk file
- **ID generation**: `IMG-XXXX` sequential IDs, same pattern as other entities
- **MulterFile interface**: exported from imageService for test use, avoids importing Express.Multer.File in tests
- **Minimal PNG for tests**: `createMinimalPng()` helper generates a valid 1x1 pixel PNG buffer for supertest uploads

### Test Baseline
- 12 test files: 442 tests passing, 0 failing (up from 403)
- Traceability: all assigned FRs (FR-072 through FR-079, FR-088) covered
- New test file: `images.test.ts` (29 tests covering FR-072 through FR-079, FR-088)

## Run 2026-03-25 (Backend Coder 2 — Image Upload: Orchestrator Proxy + Tests)

### What Was Implemented
FR-078 (orchestrator proxy multipart forwarding) + FR-088 (comprehensive backend tests).

### Key Changes
- **Orchestrator proxy (FR-078)**: Modified `index.ts` proxy to detect `multipart/form-data` content-type. Multipart requests are streamed by collecting raw request body chunks and forwarding with original Content-Type header (preserving boundary). JSON and GET requests continue working unchanged.
- **Dynamic env read**: Changed `ORCHESTRATOR_URL` from module-level const to request-time `process.env` read so tests can override it per test case.
- **Test files**: `imageService.test.ts` (14 tests), `imageRoutes.test.ts` (14 tests), `orchestratorProxy.test.ts` (7 tests)

### Patterns
- **Mock orchestrator for proxy tests**: `createMockOrchestrator()` spins up an `http.createServer` on port 0 (OS-assigned), echoes request metadata. Set `process.env.ORCHESTRATOR_URL` in beforeEach to point at mock.
- **Multipart forwarding**: Collect request body as `Buffer[]`, concat, send as `fetch` body with original Content-Type. This preserves the multipart boundary without re-parsing.
- **Image route test cleanup**: After supertest uploads, delete the actual file from `UPLOAD_DIR` to prevent test pollution.

### Test Baseline
- 14 test files: 465 tests passing, 0 failing (up from 442)
- Traceability: all backend FRs covered. 4 frontend FRs (FR-082, FR-083, FR-084, FR-087) pending frontend-coder tests.

