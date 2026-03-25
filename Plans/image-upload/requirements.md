# Image Upload — Requirements

## Functional Requirements

### Shared Types (FR-070 — FR-071)

| ID | Description | Layer | Acceptance Criteria |
|----|-------------|-------|---------------------|
| FR-070 | Add `ImageAttachment` shared type with id, entity_id, entity_type ('feature_request' \| 'bug'), filename, original_name, mime_type, size_bytes, created_at fields. Export from `Source/Shared/types.ts` | [fullstack] | Type compiles; both layers import from Shared/ |
| FR-071 | Add `ImageAttachmentListResponse` (DataResponse\<ImageAttachment\>), `ImageUploadResponse` (ImageAttachment) API types to `Source/Shared/api.ts` | [fullstack] | Request/response types cover all image endpoints |

### Backend — Storage & Schema (FR-072 — FR-073)

| ID | Description | Layer | Acceptance Criteria |
|----|-------------|-------|---------------------|
| FR-072 | Add `image_attachments` table: id (TEXT PK, IMG-XXXX), entity_id (TEXT NOT NULL), entity_type (TEXT NOT NULL, 'feature_request' or 'bug'), filename (TEXT NOT NULL), original_name (TEXT NOT NULL), mime_type (TEXT NOT NULL), size_bytes (INTEGER NOT NULL), created_at (TEXT NOT NULL). Idempotent migration | [backend] | Table created; migration is idempotent; existing data unaffected |
| FR-073 | Configure multer middleware: destination `Source/Backend/uploads/`, max file size 5 MB, accept only image MIME types (image/jpeg, image/png, image/gif, image/webp), max 5 files per request. Create uploads directory if it doesn't exist | [backend] | Multer rejects non-image files with 400; rejects >5 MB with 400; stores to correct directory |

### Backend — Image Service & Routes (FR-074 — FR-077)

| ID | Description | Layer | Acceptance Criteria |
|----|-------------|-------|---------------------|
| FR-074 | Image service: `uploadImages(db, entityId, entityType, files[])` — inserts records, returns ImageAttachment[]; `listImages(db, entityId, entityType)` — returns ImageAttachment[]; `deleteImage(db, imageId)` — removes record and file from disk | [backend] | Service methods work correctly; file cleanup on delete; entity validation |
| FR-075 | `POST /api/feature-requests/:id/images` — upload images for a feature request. Validates FR exists (404 if not). Uses multer middleware. Returns `{data: ImageAttachment[]}` with status 201 | [backend] | Upload stores files; DB records created; 404 on unknown FR; 400 on invalid files |
| FR-076 | `POST /api/bugs/:id/images` — upload images for a bug report. Validates bug exists (404 if not). Uses multer middleware. Returns `{data: ImageAttachment[]}` with status 201 | [backend] | Upload stores files; DB records created; 404 on unknown bug; 400 on invalid files |
| FR-077 | `GET /api/feature-requests/:id/images` and `GET /api/bugs/:id/images` — list images for entity. Returns `{data: ImageAttachment[]}`. `DELETE /api/feature-requests/:id/images/:imageId` and `DELETE /api/bugs/:id/images/:imageId` — delete image, returns 204. Serve uploaded files at `GET /uploads/:filename` (static) | [backend] | List returns correct images; delete removes file+record; static serving works; 404 on unknown |

### Backend — Orchestrator Integration (FR-078)

| ID | Description | Layer | Acceptance Criteria |
|----|-------------|-------|---------------------|
| FR-078 | Modify orchestrator proxy to support multipart form-data. When the frontend POSTs to `/api/orchestrator/api/work` with multipart data (task + image files), forward as multipart to the orchestrator. Fall back to JSON for requests without files | [backend] | Multipart requests forwarded with files intact; JSON requests still work; proxy error handling preserved |

### Backend — Observability (FR-079)

| ID | Description | Layer | Acceptance Criteria |
|----|-------------|-------|---------------------|
| FR-079 | Structured logging for image upload/delete operations. Prometheus counter `image_uploads_total` with labels entity_type. OTel spans for upload and delete operations | [backend] | Log entries for uploads/deletes; counter incremented; spans on service calls |

### Frontend — Upload Component (FR-080 — FR-081)

| ID | Description | Layer | Acceptance Criteria |
|----|-------------|-------|---------------------|
| FR-080 | `ImageUpload` reusable component: drag-and-drop zone + click-to-upload button. Accepts multiple images. Shows file previews before upload. Displays upload progress. Validates file type and size client-side (same limits as backend). Calls `onFilesSelected(files: File[])` callback | [frontend] | Drop zone accepts drag; click opens file picker; previews shown; invalid files rejected with message |
| FR-081 | `ImageThumbnails` reusable component: displays list of ImageAttachment objects as a thumbnail grid. Each thumbnail is clickable to view full size (lightbox or new tab). Shows delete button (optional, controlled by `allowDelete` prop). Calls `onDelete(imageId)` callback | [frontend] | Thumbnails render; click opens full image; delete button calls callback; empty state handled |

### Frontend — Form Integration (FR-082 — FR-083)

| ID | Description | Layer | Acceptance Criteria |
|----|-------------|-------|---------------------|
| FR-082 | Update `FeatureRequestForm` to include `ImageUpload` component. After FR is created (POST returns id), upload selected images to `POST /api/feature-requests/:id/images`. Show upload status. Form clears images on successful submit | [frontend] | Images upload after FR creation; errors shown; form reset works |
| FR-083 | Update `BugForm` to include `ImageUpload` component. After bug is created (POST returns id), upload selected images to `POST /api/bugs/:id/images`. Show upload status. Form clears images on successful submit | [frontend] | Images upload after bug creation; errors shown; form reset works |

### Frontend — Detail View Integration (FR-084 — FR-085)

| ID | Description | Layer | Acceptance Criteria |
|----|-------------|-------|---------------------|
| FR-084 | Update `FeatureRequestDetail` to fetch and display images using `ImageThumbnails`. Fetch from `GET /api/feature-requests/:id/images`. Allow image deletion. Support additional image upload from detail view | [frontend] | Images display on detail; delete works; upload from detail works |
| FR-085 | Update `BugDetail` to fetch and display images using `ImageThumbnails`. Fetch from `GET /api/bugs/:id/images`. Allow image deletion. Support additional image upload from detail view | [frontend] | Images display on detail; delete works; upload from detail works |

### Frontend — API Client (FR-086)

| ID | Description | Layer | Acceptance Criteria |
|----|-------------|-------|---------------------|
| FR-086 | Add image API functions to `client.ts`: `uploadImages(entityType, entityId, files)` using FormData (no JSON Content-Type), `listImages(entityType, entityId)`, `deleteImage(entityType, entityId, imageId)`. Update `orchestrator.submitWork` to accept optional `images: File[]` and send as multipart when present | [frontend] | Upload sends FormData; list/delete work; orchestrator sends multipart with images |

### Frontend — Orchestrator Submit (FR-087)

| ID | Description | Layer | Acceptance Criteria |
|----|-------------|-------|---------------------|
| FR-087 | When submitting a feature to the orchestrator for development, include attached images. Fetch images for the FR, then POST to `/api/orchestrator/api/work` as multipart form-data with task string + image files | [frontend] | Orchestrator submission includes images; works without images; error handling preserved |

### Testing (FR-088 — FR-089)

| ID | Description | Layer | Acceptance Criteria |
|----|-------------|-------|---------------------|
| FR-088 | Backend tests: image service CRUD, upload route validation (bad MIME, oversized, missing entity), delete cleanup, orchestrator proxy multipart forwarding. Each test has `// Verifies: FR-XXX` | [backend] | All service and route tests pass; traceability enforcer passes; zero regressions |
| FR-089 | Frontend tests: ImageUpload component (drag, click, validation), ImageThumbnails (render, delete), updated forms (image field present, upload after submit), detail views (images displayed). Each test has `// Verifies: FR-XXX` | [frontend] | Components render; interactions tested; mocked API; zero regressions |

## Scoping / Bin-Packing Plan

### Backend Tasks

| Task | FRs | Weight | Notes |
|------|-----|--------|-------|
| B1: Shared types + schema migration | FR-070, FR-071, FR-072 | S (1pt) | Types + DB only |
| B2: Multer config + image service | FR-073, FR-074, FR-079 | M (2pt) | Core upload infrastructure |
| B3: Image routes (FR + Bug) | FR-075, FR-076, FR-077 | M (2pt) | CRUD endpoints + static serving |
| B4: Orchestrator proxy multipart | FR-078 | M (2pt) | Proxy modification |
| B5: Backend tests | FR-088 | M (2pt) | Tests for all above |

**Backend total: 9 points → 2 backend coders**
- Coder 1: B1 + B2 + B3 (5 pts — types, multer, service, routes)
- Coder 2: B4 + B5 (4 pts — orchestrator proxy + tests)

### Frontend Tasks

| Task | FRs | Weight | Notes |
|------|-----|--------|-------|
| F1: ImageUpload component | FR-080 | M (2pt) | Reusable drag-and-drop component |
| F2: ImageThumbnails component | FR-081 | S (1pt) | Reusable thumbnail grid |
| F3: API client updates | FR-086 | S (1pt) | New client functions + FormData |
| F4: Form integration (FR + Bug) | FR-082, FR-083 | M (2pt) | Wire into existing forms |
| F5: Detail view integration | FR-084, FR-085 | M (2pt) | Wire into existing detail views |
| F6: Orchestrator submit with images | FR-087 | S (1pt) | Multipart orchestrator call |
| F7: Frontend tests | FR-089 | M (2pt) | Tests for all above |

**Frontend total: 11 points → 2 frontend coders**
- Coder 1: F1 + F2 + F3 (4 pts — reusable components + client)
- Coder 2: F4 + F5 + F6 + F7 (7 pts — integration + tests)

## Verdict: APPROVED

All requirements trace to the task description. No spec gaps identified. The feature is self-contained and does not conflict with existing FRs.
