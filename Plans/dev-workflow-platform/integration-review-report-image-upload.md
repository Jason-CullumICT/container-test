# Integration Review Report — Image Upload Feature

**Reviewer:** integration-reviewer
**Date:** 2026-03-25
**Feature:** Image upload support for feature requests and bug reports (FR-070 through FR-089)
**Verdict:** PASS (with minor findings)

---

## Summary

The image upload feature has been implemented correctly across backend and frontend layers. All 20 new FRs (FR-070–FR-089) have test coverage. Backend tests pass 100% (465/465). Frontend tests have 3 pre-existing failures in Layout.test.tsx (unrelated to image upload). The traceability enforcer passes with all 62 implemented FRs covered.

---

## Test Results

| Layer | Total | Passed | Failed | Notes |
|-------|-------|--------|--------|-------|
| Backend | 465 | 465 | 0 | All 14 test files pass |
| Frontend | 189 | 186 | 3 | 3 pre-existing failures in Layout.test.tsx (Approvals page removed) |
| Traceability | 62 FRs | 62 | 0 | All image FRs (FR-070–FR-089) covered |

---

## Contract Compliance

### Shared Types (FR-070, FR-071) — PASS
- `ImageEntityType`, `ImageAttachment` in `Source/Shared/types.ts` matches contract exactly
- `ImageAttachmentListResponse`, `ImageUploadResponse` in `Source/Shared/api.ts` matches contract

### Database Schema (FR-072) — PASS
- `image_attachments` table with all required columns and CHECK constraint on entity_type
- Index on (entity_id, entity_type) created
- Idempotent migration via `CREATE TABLE IF NOT EXISTS`

### Multer Configuration (FR-073) — PASS
- UPLOAD_DIR: `Source/Backend/uploads/` (via `path.join(__dirname, '../../uploads')`)
- MAX_FILE_SIZE: 5MB, MAX_FILES: 5
- ALLOWED_MIMES: `['image/jpeg', 'image/png', 'image/gif', 'image/webp']`
- Auto-creates uploads directory if missing
- UUID-based filenames per DD-IMG-02

### Image Service (FR-074) — PASS
- `uploadImagesService`: inserts records in transaction, returns ImageAttachment[]
- `listImages`: returns images for entity sorted by created_at ASC
- `deleteImage`: removes DB record AND file from disk (DD-IMG-05)
- Service layer pattern followed — no direct DB calls in routes
- ID generation uses MAX(id) pattern (avoids DD-10 COUNT bug)

### Image Routes (FR-075, FR-076, FR-077) — PASS
- `POST /api/feature-requests/:id/images` — validates FR exists (404), handles multer errors (400), returns 201 `{data: ImageAttachment[]}`
- `POST /api/bugs/:id/images` — same pattern for bugs
- `GET /api/feature-requests/:id/images` — returns `{data: ImageAttachment[]}`, validates entity exists
- `GET /api/bugs/:id/images` — same pattern
- `DELETE /api/feature-requests/:id/images/:imageId` — returns 204, throws 404 if not found
- `DELETE /api/bugs/:id/images/:imageId` — same pattern
- Static serving at `GET /uploads/:filename` via `express.static`
- All route handlers use try/catch + next(err) per DD-3

### Orchestrator Proxy (FR-078) — PASS
- Detects multipart via `content-type` header
- Reads raw body as Buffer and forwards with original Content-Type (preserving boundary)
- JSON fallback for non-multipart requests
- SSE handling preserved
- Error handling returns 502 with message

### Observability (FR-079) — PASS
- Structured logging via project logger (not console.log)
- `image_uploads_total` Prometheus counter with `entity_type` label registered
- Log entries for upload and delete operations with entity context

### Frontend: ImageUpload Component (FR-080) — PASS
- Drag-and-drop zone with onDrop/onDragOver/onDragLeave handlers
- Click-to-upload via hidden file input
- File preview using `URL.createObjectURL` with proper cleanup (`revokeObjectURL`)
- Client-side validation: MIME type and size checks mirror backend
- `onFilesSelected` callback with validated File[]
- Remove individual files from preview
- Proper `data-testid` attributes for testing

### Frontend: ImageThumbnails Component (FR-081) — PASS
- Grid layout of thumbnails
- Clickable images open in new tab via `<a target="_blank">`
- Delete button visible on hover when `allowDelete=true`
- Empty state: returns null (no rendering)
- Original filename displayed below thumbnail

### Frontend: Form Integration (FR-082, FR-083) — PASS
- `FeatureRequestForm` includes `<ImageUpload>` below description, passes imageFiles to parent
- `BugForm` same pattern
- Two-step flow: page-level handler creates entity first, then calls `images.upload()`
- Form disabled during submission

### Frontend: Detail Views (FR-084, FR-085) — PASS
- `FeatureRequestDetail` fetches images on mount via `images.list('feature-requests', id)`
- Displays via `<ImageThumbnails>` with allowDelete
- Supports additional image upload from detail view
- `BugDetail` follows same pattern
- Error handling for upload/delete failures

### Frontend: API Client (FR-086) — PASS
- `images.upload` uses raw `fetch` with `FormData` (no JSON Content-Type header)
- `images.list` uses `apiFetch` for JSON
- `images.delete` uses `apiFetch` with DELETE method
- `orchestrator.submitWork` accepts optional `images: File[]`, uses FormData when present

### Frontend: Orchestrator Submit (FR-087) — PASS
- `FeatureRequestDetail` downloads attached images from `/uploads/:filename`
- Creates `File` objects from blobs with original name/type
- Passes to `orchestrator.submitWork` with images option
- Button visible only for approved FRs

### Vite Config — PASS
- `/uploads` proxy added to forward to `http://localhost:3001`

---

## Architecture Rule Compliance

| Rule | Status | Notes |
|------|--------|-------|
| Specs are source of truth | PASS | Implementation traces to contracts.md |
| No direct DB calls from routes | PASS | All DB calls go through imageService |
| Shared types are single source of truth | PASS | All layers import from Source/Shared/ |
| Every FR needs a test with `// Verifies:` | PASS | FR-070 through FR-089 all covered |
| Schema changes require migration | PASS | Idempotent CREATE TABLE in schema.ts |
| No hardcoded secrets | PASS | No secrets involved |
| List endpoints return `{data: T[]}` | PASS | All image list/upload endpoints use this wrapper |
| New routes have observability | PASS | Structured logging + Prometheus counter |
| Business logic has no framework imports | PASS | imageService.ts is pure Node (no Express imports) |
| Service layer between routes and DB | PASS | imageService.ts handles all DB operations |

---

## Findings

### MEDIUM — Delete endpoint does not verify image-entity ownership (IR-IMG-01)

**File:** `Source/Backend/src/routes/featureRequests.ts:281`, `Source/Backend/src/routes/bugs.ts:200`

The DELETE `/api/feature-requests/:id/images/:imageId` endpoint only checks that `imageId` exists in the database, but does not verify the image's `entity_id` matches the `:id` URL parameter. A request to `DELETE /api/feature-requests/FR-0001/images/IMG-0005` would succeed even if IMG-0005 belongs to BUG-0002.

**Impact:** Low — internal dev tool, no auth, but breaks the RESTful resource hierarchy contract.
**Recommendation:** Add a check in `deleteImage` or the route handler: verify `row.entity_id === req.params.id` before deleting.

### LOW — No per-entity image count limit (IR-IMG-02)

The 5-file-per-request limit in multer prevents uploading >5 files at once, but there is no total limit on images per entity. Repeated upload requests could accumulate unbounded images for a single feature request or bug.

**Impact:** Low — potential disk space accumulation in long-running instances.
**Recommendation:** Add a check in the upload route: count existing images + incoming files ≤ max (e.g., 20).

### LOW — Pre-existing test failures in Layout.test.tsx (IR-IMG-03)

3 tests fail in `Source/Frontend/tests/Layout.test.tsx`:
1. "renders all 7 navigation links" — expects "Approvals" text (page was removed in commit `81d126a`)
2. "fetches badge counts on mount" — expects `featureRequests.list({ status: 'voting' })` call
3. "renders badge for pending approvals" — expects badge count elements

**Impact:** None for image upload. These are pre-existing failures from the Approvals page removal.
**Recommendation:** Update Layout.test.tsx to reflect current navigation (6 pages, no Approvals).

### INFO — Orchestrator proxy buffers entire multipart body in memory (IR-IMG-04)

**File:** `Source/Backend/src/index.ts:85-89`

The orchestrator proxy reads the entire multipart body into a `Buffer` before forwarding. For 5 images × 5MB = 25MB maximum, this creates a significant memory allocation per request.

**Impact:** Low for an internal tool with light traffic. Could be a concern under concurrent uploads.
**Recommendation:** For a future iteration, consider streaming the request body directly to the orchestrator using Node.js streams or `pipeline()`.

### INFO — Image ID generation is not collision-safe under concurrent transactions (IR-IMG-05)

**File:** `Source/Backend/src/services/imageService.ts:42-49`

The `generateImageId` function reads MAX(id) outside the insert transaction. Two concurrent uploads could theoretically generate the same ID.

**Impact:** Non-issue for SQLite (serialized writes), but would be a bug if migrated to PostgreSQL/MySQL.
**Recommendation:** No action needed for current SQLite setup. Note for future DB migration.

---

## Design Decision Compliance

| Decision | Status |
|----------|--------|
| DD-IMG-01: Two-step upload | PASS — Forms create entity first, then upload images |
| DD-IMG-02: UUID filenames | PASS — multer uses `uuidv4()` + original extension |
| DD-IMG-03: Static serving | PASS — `express.static` at `/uploads/`, no auth |
| DD-IMG-04: Multer for handling | PASS — multer with disk storage |
| DD-IMG-05: Delete removes file | PASS — `fs.unlinkSync` after DB delete, with error handling |
| DD-IMG-06: Multipart forwarding | PASS — Proxy detects content-type and forwards raw body |
| DD-IMG-07: Client mirrors server validation | PASS — ImageUpload validates same MIME types and size |
| DD-IMG-08: No image processing | PASS — Images stored as-is, CSS handles thumbnailing |

---

## Final Verdict: PASS

The image upload feature is correctly implemented against all contracts and design decisions. All 20 FRs have test coverage. Backend tests pass 100%. The 3 frontend test failures are pre-existing and unrelated. No CRITICAL or HIGH severity issues found. The 2 MEDIUM/LOW findings (entity ownership check, per-entity limit) are minor improvements that do not block the feature.
