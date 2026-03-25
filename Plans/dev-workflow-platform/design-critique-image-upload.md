# Design Critique Report: Image Upload Feature

**Reviewer:** design_critic agent
**Feature:** Image upload support for feature requests and bug reports
**Date:** 2026-03-25
**Verdict:** PASSED_WITH_OBSERVATIONS

---

## 1. Methodology

This critique reviews the image upload implementation against:
- Image upload requirements (`Plans/image-upload/requirements.md`, FR-070 through FR-089)
- Image upload API contracts (`Plans/image-upload/contracts.md`)
- Image upload design decisions (`Plans/image-upload/design.md`, DD-IMG-01 through DD-IMG-08)
- Platform specification (`Specifications/dev-workflow-platform.md`)
- Existing platform architecture rules (`CLAUDE.md`)

No Source/ files were edited. This report contains findings only.

---

## 2. Contract Compliance

### Shared Types (FR-070, FR-071)

**Contract specifies:** `ImageEntityType`, `ImageAttachment` in `Source/Shared/types.ts`; `ImageAttachmentListResponse`, `ImageUploadResponse` in `Source/Shared/api.ts`.

**Implementation:** Both types present and correctly defined. `ImageAttachment` has all 8 fields matching the contract exactly. `ImageAttachmentListResponse` is `DataResponse<ImageAttachment>`.

**Assessment:** COMPLIANT

---

### Database Schema (FR-072)

**Contract specifies:** `image_attachments` table with id, entity_id, entity_type, filename, original_name, mime_type, size_bytes, created_at. CHECK constraint on entity_type. Index on (entity_id, entity_type).

**Implementation:** Schema in `schema.ts:189-206` matches contract exactly. Idempotent with `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`.

**Assessment:** COMPLIANT

---

### Multer Configuration (FR-073)

**Contract specifies:** Destination `Source/Backend/uploads/`, max 5MB file size, max 5 files, MIME filter for jpeg/png/gif/webp, UUID filenames.

**Implementation:** `upload.ts` matches all constraints. Exports constants (`UPLOAD_DIR`, `MAX_FILE_SIZE`, `MAX_FILES`, `ALLOWED_MIMES`) for reuse. Creates uploads directory on import with `fs.mkdirSync`.

**Assessment:** COMPLIANT

---

### Image Service (FR-074)

**Contract specifies:** `uploadImages`, `listImages`, `deleteImage` functions with service-layer pattern.

**Implementation:** `imageService.ts` implements all three. Uses transaction for batch insert. Generates `IMG-XXXX` IDs matching the entity ID pattern. Delete removes both DB record and disk file (DD-IMG-05). File deletion errors are logged but don't fail the operation (graceful degradation).

**Assessment:** COMPLIANT

---

### Upload Routes (FR-075, FR-076, FR-077)

**Contract specifies:**
- `POST /api/feature-requests/:id/images` → 201 with `{data: ImageAttachment[]}`
- `POST /api/bugs/:id/images` → 201 with `{data: ImageAttachment[]}`
- `GET .../images` → 200 with `{data: ImageAttachment[]}`
- `DELETE .../images/:imageId` → 204
- 404 on missing entity, 400 on bad files/no files

**Implementation:** Both `featureRequests.ts` and `bugs.ts` add all three routes. Entity existence checked before upload. Multer error handling maps to correct 400 responses. Response shapes match contract.

**Assessment:** COMPLIANT

---

### Static File Serving (FR-077)

**Contract specifies:** `GET /uploads/:filename` via `express.static`.

**Implementation:** `index.ts:56` mounts `express.static` at `/uploads/` pointing to `../uploads`.

**Assessment:** COMPLIANT

---

### Orchestrator Proxy Multipart (FR-078)

**Contract specifies:** Detect multipart content-type, stream-forward with original headers. Fall back to JSON for non-multipart.

**Implementation:** `index.ts:71-139` checks `content-type` for `multipart/form-data`. Multipart requests are buffered into chunks and forwarded with original content-type header (preserving boundary). JSON requests use existing behavior. SSE passthrough preserved.

**Assessment:** COMPLIANT

---

### Observability (FR-079)

**Contract specifies:** Structured logging for upload/delete. Prometheus counter `image_uploads_total` with `entity_type` label. OTel spans.

**Implementation:**
- `imageUploadsCounter` defined in `metrics.ts:60-65` with `entity_type` label. ✓
- `imageService.ts` logs upload and delete operations via structured logger. ✓
- Route handlers log with context (entity IDs, counts). ✓

**Observation:** OTel spans are not explicitly added to image upload/delete operations in the service. The image upload routes use synchronous multer callback pattern, so they don't go through the `withSpan` wrapper that other routes use. The list and delete image routes do use `async` handlers but don't call `withSpan`.

**Severity:** LOW — Missing custom OTel spans on image routes. HTTP-level auto-instrumentation still captures these, but there are no custom spans with image-specific attributes.

---

### Frontend API Client (FR-086)

**Contract specifies:** `images.upload` using FormData (not apiFetch), `images.list` using apiFetch, `images.delete` using apiFetch. Modified `orchestrator.submitWork` with optional `images: File[]`.

**Implementation:** `client.ts:304-322` implements all three image methods. Upload uses raw `fetch` with FormData. A separate `handleResponse` function provides error handling for non-apiFetch calls. `orchestrator.submitWork` at `client.ts:332-349` branches on `opts?.images?.length` to use FormData.

**Assessment:** COMPLIANT

---

### Frontend Components (FR-080, FR-081)

**ImageUpload (FR-080):**
- Drag-and-drop zone with visual feedback ✓
- Hidden file input triggered by click ✓
- File preview using `URL.createObjectURL` with cleanup via `revokeObjectURL` ✓
- Client-side MIME and size validation ✓
- Error messages for invalid files ✓
- Remove button per preview ✓
- Props match contract interface ✓

**ImageThumbnails (FR-081):**
- Grid layout with 4 columns ✓
- Links to `/uploads/{filename}` in new tab ✓
- Optional delete button per thumbnail ✓
- Empty state returns null (no images = no render) ✓
- Props match contract interface ✓

**Assessment:** COMPLIANT

---

### Form Integration (FR-082, FR-083)

**Contract specifies:** Two-step flow — create entity first, then upload images.

**Implementation:**
- `FeatureRequestForm.tsx`: `onSubmit` signature includes `imageFiles: File[]`. Page-level handler in `FeatureRequestsPage.tsx:46-53` creates FR first, then uploads images if present.
- `BugForm.tsx`: Same pattern via `BugReportsPage.tsx:45-52`.
- Both forms disable the ImageUpload during submission.

**Assessment:** COMPLIANT

---

### Detail View Integration (FR-084, FR-085)

**Contract specifies:** Fetch/display images, allow deletion, support additional upload from detail view.

**Implementation:**
- `FeatureRequestDetail.tsx`: Fetches images on mount, renders `ImageThumbnails` with delete, includes `ImageUpload` for additional uploads. All three operations implemented.
- `BugDetail.tsx`: Same pattern.
- Both use optimistic delete (remove from local state, don't re-fetch entire list).

**Assessment:** COMPLIANT

---

### Orchestrator Submit with Images (FR-087)

**Contract specifies:** When submitting FR to orchestrator, fetch attached images and include as multipart.

**Implementation:** `FeatureRequestDetail.tsx:70-89` fetches each image from `/uploads/{filename}`, converts blob to File, passes to `orchestrator.submitWork`. Only shows "Submit to Orchestrator" button for `approved` FRs.

**Assessment:** COMPLIANT

---

### Vite Proxy Configuration

**Implementation:** `vite.config.ts` adds `/uploads` proxy to `http://localhost:3001`. Required for dev server to route static file requests to the backend.

**Assessment:** COMPLIANT — Necessary addition.

---

## 3. Architecture Compliance

| Rule | Status | Notes |
|------|--------|-------|
| No direct DB calls from route handlers | ✓ | Routes delegate to `imageService.ts` |
| Shared types from `Source/Shared/` | ✓ | `ImageAttachment`, `ImageEntityType` imported from Shared |
| `{data: T[]}` list response wrapper | ✓ | All image list endpoints return `{data: [...]}` |
| Structured logging (no console.log) | ✓ | Uses project logger abstraction |
| Prometheus metrics for domain operations | ✓ | `image_uploads_total` counter |
| Business logic has no framework imports | ✓ | `imageService.ts` imports only `uuid`, `fs`, `path`, `better-sqlite3` |
| Error responses as `{error: "message"}` | ✓ | Upload routes return `{error: "..."}` for 400/404 |
| Service layer between routes and DB | ✓ | Three-layer: route → imageService → DB |
| try/catch + next(err) pattern (DD-3) | PARTIAL | Image upload route uses multer callback pattern (not async/try-catch); GET/DELETE routes use try/catch ✓ |

---

## 4. Design Decision Compliance

| Decision | Status | Notes |
|----------|--------|-------|
| DD-IMG-01: Two-step upload | ✓ | Entity created first, images uploaded second |
| DD-IMG-02: UUID filenames | ✓ | `uuidv4() + ext` in multer storage config |
| DD-IMG-03: Static serving, no auth | ✓ | `express.static` at `/uploads/` |
| DD-IMG-04: Multer for file handling | ✓ | Standard multer with disk storage |
| DD-IMG-05: Delete removes disk file | ✓ | `deleteImage` calls `fs.unlinkSync` |
| DD-IMG-06: Orchestrator multipart forwarding | ✓ | Proxy buffers and forwards with original content-type |
| DD-IMG-07: Client mirrors server validation | ✓ | `ImageUpload` validates MIME and size client-side |
| DD-IMG-08: No image processing | ✓ | CSS-only thumbnailing (`object-cover`, fixed dimensions) |

---

## 5. Test Coverage

### Backend Tests

| File | Tests | Coverage |
|------|-------|----------|
| `images.test.ts` | FR-072 through FR-079 | Schema, service, routes, observability |
| `imageRoutes.test.ts` | FR-088 | Route-level upload/list/delete |
| `imageService.test.ts` | FR-088 | Service-level CRUD |
| `orchestratorProxy.test.ts` | FR-078 | Multipart proxy forwarding |

**All 465 backend tests pass (14 files).**

### Frontend Tests

| File | Tests | Coverage |
|------|-------|----------|
| `ImageComponents.test.tsx` | FR-080, FR-081, FR-086 | Upload component, thumbnails, API client |
| `ImageUpload.test.tsx` | FR-082–FR-085, FR-087 | Form integration, detail views, orchestrator |

**All 27 image-related tests pass (both files pass when run individually and in full suite).**

### Pre-existing Failures

3 tests in `Layout.test.tsx` fail (badge rendering). These are **pre-existing** — the same tests fail without any image upload changes. The image upload changes actually improved the Layout test results (from 10 failures pre-branch to 3 failures).

### Traceability

Traceability enforcer: **PASS** — All 62 implemented FRs (including FR-070 through FR-089) have test coverage with `// Verifies: FR-XXX` comments.

---

## 6. Findings

| # | Finding | Severity | Category |
|---|---------|----------|----------|
| DC-IMG-01 | Image upload routes lack custom OTel spans (use multer callback pattern, bypassing `withSpan`) | LOW | Observability |
| DC-IMG-02 | `handleImageUpload` in detail views triggers immediately when `onFilesSelected` fires — no explicit "Upload" button for additional images on detail view | MEDIUM | UX |
| DC-IMG-03 | Image upload errors in detail views use a simple text error, while form-level errors use a styled error box — inconsistent error presentation | LOW | UI consistency |
| DC-IMG-04 | `ImageThumbnails` grid is fixed at 4 columns — may be too compressed on narrow viewports or too sparse when there's only 1 image | LOW | Responsive design |
| DC-IMG-05 | Orchestrator image submission (FR-087) re-downloads images from `/uploads/` to convert to File objects — works but adds latency for large images | LOW | Performance |
| DC-IMG-06 | No loading/progress indicator during image upload from detail views (upload occurs immediately on file selection) | MEDIUM | UX feedback |
| DC-IMG-07 | `generateImageId` in imageService.ts uses sequential ID generation by querying MAX(id) — potential race condition under concurrent uploads (unlikely in single-user SQLite but worth noting) | LOW | Data integrity |
| DC-IMG-08 | Delete image endpoint (`DELETE /:id/images/:imageId`) does not verify that the image belongs to the specified entity (`:id`) — any valid imageId will be deleted regardless of the parent entity | MEDIUM | API correctness |

### Finding Details

**DC-IMG-02 (MEDIUM):** In `FeatureRequestDetail.tsx` and `BugDetail.tsx`, `handleImageUpload` is wired directly to `<ImageUpload onFilesSelected={handleImageUpload} />`. This means as soon as the user selects files, they are uploaded immediately. There's no confirmation step. For the create forms, this is handled correctly (images are collected, then uploaded after entity creation). But on detail views, accidental file selection triggers an immediate upload with no cancel option.

**DC-IMG-06 (MEDIUM):** Related to DC-IMG-02. Since uploads trigger immediately on file selection from detail views, there's no visual indication that an upload is in progress. The user has no feedback until either the thumbnails update (success) or an error appears (failure). Forms handle this better with the `submitting` state disabling the button.

**DC-IMG-08 (MEDIUM):** The `DELETE /api/feature-requests/:id/images/:imageId` and `DELETE /api/bugs/:id/images/:imageId` routes call `deleteImage(getDb(), imageId)` without verifying that the image's `entity_id` matches `:id`. This means `DELETE /api/feature-requests/FR-0001/images/IMG-0005` would succeed even if IMG-0005 belongs to BUG-0002. This is an API correctness issue — the route implies entity scoping but doesn't enforce it.

### Severity Distribution

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 0 |
| MEDIUM | 3 |
| LOW | 5 |

---

## 7. Verdict

**PASSED_WITH_OBSERVATIONS**

The image upload implementation is comprehensive and well-structured. All 20 image-upload FRs (FR-070 through FR-089) are implemented with full test coverage and traceability. The architecture follows the established patterns (service layer, shared types, structured logging, Prometheus metrics). All design decisions (DD-IMG-01 through DD-IMG-08) are correctly implemented.

The three MEDIUM findings are UX polish and API correctness issues:
- DC-IMG-02 and DC-IMG-06 are about the immediate-upload-on-selection behavior in detail views, which could be improved with a confirmation/progress pattern
- DC-IMG-08 is an entity-scoping gap in the delete endpoint that should be addressed to prevent cross-entity image deletion

No CRITICAL or HIGH issues. No regressions introduced. Backend tests: 465/465 pass. Frontend image tests: 27/27 pass. Traceability: 100% coverage for implemented FRs.
