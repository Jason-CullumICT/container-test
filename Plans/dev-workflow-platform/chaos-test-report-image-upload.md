# Chaos Test Report: Image Upload Feature

**Chaos Tester:** chaos_tester agent
**Pipeline Run:** run-1774399447307-405283e6
**Date:** 2026-03-25
**Verdict:** CONDITIONAL PASS (2 HIGH, 2 MEDIUM, 3 LOW, 2 INFO findings)

---

## 1. Summary

Image upload implementation covers FR-070 through FR-089. All backend tests pass (465/465). Frontend has 3 pre-existing failures in Layout.test.tsx (unrelated to image upload). Traceability enforcer passes — all 20 image FRs have test coverage.

The implementation is functionally complete but has several adversarial issues that should be addressed before production use.

---

## 2. Findings

### FINDING-1: Image delete endpoint ignores entity ownership (HIGH)

**Severity:** HIGH
**Files:** `Source/Backend/src/routes/featureRequests.ts:281-289`, `Source/Backend/src/routes/bugs.ts:200-208`
**FRs affected:** FR-077

**Description:** The DELETE `/api/feature-requests/:id/images/:imageId` and DELETE `/api/bugs/:id/images/:imageId` routes extract `:imageId` and delete the image without verifying that the image actually belongs to the entity specified in `:id`. The `deleteImage` service function only checks the image exists by ID — it does not validate `entity_id` or `entity_type`.

**Adversarial scenario:** An attacker can delete any image in the system by knowing its `imageId`, regardless of which entity's URL they use. For example, `DELETE /api/feature-requests/FR-0001/images/IMG-0005` would delete `IMG-0005` even if it belongs to `BUG-0002`.

**Recommendation:** The `deleteImage` service should accept `entityId` and `entityType` parameters and verify the image belongs to the specified entity before deleting. Alternatively, the route handler should validate ownership after the `deleteImage` call or before it.

---

### FINDING-2: Detail view ImageUpload causes duplicate uploads (HIGH)

**Severity:** HIGH
**Files:** `Source/Frontend/src/components/feature-requests/FeatureRequestDetail.tsx:49-57`, `Source/Frontend/src/components/bugs/BugDetail.tsx:49-57`
**FRs affected:** FR-084, FR-085

**Description:** In detail views, `ImageUpload`'s `onFilesSelected` callback is wired directly to `handleImageUpload`, which immediately calls `images.upload()`. However, the `ImageUpload` component calls `onFilesSelected` with ALL currently selected files (not just new ones) on every state change. This means:

1. User selects file A → `onFilesSelected([A])` → uploads A (creates IMG-0001)
2. User selects file B → `onFilesSelected([A, B])` → uploads A and B again (creates IMG-0002 for A, IMG-0003 for B)

Each file addition re-uploads all previously selected files, creating duplicate records in the database.

**Recommendation:** Either:
- Track which files have already been uploaded and only upload new ones
- Use a separate "Upload" button instead of auto-uploading on selection
- Clear the ImageUpload component's state after each successful upload

---

### FINDING-3: No file size limit on orchestrator proxy multipart forwarding (MEDIUM)

**Severity:** MEDIUM
**Files:** `Source/Backend/src/index.ts:82-99`
**FRs affected:** FR-078

**Description:** The orchestrator proxy route buffers the entire multipart request body into memory using `Buffer.concat(chunks)` without any size limit. While image upload routes go through multer (which enforces 5MB per file, 5 files max = 25MB total), the orchestrator proxy path has no such protection. A malicious client could send a very large multipart body to `/api/orchestrator/api/work` and exhaust server memory.

**Recommendation:** Add a body size limit to the multipart forwarding path (e.g., `express.raw({ limit: '30mb', type: 'multipart/form-data' })`) or implement a streaming pipe instead of buffering.

---

### FINDING-4: MIME type validation relies on client-declared Content-Type only (MEDIUM)

**Severity:** MEDIUM
**Files:** `Source/Backend/src/middleware/upload.ts:30-36`
**FRs affected:** FR-073

**Description:** Multer's `fileFilter` checks `file.mimetype`, which is the MIME type declared by the client in the multipart headers. An attacker could upload a non-image file (e.g., an HTML file with embedded JavaScript) by declaring `Content-Type: image/png` in the multipart part headers. Since files are served via `express.static` without `Content-Type` headers being overridden, the browser would infer the type from the file content or use the served header, potentially executing malicious content.

**Mitigating factor:** Per DD-IMG-03, this is an internal dev tool with no auth on file serving. However, if the tool is exposed on a network, stored XSS via uploaded HTML-as-PNG is possible.

**Recommendation:** Either:
- Validate file magic bytes (file signature) in addition to MIME type
- Set `Content-Disposition: attachment` header on static file serving to prevent browser rendering
- Add `X-Content-Type-Options: nosniff` header on static responses

---

### FINDING-5: Image ID generation uses MAX-based sequential IDs — potential collision under concurrent transaction (LOW)

**Severity:** LOW
**Files:** `Source/Backend/src/services/imageService.ts:42-49`
**FRs affected:** FR-074

**Description:** The `generateImageId` function reads the highest ID and increments by 1. This runs inside a `db.transaction()` block, which provides SQLite's single-writer guarantee. However, the ID generation query runs separately from the insert. If the transaction is retried or if the ID generation is called outside a transaction in the future, collisions could occur.

**Mitigating factor:** SQLite is single-writer, so in practice this is safe. The transaction wrapper in `uploadImagesService` ensures atomicity. The pattern is consistent with all other ID generators in the codebase (verified in chaos-test-report-run3.md).

**Recommendation:** No immediate action needed. Document the single-writer assumption.

---

### FINDING-6: No cleanup of orphaned uploaded files (LOW)

**Severity:** LOW
**Files:** `Source/Backend/src/services/imageService.ts`, `Source/Backend/src/middleware/upload.ts`
**FRs affected:** FR-074, FR-073

**Description:** Multer writes files to disk before the service layer runs. If the database insertion fails (e.g., due to a constraint violation or DB error), the uploaded files remain on disk as orphans. There is no cleanup mechanism to remove files that were written by multer but never recorded in the database.

Similarly, if an entity (FR or bug) is deleted, its associated image files remain on disk. The CASCADE on the DB foreign key would only help if image_attachments had a FK to feature_requests/bugs, which it doesn't (entity_id is a plain TEXT field, not a foreign key).

**Recommendation:**
- Add error handling in the route to clean up multer files if the service call fails
- Consider a periodic cleanup job for orphaned files
- Consider adding cascade image deletion when an entity is deleted

---

### FINDING-7: Frontend `handleImageUpload` in detail views has no debounce (LOW)

**Severity:** LOW
**Files:** `Source/Frontend/src/components/feature-requests/FeatureRequestDetail.tsx:49-57`, `Source/Frontend/src/components/bugs/BugDetail.tsx:49-57`
**FRs affected:** FR-084, FR-085

**Description:** Rapid file selections in the detail view could fire multiple concurrent upload requests. While the backend handles concurrent writes safely (SQLite single-writer), this could cause confusing UX with multiple in-flight requests and no loading indicator.

**Recommendation:** Add a loading state or debounce to the upload handler in detail views.

---

### FINDING-8: Pre-existing Layout.test.tsx failures (3 tests) (INFO)

**Severity:** INFO
**FRs affected:** FR-022

**Description:** Three tests fail in `Source/Frontend/tests/Layout.test.tsx` — all related to sidebar badge counts. These failures pre-date the image upload feature and are not caused by image upload changes. The failures are:
- Badge count rendering tests (expecting text '5', '3', '8' in the rendered output)

**Recommendation:** These are pre-existing failures that should be tracked separately.

---

### FINDING-9: Shared types are properly defined and exported (INFO)

**Severity:** INFO
**FRs affected:** FR-070, FR-071

**Description:** Verification that:
- `ImageEntityType` and `ImageAttachment` are exported from `Source/Shared/types.ts` (line 127-138)
- `ImageAttachmentListResponse` and `ImageUploadResponse` are exported from `Source/Shared/api.ts` (line 126-127)
- Both backend and frontend correctly import from Shared/ — no inline type re-definitions found
- The `ImageAttachment` interface matches the contracts exactly (all 8 fields present with correct types)

---

## 3. Contract Compliance

| Contract | Status | Notes |
|----------|--------|-------|
| `POST /api/feature-requests/:id/images` → 201 `{data: ImageAttachment[]}` | PASS | Correct response shape and status |
| `POST /api/feature-requests/:id/images` → 404 on unknown FR | PASS | Validated in tests |
| `POST /api/feature-requests/:id/images` → 400 on no files | PASS | Validated in tests |
| `POST /api/feature-requests/:id/images` → 400 on invalid MIME | PASS | Validated in tests |
| `POST /api/bugs/:id/images` → 201, 404, 400 | PASS | Same patterns as FR routes |
| `GET /api/feature-requests/:id/images` → 200 `{data: ImageAttachment[]}` | PASS | Correct |
| `GET /api/bugs/:id/images` → 200 `{data: ImageAttachment[]}` | PASS | Correct |
| `DELETE /api/feature-requests/:id/images/:imageId` → 204 | PASS | But see FINDING-1 (no ownership check) |
| `DELETE /api/bugs/:id/images/:imageId` → 204 | PASS | Same |
| `GET /uploads/:filename` (static) | PASS | Express.static mounted correctly |
| Multer: max 5MB, max 5 files, image MIME only | PASS | Config matches contracts.md exactly |
| Orchestrator multipart forwarding | PASS | JSON and multipart paths both work |
| `image_attachments` table schema | PASS | All columns present, CHECK constraint on entity_type, index on (entity_id, entity_type) |
| ImageUpload component: drag-and-drop, click, validation | PASS | All behaviors implemented and tested |
| ImageThumbnails component: grid, links, delete | PASS | All behaviors implemented and tested |
| Form integration: upload after create | PASS | Both FeatureRequestForm and BugForm wire correctly |
| Detail view: fetch + display + upload + delete | PARTIAL | Works but has duplicate upload bug (FINDING-2) |
| Orchestrator submit with images | PASS | FR-087 correctly fetches images and sends as multipart |
| Prometheus `image_uploads_total` counter | PASS | Counter with `entity_type` label in metrics.ts |
| Structured logging for upload/delete | PASS | logger.info calls in imageService.ts |

---

## 4. Test Coverage

| Test File | Tests | Status | FRs |
|-----------|-------|--------|-----|
| `Source/Backend/tests/imageService.test.ts` | 11 | PASS | FR-074, FR-088 |
| `Source/Backend/tests/images.test.ts` | 21 | PASS | FR-072-FR-079, FR-088 |
| `Source/Backend/tests/orchestratorProxy.test.ts` | 7 | PASS | FR-078, FR-088 |
| `Source/Frontend/tests/ImageUpload.test.tsx` | 14 | PASS | FR-080-FR-085, FR-087, FR-089 |
| `Source/Frontend/tests/ImageComponents.test.tsx` | 19 | PASS | FR-080, FR-081, FR-086, FR-089 |

**Total image-related tests:** 72 tests, all passing.

**Traceability enforcer:** PASS — all FR-070 through FR-089 have `// Verifies:` coverage.

---

## 5. Architecture Compliance

| Rule | Status | Notes |
|------|--------|-------|
| No direct DB calls from route handlers | PASS | Routes delegate to `imageService.ts` |
| Shared types from Source/Shared/ | PASS | No inline re-definitions |
| Service layer pattern | PASS | `uploadImagesService`, `listImages`, `deleteImage` |
| Structured logging (not console.log) | PASS | Uses project logger |
| Error responses as `{error: "message"}` | PASS | Consistent error shape |
| Observability (logging + metrics) | PASS | FR-079 fully implemented |
| Business logic has no framework imports | PASS | Service uses pure functions + better-sqlite3 |

---

## 6. Verdict

**CONDITIONAL PASS** — The image upload feature is functionally complete with good test coverage and traceability. However, FINDING-1 (no ownership check on delete) and FINDING-2 (duplicate uploads in detail views) should be fixed before the feature is considered production-ready.

### Required fixes before PASS:
1. **FINDING-1 (HIGH):** Add entity ownership validation to image delete endpoints
2. **FINDING-2 (HIGH):** Fix duplicate upload behavior in detail view ImageUpload integration

### Recommended improvements:
3. **FINDING-3 (MEDIUM):** Add body size limit to orchestrator proxy multipart path
4. **FINDING-4 (MEDIUM):** Add file magic byte validation or Content-Disposition header
