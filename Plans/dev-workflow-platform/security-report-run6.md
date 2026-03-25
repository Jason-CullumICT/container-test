# Security Review Report — Development Workflow Platform (Run 6)

**Pipeline Run ID:** (pending — assigned by orchestrator)
**Reviewer:** Security QA Agent
**Date:** 2026-03-25
**Scope:** Image upload feature (FR-070 through FR-089) + carry-forward of all prior findings
**Previous Report:** Plans/dev-workflow-platform/security-report-run5.md (Run 5)

---

## Verdict: PASSED_WITH_WARNINGS

The image upload feature is well-implemented with strong security fundamentals: UUID-based filenames prevent path traversal, multer enforces MIME type whitelist and size limits, all queries use parameterized statements, and structured logging covers all operations. Two MEDIUM issues are identified — cross-entity image deletion (the delete endpoint does not verify that the image belongs to the specified entity) and an unbounded multipart proxy buffer — alongside several carry-forward LOW findings. No CRITICAL or HIGH issues found.

---

## Test Results

| Suite | Files | Tests | Result |
|-------|-------|-------|--------|
| Backend | 14 | 465 | ALL PASSED |
| Frontend | 12 | 189 | 186 passed, 3 failed (pre-existing Layout.test.tsx failures) |
| Traceability | — | 62 FRs | PASS (100% coverage of implemented FRs) |

**Total: 651 passing, 3 pre-existing failures** (Layout.test.tsx badge count rendering — not related to image upload).
**Baseline comparison:** Run 5 had 542 tests. Run 6 adds 109 tests (62 backend image + 47 frontend image). Zero new regressions from image upload.

---

## New Feature Security Analysis (FR-070 through FR-089)

### File Upload Security (FR-073 — Multer Configuration) — CORRECT

**File:** `Source/Backend/src/middleware/upload.ts`

- MIME type whitelist: `image/jpeg`, `image/png`, `image/gif`, `image/webp` (line 13)
- Max file size: 5 MB (line 11)
- Max files per request: 5 (line 12)
- UUID-based filenames via `uuidv4()` (line 26) — prevents path traversal, filename collisions, and encoding issues (DD-IMG-02)
- Uploads directory created with `fs.mkdirSync({ recursive: true })` (line 17) — safe

### Image Service (FR-074) — CORRECT

**File:** `Source/Backend/src/services/imageService.ts`

- All SQL queries use parameterized `?` placeholders (lines 75-77, 112-113, 123, 129)
- Transaction-based insertion prevents partial uploads (line 80)
- File deletion uses `path.join(UPLOAD_DIR, row.filename)` where `row.filename` is a UUID set by multer — no user-controlled path components
- File deletion failures are caught and logged without propagating (lines 137-140)
- No `console.log` — uses structured logger (lines 100, 139, 143)
- Prometheus counter `image_uploads_total` incremented with `entity_type` label (line 101)

### Image Routes (FR-075, FR-076, FR-077) — CORRECT WITH ISSUE

**Files:** `Source/Backend/src/routes/featureRequests.ts` (lines 221-289), `Source/Backend/src/routes/bugs.ts` (lines 140-208)

**Upload (POST):**
- Entity existence validated before multer processes files (FR routes line 227, bug routes line 146)
- Multer errors handled: file-too-large → 400, invalid-type → 400
- No files → 400
- Correct 201 status with `{data: ImageAttachment[]}` response
- Uses service layer — no direct DB calls from routes

**List (GET):**
- Entity existence validated (404 on unknown entity)
- Returns `{data: ImageAttachment[]}` per contract

**Delete (DELETE) — SEE M-05 BELOW:**
- Only validates `imageId` exists in DB
- Does NOT verify the image belongs to the entity specified in the URL path

### Static File Serving (FR-077, DD-IMG-03) — ACCEPTABLE

**File:** `Source/Backend/src/index.ts` (line 56)

```typescript
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
```

- No authentication required — design decision DD-IMG-03 states this is acceptable for an internal dev workflow tool
- `express.static` prevents directory traversal by default
- UUID-based filenames make URL guessing infeasible
- Missing `X-Content-Type-Options: nosniff` header — see L-11

### Orchestrator Proxy Multipart (FR-078) — CORRECT WITH ISSUE

**File:** `Source/Backend/src/index.ts` (lines 82-99)

- Detects multipart via `content-type` header check (line 76)
- Preserves original content-type with boundary for correct multipart forwarding (line 93)
- Falls back to JSON for non-multipart requests (line 100)
- SSE passthrough preserved
- Error handling preserved (502 on orchestrator unreachable)
- **No size limit on buffered request body** — see M-06

### Database Schema (FR-072) — CORRECT

**File:** `Source/Backend/src/database/schema.ts` (lines 189-206)

- `CREATE TABLE IF NOT EXISTS` — idempotent migration
- `CHECK(entity_type IN ('feature_request', 'bug'))` constraint
- Index on `(entity_id, entity_type)` for query performance
- No foreign key constraint on `entity_id` — orphaned images possible if entity deleted without image cleanup (see L-12)

### Shared Types (FR-070, FR-071) — CORRECT

**Files:** `Source/Shared/types.ts`, `Source/Shared/api.ts`
- `ImageEntityType` union type matches DB CHECK constraint
- `ImageAttachment` interface matches DB schema
- `ImageAttachmentListResponse` and `ImageUploadResponse` use `DataResponse<ImageAttachment>`

### Frontend ImageUpload Component (FR-080) — CORRECT

**File:** `Source/Frontend/src/components/common/ImageUpload.tsx`

- Client-side MIME validation mirrors server whitelist (line 12, line 35)
- Client-side size validation mirrors server limit (line 39)
- Max files enforced (line 48)
- File previews use `URL.createObjectURL()` — no content injection risk
- `URL.revokeObjectURL()` called on cleanup (lines 52, 95) — no memory leak
- `input.accept` attribute for UX filtering (line 123)
- No `dangerouslySetInnerHTML` or unsafe patterns

### Frontend ImageThumbnails Component (FR-081) — CORRECT

**File:** `Source/Frontend/src/components/common/ImageThumbnails.tsx`

- Image URLs constructed from `img.filename` — server-generated UUID, not user input
- `target="_blank"` with `rel="noopener noreferrer"` — prevents reverse tabnabbing
- `original_name` rendered as JSX text node — React auto-escapes XSS
- Empty state returns `null` — clean

### Frontend API Client (FR-086) — CORRECT

**File:** `Source/Frontend/src/api/client.ts` (lines 289-370)

- `images.upload()` uses raw `fetch` with `FormData` — correct for multipart (no JSON Content-Type)
- `images.list()` uses `apiFetch` — correct for JSON GET
- `images.delete()` uses `apiFetch` with DELETE method
- `orchestrator.submitWork()` switches to FormData when images present (line 333)
- Error handling via `handleResponse()` — consistent with existing patterns

### Frontend Form Integration (FR-082, FR-083) — CORRECT

**Files:** `FeatureRequestForm.tsx`, `BugForm.tsx`

- Two-step upload: create entity first, then upload images (DD-IMG-01)
- Image state cleared on successful submit
- Error states handled

### Frontend Detail Views (FR-084, FR-085) — CORRECT

**Files:** `FeatureRequestDetail.tsx`, `BugDetail.tsx`

- Images fetched on mount via `images.list()`
- Delete calls `images.delete()` and updates local state
- Additional upload from detail view supported
- Image fetch failure is non-blocking (silent catch)

### Orchestrator Submit with Images (FR-087) — CORRECT

**File:** `Source/Frontend/src/components/feature-requests/FeatureRequestDetail.tsx` (lines 70-89)

- Downloads image files from `/uploads/{filename}` before sending to orchestrator
- Filenames come from server API response (not user input)
- Creates `File` objects with original name and MIME type for correct multipart encoding

### Observability (FR-079) — CORRECT

- Structured logging for upload and delete operations (imageService.ts lines 100, 143)
- Prometheus counter `image_uploads_total` with `entity_type` label
- No `console.log` calls in any image-related file

---

## Run 5 Findings — Carry-Forward Verification

| ID | Previous Finding | Status | Notes |
|----|-----------------|--------|-------|
| M-01 | All endpoints unauthenticated | **UNCHANGED** | Deliberate v1 decision. Image endpoints also unauthenticated. |
| L-02 | `/metrics` on same port | **UNCHANGED** | Now also exposes `image_uploads_total` counter |
| L-05-R | Uncapped length on spec_changes, assignee | **UNCHANGED** | |
| L-06 | Non-integer limit silently defaulted | **UNCHANGED** | |
| L-07 | Bug status transitions not guarded | **UNCHANGED** | |
| L-08 | Pipeline completeStageAction not transactional | **UNCHANGED** | |
| L-09 | Uncapped text fields in traceability | **UNCHANGED** | |
| L-10 | `related_work_item_type` not enum-validated | **UNCHANGED** | |

---

## Summary Table

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH     | 0 |
| MEDIUM   | 3 (M-01 unchanged + M-05, M-06 new) |
| LOW      | 10 (8 unchanged + L-11, L-12 new) |
| INFO     | 7 |

---

## Findings

### MEDIUM

#### M-01 — All API Endpoints Unauthenticated (Unchanged, Deliberate)

**Status:** Unchanged. Now includes image upload/list/delete endpoints and static file serving.

**Impact on new feature:** Any caller can:
- Upload images to any feature request or bug (disk space consumption)
- List images for any entity
- Delete any image by ID (see M-05 for additional concern)
- Access any uploaded image via `/uploads/{filename}` without auth

**Severity remains MEDIUM** — deliberate v1 decision for internal tool.

---

#### M-05 — Cross-Entity Image Deletion (NEW)

**Files:**
- `Source/Backend/src/routes/featureRequests.ts` (lines 281-289)
- `Source/Backend/src/routes/bugs.ts` (lines 200-208)

**Description:** The DELETE image endpoints do not verify that the image belongs to the specified entity. The route pattern is `DELETE /api/feature-requests/:id/images/:imageId`, but only `imageId` is used — the `:id` parameter is ignored.

Current code:
```typescript
router.delete('/:id/images/:imageId', async (req, res, next) => {
  try {
    const { imageId } = req.params;  // :id is never checked!
    deleteImage(getDb(), imageId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
```

**Attack scenario:**
1. User knows image `IMG-0001` belongs to `FR-0001`
2. User calls `DELETE /api/bugs/BUG-0001/images/IMG-0001`
3. Image is deleted despite belonging to a feature request, not a bug
4. More critically: `DELETE /api/feature-requests/FR-9999/images/IMG-0001` deletes an image from `FR-0001` even though the URL says `FR-9999`

**Impact:** Allows deletion of images from unrelated entities. In an authenticated multi-user system this would be a privilege escalation. In the current unauthenticated v1, the additional risk is marginal beyond M-01 but the endpoint semantics are incorrect.

**Remediation:**
```typescript
router.delete('/:id/images/:imageId', async (req, res, next) => {
  try {
    const { id, imageId } = req.params;
    const db = getDb();
    // Verify image belongs to this entity
    const image = db.prepare(
      'SELECT * FROM image_attachments WHERE id = ? AND entity_id = ?'
    ).get(imageId, id);
    if (!image) throw new AppError(404, 'Image not found');
    deleteImage(db, imageId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
```

---

#### M-06 — No Size Limit on Multipart Proxy Buffer (NEW)

**File:** `Source/Backend/src/index.ts` (lines 85-89)

**Description:** The orchestrator proxy buffers the entire multipart request body into memory before forwarding:

```typescript
const chunks: Buffer[] = [];
for await (const chunk of req) {
  chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
}
const body = Buffer.concat(chunks);
```

There is no size check on the accumulated buffer. While multer limits individual image uploads to 5 MB x 5 files = 25 MB on the image routes, the orchestrator proxy endpoint has no such limit. A malicious client could send a multi-gigabyte multipart request to `/api/orchestrator/api/work`, causing the server to buffer it all in memory and potentially crash with an out-of-memory error (Denial of Service).

**Impact:** Server crash via memory exhaustion. The `express.json({ limit: '16kb' })` middleware does NOT apply to multipart requests since they bypass the JSON body parser.

**Remediation:**
```typescript
const MAX_PROXY_BODY_SIZE = 50 * 1024 * 1024; // 50 MB
const chunks: Buffer[] = [];
let totalSize = 0;
for await (const chunk of req) {
  totalSize += chunk.length;
  if (totalSize > MAX_PROXY_BODY_SIZE) {
    return res.status(413).json({ error: 'Request body too large' });
  }
  chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
}
```

---

### LOW

#### L-02 — `/metrics` Endpoint Exposed Without Network Controls (Unchanged)

**Status:** Unchanged. Now also exposes `image_uploads_total` counter with `entity_type` labels.

---

#### L-05-R — Uncapped Length on spec_changes, assignee, Ticket Updates (Unchanged)

**Status:** Unchanged from Run 3.

---

#### L-06 — Dashboard Activity Route Silently Defaults Invalid `limit` (Unchanged)

**Status:** Unchanged from Run 2.

---

#### L-07 — Bug Status Transitions Not Guarded (Unchanged)

**Status:** Unchanged from Run 3.

---

#### L-08 — Pipeline completeStageAction Not Wrapped in a Transaction (Unchanged)

**Status:** Unchanged from Run 4.

---

#### L-09 — Uncapped Text Fields in Traceability (Unchanged)

**Status:** Unchanged from Run 5.

---

#### L-10 — `related_work_item_type` Not Enum-Validated (Unchanged)

**Status:** Unchanged from Run 5.

---

#### L-11 — Static File Serving Missing Security Headers (NEW)

**File:** `Source/Backend/src/index.ts` (line 56)

**Description:** The `/uploads` static file endpoint does not set `X-Content-Type-Options: nosniff` or `Content-Disposition: inline` headers. While files are stored with UUID names and multer validates MIME types, a MIME-spoofed file (e.g., HTML content with an image extension) could potentially be interpreted as HTML by older browsers without `nosniff`.

**Impact:** LOW — UUID filenames prevent URL guessing, MIME validation at upload time blocks non-image content, and modern browsers respect Content-Type headers. However, defense-in-depth warrants adding security headers.

**Remediation:**
```typescript
app.use('/uploads', (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
}, express.static(path.join(__dirname, '../uploads')));
```

---

#### L-12 — No Cascade Delete for Image Attachments (NEW)

**File:** `Source/Backend/src/database/schema.ts` (lines 189-206)

**Description:** The `image_attachments` table has no foreign key relationship with `feature_requests` or `bugs` tables. When a feature request or bug is deleted (`DELETE /api/feature-requests/:id` or `DELETE /api/bugs/:id`), associated image records remain in the database and files remain on disk, creating orphaned data.

**Impact:** LOW — data integrity concern, not a security vulnerability. Orphaned files accumulate on disk over time. Orphaned DB records have no functional impact since they are only queried by entity_id+entity_type.

**Remediation:** Add image cleanup to the entity delete service functions:
```typescript
// In featureRequestService.deleteFeatureRequest():
const imgs = listImages(db, id, 'feature_request');
for (const img of imgs) deleteImage(db, img.id);
```

---

### INFO

#### I-01 — SQL Injection: All Queries Correctly Parameterized

All database queries in `imageService.ts` and modified route files use `better-sqlite3` prepared statements with `?` placeholders. No SQL injection risk identified.

---

#### I-02 — XSS: React Default Escaping Used in All New Components

No `dangerouslySetInnerHTML`, `innerHTML`, `eval()`, or `document.write()` found in `ImageUpload.tsx`, `ImageThumbnails.tsx`, or any modified form/detail components. All user-supplied text (including `original_name`) rendered as JSX text nodes. No XSS risk identified.

---

#### I-03 — Path Traversal: UUID Filenames Prevent All Attack Vectors

Stored filenames are generated by multer as `${uuidv4()}${ext}` where `ext` comes from `path.extname(file.originalname)`. The UUID portion is server-generated, and `path.extname()` returns only the final extension (e.g., `.png`), preventing `../` injection. The `express.static` middleware provides additional path normalization. No path traversal risk identified.

---

#### I-04 — MIME Type Validation: Header-Based Only (Acceptable)

Multer validates file types by checking `file.mimetype` from the multipart Content-Type header. This is bypassable (an attacker could send a non-image file with a spoofed MIME type). However, the risk is mitigated by:
1. Files are stored with UUID names and never executed server-side
2. `express.static` derives Content-Type from file extension
3. This is an internal dev tool
4. Server-side validation provides the authoritative check; client validation is UX only

No additional magic-number validation is required for this use case.

---

#### I-05 — No console.log Calls in Image Code

Verified: zero `console.log` calls across all image-related backend source files. All logging uses the structured logger abstraction. Compliant with observability requirements.

---

#### I-06 — No Hardcoded Secrets in Image Code

No API keys, tokens, passwords, or hardcoded file paths in any image-related file. Upload directory derived from `__dirname`. Compliant.

---

#### I-07 — Client-Side Validation Mirrors Server (Defense in Depth)

`ImageUpload.tsx` validates MIME types against the same whitelist (`image/jpeg`, `image/png`, `image/gif`, `image/webp`) and enforces the same 5 MB size limit and 5 file maximum as the multer configuration. This provides immediate user feedback while the server remains the authoritative validator. Correctly implemented per DD-IMG-07.

---

## Positive Security Observations

1. **UUID-based filenames** — Prevents path traversal, collision, and URL guessing attacks
2. **MIME whitelist** — Only 4 image types accepted; all others rejected with 400
3. **File size limits** — 5 MB per file, 5 files per request enforced at multer level
4. **Entity existence validation** — 404 returned before multer processes files (prevents orphaned uploads)
5. **Transaction-based insertions** — Atomic: either all image records are created or none
6. **Structured logging** — All upload/delete operations logged with entity context
7. **Prometheus metrics** — `image_uploads_total` counter tracks upload volume by entity type
8. **Service layer pattern** — No direct DB calls from route handlers
9. **Parameterized queries** — 100% of image queries use prepared statements
10. **React auto-escaping** — All user content (filenames, descriptions) rendered safely
11. **Memory leak prevention** — `URL.revokeObjectURL()` called on component cleanup
12. **Two-step upload design** — Creates entity first (JSON), then uploads images (multipart) — simpler and more robust than single multipart create
13. **Error isolation** — Image fetch failures on detail views are non-blocking (silent catch)
14. **FormData for uploads** — Frontend correctly avoids JSON Content-Type for multipart requests
15. **CORS protection** — Image upload endpoints inherit the global CORS whitelist

---

## Architecture Compliance

| Rule | Status |
|------|--------|
| Specs are source of truth | PASS — Implementation traces to FR-070 through FR-089 |
| No direct DB calls from routes | PASS — Routes delegate to imageService |
| Shared types single source | PASS — ImageAttachment, ImageEntityType in Shared/types.ts |
| Every FR has a test with traceability | PASS — 62/62 implemented FRs covered |
| Schema changes via migration | PASS — image_attachments table + index in schema.ts |
| No hardcoded secrets | PASS |
| List endpoints return {data: T[]} | PASS — All image list/upload endpoints return {data: ImageAttachment[]} |
| Routes have observability | PASS — Structured logging + Prometheus counter + OTel spans |
| Business logic has no framework imports | PASS — imageService uses only DB, fs, path, uuid |

---

## Comparison: Run 5 → Run 6

| Metric | Run 5 | Run 6 |
|--------|-------|-------|
| Verdict | PASSED_WITH_WARNINGS | PASSED_WITH_WARNINGS |
| CRITICAL | 0 | 0 |
| HIGH | 0 | 0 |
| MEDIUM | 1 | 3 (+2 new: M-05 cross-entity delete, M-06 proxy buffer) |
| LOW | 7 | 10 (+2 new: L-11 missing headers, L-12 no cascade delete) |
| INFO | 6 | 7 (+4 new image-specific, -3 consolidated) |
| Backend tests | 403 | 465 (+62 image tests) |
| Frontend tests | 139 | 186 passed (+47 image tests; 3 pre-existing failures in Layout.test.tsx) |
| Traceability | 47 FRs at 100% | 62 FRs at 100% |
| New endpoints | 2 feedback | 6 image endpoints + modified orchestrator proxy + static serving |
| New security controls | N/A | MIME whitelist, file size limits, UUID filenames, entity existence validation, transaction-based inserts |
