# Image Upload — Implementation Plan

## Overview

Add image upload support to feature requests and bug reports. Users can attach images via drag-and-drop or click-to-upload on forms. Images stored on backend disk via multer. Images forwarded to orchestrator as multipart form-data when submitting work.

## Reference Documents

- Requirements: `Plans/image-upload/requirements.md`
- API Contracts: `Plans/image-upload/contracts.md`
- Design Decisions: `Plans/image-upload/design.md`
- Existing Spec: `Specifications/dev-workflow-platform.md`
- Shared Types: `Source/Shared/types.ts`, `Source/Shared/api.ts`

## Stage 3 — Implementation Dispatch

### Backend Coder 1: Core image infrastructure

**FRs:** FR-070, FR-071, FR-072, FR-073, FR-074, FR-075, FR-076, FR-077, FR-079

**Files to modify:**
- `Source/Shared/types.ts` — Add `ImageEntityType`, `ImageAttachment` type
- `Source/Shared/api.ts` — Add `ImageAttachmentListResponse`, `ImageUploadResponse`
- `Source/Backend/src/database/schema.ts` — Add `image_attachments` table + index migration
- `Source/Backend/src/middleware/upload.ts` — NEW: multer config (see contracts.md)
- `Source/Backend/src/services/imageService.ts` — NEW: uploadImages, listImages, deleteImage
- `Source/Backend/src/routes/featureRequests.ts` — Add image sub-routes (POST/GET/DELETE :id/images)
- `Source/Backend/src/routes/bugs.ts` — Add image sub-routes (POST/GET/DELETE :id/images)
- `Source/Backend/src/index.ts` — Add `express.static` for `/uploads/` serving; `npm install multer @types/multer`
- `Source/Backend/package.json` — Add multer dependency

**Steps:**
1. Add shared types to `Source/Shared/types.ts` and `Source/Shared/api.ts` (see contracts.md for exact definitions)
2. Add `image_attachments` table migration to `schema.ts` (CREATE TABLE IF NOT EXISTS + index)
3. Install multer: add to `package.json` dependencies
4. Create `Source/Backend/src/middleware/upload.ts` with multer config per contracts.md
5. Create `Source/Backend/src/services/imageService.ts` with uploadImages, listImages, deleteImage per contracts.md
6. Add image routes to `Source/Backend/src/routes/featureRequests.ts`: POST/GET/DELETE `:id/images`
7. Add image routes to `Source/Backend/src/routes/bugs.ts`: POST/GET/DELETE `:id/images`
8. In `Source/Backend/src/index.ts`: mount `express.static` for uploads directory at `/uploads/`
9. Add structured logging and Prometheus counter for image operations (FR-079)
10. Ensure uploads directory exists (create in service init or middleware)

**Architecture rules to follow:**
- Service layer between routes and DB (no direct DB calls in routes)
- Structured logging via project logger (not console.log)
- Error responses as `{ error: "message" }`
- Use `uuid` for IMG-XXXX ID generation (same pattern as other entities)

### Backend Coder 2: Orchestrator proxy + backend tests

**FRs:** FR-078, FR-088

**Files to modify:**
- `Source/Backend/src/index.ts` — Modify orchestrator proxy to handle multipart forwarding
- `Source/Backend/tests/imageService.test.ts` — NEW: service tests
- `Source/Backend/tests/imageRoutes.test.ts` — NEW: route tests
- `Source/Backend/tests/orchestratorProxy.test.ts` — NEW or modify: multipart proxy test

**Steps:**
1. Modify orchestrator proxy in `index.ts`:
   - Check incoming content-type for `multipart/form-data`
   - If multipart: pipe request body to orchestrator with original headers (content-type with boundary)
   - If JSON: existing behavior (stringify body)
   - Preserve SSE handling and error handling
2. Write backend tests for image service (FR-088):
   - Test uploadImages with mock files
   - Test listImages returns correct images for entity
   - Test deleteImage removes record + file
   - Test entity validation (non-existent FR/bug returns error)
3. Write backend tests for image routes:
   - POST with valid images → 201
   - POST with no files → 400
   - POST to non-existent entity → 404
   - GET images for entity → 200 with correct data
   - DELETE image → 204
   - DELETE non-existent image → 404
4. Write test for orchestrator proxy multipart forwarding
5. All tests must have `// Verifies: FR-XXX` comments

### Frontend Coder 1: Reusable components + API client

**FRs:** FR-080, FR-081, FR-086

**Files to create/modify:**
- `Source/Frontend/src/components/common/ImageUpload.tsx` — NEW: drag-and-drop upload component
- `Source/Frontend/src/components/common/ImageThumbnails.tsx` — NEW: thumbnail grid component
- `Source/Frontend/src/api/client.ts` — Add `images` namespace with upload/list/delete; modify `orchestrator.submitWork`

**Steps:**
1. Create `ImageUpload.tsx` (FR-080):
   - Drag-and-drop zone with `onDragOver`, `onDrop` handlers
   - Hidden file input triggered by click on zone
   - File preview using `URL.createObjectURL`
   - Client-side validation: MIME type check, size check
   - Error messages for invalid files
   - `onFilesSelected` callback with validated File[]
   - Tailwind styling: dashed border zone, hover states
2. Create `ImageThumbnails.tsx` (FR-081):
   - Grid layout of thumbnail images
   - Each image links to `/uploads/{filename}` (opens in new tab on click)
   - Optional delete button (X icon) per thumbnail when `allowDelete=true`
   - Empty state: nothing rendered (or subtle "No images" text)
   - Tailwind styling: grid, rounded corners, hover overlay
3. Update `client.ts` (FR-086):
   - Add `images` export object with `upload`, `list`, `delete` methods
   - `upload` uses raw `fetch` with `FormData` (NOT apiFetch — skip JSON content-type)
   - `list` uses `apiFetch` (returns JSON)
   - `delete` uses `apiFetch` with DELETE method
   - Modify `orchestrator.submitWork` to accept optional `images: File[]` parameter
   - When images present, use FormData instead of JSON body

### Frontend Coder 2: Form + detail integration + tests

**FRs:** FR-082, FR-083, FR-084, FR-085, FR-087, FR-089

**Files to modify:**
- `Source/Frontend/src/components/feature-requests/FeatureRequestForm.tsx` — Add ImageUpload, upload after create
- `Source/Frontend/src/components/bugs/BugForm.tsx` — Add ImageUpload, upload after create
- `Source/Frontend/src/components/feature-requests/FeatureRequestDetail.tsx` — Add ImageThumbnails, fetch images
- `Source/Frontend/src/components/bugs/BugDetail.tsx` — Add ImageThumbnails, fetch images
- Frontend test files for all above components

**Steps:**
1. Update `FeatureRequestForm.tsx` (FR-082):
   - Add state for selected files: `const [imageFiles, setImageFiles] = useState<File[]>([])`
   - Add `<ImageUpload onFilesSelected={setImageFiles} />` below description field
   - Modify submit handler: after successful FR creation (response has `id`), call `images.upload('feature-requests', id, imageFiles)`
   - Show upload progress/status
   - Clear image state on successful submit
2. Update `BugForm.tsx` (FR-083): Same pattern as FeatureRequestForm
3. Update `FeatureRequestDetail.tsx` (FR-084):
   - Fetch images on mount: `images.list('feature-requests', id)`
   - Render `<ImageThumbnails images={...} allowDelete onDelete={handleDelete} />`
   - Add `<ImageUpload>` for uploading additional images
   - handleDelete calls `images.delete(...)` and refetches
4. Update `BugDetail.tsx` (FR-085): Same pattern as FeatureRequestDetail
5. Update orchestrator submit flow (FR-087):
   - Where features are submitted to orchestrator, fetch images for the FR
   - Download image files (fetch from `/uploads/{filename}`)
   - Pass images to `orchestrator.submitWork(task, { images })`
6. Write frontend tests (FR-089):
   - ImageUpload: renders drop zone, handles file selection, validates types/sizes
   - ImageThumbnails: renders images, delete callback, empty state
   - FeatureRequestForm: image upload field present, upload called after create
   - BugForm: same as above
   - FeatureRequestDetail: images fetched and displayed
   - BugDetail: same as above
   - All tests have `// Verifies: FR-XXX` comments

## Stage 4 — QA (all mandatory, unconditional)

Standard QA pipeline per team-leader.md:
- chaos_tester
- security-qa (focus: file upload validation, path traversal, MIME type spoofing, file size limits)
- traceability-reporter (verify FR-070 through FR-089 coverage)
- visual-playwright (verify upload UI, thumbnails, form integration)
- qa-review-and-tests (run all backend + frontend tests)
- design_critic
- integration-reviewer
