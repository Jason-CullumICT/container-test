# Integration Reviewer Learnings

## Run: 2026-03-23 (Development Workflow Platform)

### Key Findings

1. **PATCH-to-complete bypass pattern**: When a service has both a `PATCH` status-update path and a dedicated `POST /complete` endpoint with side effects, the linear state machine check in PATCH may inadvertently allow the final state (`complete`) to be set directly, bypassing all side effects. Always add an explicit guard in `updateCycle`/similar services to block the terminal state and redirect to the dedicated endpoint.

2. **COUNT-based ID generation breaks after delete**: Using `SELECT COUNT(*) FROM table` for sequential ID generation is fragile — any delete causes the count to decrease, and the next insert will collide with an existing ID (PRIMARY KEY constraint failure). Use `MAX(id)` extraction or a dedicated sequence table instead.

3. **BLOCKERs from previous QA were fully resolved**: The column name mismatch (`human_approval_at` → `human_approval_approved_at`) and the vote auto-transition issue were both fixed before this review. The architecture consolidation (single service file for FR approve/deny instead of separate `featureRequestActionService.ts`) was a clean improvement.

4. **Smoke testing requires a real database**: Unit tests mock the DB (`vi.mock('../src/database/connection')`), which means they cannot catch SQL errors like column name mismatches or PRIMARY KEY collisions. Integration smoke tests against a real SQLite instance are essential as a final gate.

5. **Linear state machine guards work well for ticket transitions** — the `TICKET_STATUS_TRANSITIONS` map produces correct 400 errors for invalid moves. This pattern should be applied consistently.

6. **Duplicate detection threshold**: Jaccard similarity threshold of > 0.8 is strict. Titles with 4/6 words in common (0.67) do NOT trigger a warning. The algorithm is correct but operators should understand the threshold.

7. **Build output path**: `rootDir: "../../"` in tsconfig puts output at `dist/Source/Backend/src/index.js`, not `dist/index.js`. Always check the actual dist path before running integration smoke tests.

### Smoke Test Workflow That Works
```bash
# Build
cd Source/Backend && npm run build

# Start with separate port to avoid conflict
PORT=3099 node dist/Source/Backend/src/index.js &
sleep 2

# Verify health
curl -s http://localhost:3099/health

# Run smoke tests via curl + python3 for JSON parsing
# Kill server when done
pkill -f "node dist/Source/Backend/src/index.js"
```

8. **PATCH-to-approve bypass pattern**: When a PATCH endpoint allows `voting → approved` as a valid status transition, but the `/approve` endpoint has additional checks (majority vote verification, setting `human_approval_approved_at`), the PATCH path becomes a backdoor. Remove terminal/guarded states from the PATCH-accessible transition map and force callers through the dedicated endpoint.

9. **DD-9/DD-10/DD-11 all fixed in Run 3**: The PATCH-to-complete bypass (DD-9), MAX-based ID generation (DD-10), and input length validation across all entities (DD-11) were all implemented correctly. The codebase now validates lengths on FR, bug, learning, and ticket inputs.

10. **Pre-existing data in the test DB**: Previous QA/chaos test runs leave data in the SQLite DB. Smoke tests must account for non-empty starting state — test fresh entities rather than assuming IDs start at 0001.

### Checklist for Future Integration Reviews
- [ ] Run backend + frontend tests first
- [ ] Run traceability enforcer
- [ ] Start server on non-standard port (3099 avoids conflicts)
- [ ] Test happy path: create FR → vote → approve → create cycle → tickets → complete
- [ ] Test error paths: invalid status transitions, missing fields, duplicate resources
- [ ] Verify DD-1 (voting leaves FR in `voting`) by checking status after vote call
- [ ] Verify DD-4 (cycle linear transitions) including that `complete` requires POST /complete
- [ ] Verify DD-5 (deny status guard) by trying to deny an approved FR
- [ ] Verify DD-6 (activity limit cap) by requesting limit=300
- [ ] Verify DD-7 (CORS) via OPTIONS preflight
- [ ] Verify DD-8 (enum validation) with invalid values
- [ ] Verify DD-9 (PATCH to complete blocked) with explicit guard
- [ ] Verify DD-10 (ID generation after delete) — delete then create
- [ ] Verify DD-11 (input length validation) for all entity types
- [ ] Test PATCH `voting→approved` bypass — confirm if it circumvents vote check
- [ ] Test delete operations and confirm 204 response
- [ ] Confirm side effects of POST /complete (Learning + Feature records created)
- [ ] Check ID generation survives delete operations

## Run: 2026-03-25 (Image Upload Feature)

### Key Findings

11. **DELETE endpoint entity ownership check**: Image DELETE routes (`/api/feature-requests/:id/images/:imageId`) only verify the imageId exists — they do NOT verify the image belongs to the specified entity. Any image can be deleted via any entity's URL. Minor for internal tools but breaks RESTful resource hierarchy. Always verify entity ownership on nested resource operations.

12. **Two-step upload pattern works cleanly**: Creating the entity first (JSON), then uploading images (multipart) avoids rewriting existing create endpoints. The frontend handles the two-step flow transparently. This pattern is preferable to combined multipart endpoints for retrofitting existing APIs.

13. **Multipart proxy buffering**: The orchestrator proxy reads the entire multipart body into memory before forwarding. For the 5×5MB max this means up to 25MB per request. Acceptable for internal tools but should use streaming for production-grade services.

14. **Pre-existing Layout.test.tsx failures**: 3 tests fail because the Approvals page was removed (commit `81d126a`) but the layout tests still expect it. These are pre-existing and unrelated to image upload. Tests referencing removed features need cleanup.

15. **Image service tests use real SQLite with :memory:**: The image tests properly use in-memory SQLite instances instead of mocks, catching real SQL issues. This is the right pattern for service-level tests.

### Image Upload Checklist
- [ ] Verify multer rejects non-image MIME types with 400
- [ ] Verify multer rejects files >5MB with 400
- [ ] Test upload to non-existent entity returns 404
- [ ] Verify image deletion removes file from disk
- [ ] Verify static serving at GET /uploads/:filename
- [ ] Test orchestrator proxy forwards multipart requests correctly
- [ ] Check vite config proxies /uploads to backend
- [ ] Verify frontend ImageUpload component drag-and-drop + click
- [ ] Verify ImageThumbnails renders and supports delete
- [ ] Verify two-step flow: create entity then upload images
