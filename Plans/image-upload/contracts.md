# Image Upload — API Contracts

## Shared Types

### Source/Shared/types.ts — additions

```typescript
// --- Image Attachment Types (FR-070) ---

export type ImageEntityType = 'feature_request' | 'bug';

export interface ImageAttachment {
  id: string;                          // IMG-XXXX
  entity_id: string;                   // FR-XXXX or BUG-XXXX
  entity_type: ImageEntityType;        // 'feature_request' | 'bug'
  filename: string;                    // stored filename (uuid-based)
  original_name: string;               // original upload filename
  mime_type: string;                   // image/jpeg, image/png, image/gif, image/webp
  size_bytes: number;
  created_at: string;                  // ISO timestamp
}
```

### Source/Shared/api.ts — additions

```typescript
import type { ImageAttachment } from './types';

// --- Image Attachments (FR-071) ---
export type ImageAttachmentListResponse = DataResponse<ImageAttachment>;
export type ImageUploadResponse = DataResponse<ImageAttachment>;
```

## Database Schema

### image_attachments table (FR-072)

```sql
CREATE TABLE IF NOT EXISTS image_attachments (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('feature_request', 'bug')),
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_image_attachments_entity
  ON image_attachments(entity_id, entity_type);
```

## API Endpoints

### Upload images for a feature request

```
POST /api/feature-requests/:id/images
Content-Type: multipart/form-data

Form fields:
  images: File[] (field name "images", max 5 files, max 5MB each)

Responses:
  201: { data: ImageAttachment[] }
  400: { error: "No files uploaded" }
  400: { error: "File too large (max 5MB)" }
  400: { error: "Invalid file type. Allowed: jpeg, png, gif, webp" }
  404: { error: "Feature request not found" }
```

### Upload images for a bug report

```
POST /api/bugs/:id/images
Content-Type: multipart/form-data

Form fields:
  images: File[] (field name "images", max 5 files, max 5MB each)

Responses:
  201: { data: ImageAttachment[] }
  400: { error: "No files uploaded" }
  400: { error: "File too large (max 5MB)" }
  400: { error: "Invalid file type. Allowed: jpeg, png, gif, webp" }
  404: { error: "Bug not found" }
```

### List images for a feature request

```
GET /api/feature-requests/:id/images

Responses:
  200: { data: ImageAttachment[] }
  404: { error: "Feature request not found" }
```

### List images for a bug report

```
GET /api/bugs/:id/images

Responses:
  200: { data: ImageAttachment[] }
  404: { error: "Bug not found" }
```

### Delete an image from a feature request

```
DELETE /api/feature-requests/:id/images/:imageId

Responses:
  204: (no body)
  404: { error: "Image not found" }
```

### Delete an image from a bug report

```
DELETE /api/bugs/:id/images/:imageId

Responses:
  204: (no body)
  404: { error: "Image not found" }
```

### Static file serving

```
GET /uploads/:filename

Serves files from Source/Backend/uploads/ directory.
Express static middleware, no auth required.
```

### Orchestrator work submission (modified)

```
POST /api/orchestrator/api/work

Option A — JSON (existing, no images):
  Content-Type: application/json
  Body: { task: string, team?: string, repo?: string, repoBranch?: string }

Option B — Multipart (with images):
  Content-Type: multipart/form-data
  Form fields:
    task: string
    team?: string
    repo?: string
    repoBranch?: string
    images: File[] (attached image files)
```

## Multer Configuration (FR-073)

```typescript
// Source/Backend/src/middleware/upload.ts

import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const UPLOAD_DIR = path.join(__dirname, '../../uploads');
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_FILES = 5;
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  if (ALLOWED_MIMES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Allowed: jpeg, png, gif, webp'), false);
  }
};

export const uploadImages = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
  fileFilter,
}).array('images', MAX_FILES);
```

## Image Service Interface (FR-074)

```typescript
// Source/Backend/src/services/imageService.ts

export function uploadImages(
  db: Database,
  entityId: string,
  entityType: 'feature_request' | 'bug',
  files: Express.Multer.File[]
): ImageAttachment[]

export function listImages(
  db: Database,
  entityId: string,
  entityType: 'feature_request' | 'bug'
): ImageAttachment[]

export function deleteImage(
  db: Database,
  imageId: string
): void  // throws if not found; deletes file from disk
```

## Frontend API Client Additions (FR-086)

```typescript
// Added to Source/Frontend/src/api/client.ts

export const images = {
  upload(entityType: 'feature-requests' | 'bugs', entityId: string, files: File[]): Promise<{ data: ImageAttachment[] }> {
    // Uses FormData, NOT apiFetch (no JSON Content-Type)
    const formData = new FormData();
    files.forEach(f => formData.append('images', f));
    return fetch(`/api/${entityType}/${entityId}/images`, {
      method: 'POST',
      body: formData, // browser sets Content-Type with boundary automatically
    }).then(handleResponse);
  },

  list(entityType: 'feature-requests' | 'bugs', entityId: string): Promise<{ data: ImageAttachment[] }> {
    return apiFetch(`/api/${entityType}/${entityId}/images`);
  },

  delete(entityType: 'feature-requests' | 'bugs', entityId: string, imageId: string): Promise<void> {
    return apiFetch(`/api/${entityType}/${entityId}/images/${imageId}`, { method: 'DELETE' });
  },
};

// Modified orchestrator.submitWork to accept optional images
export const orchestrator = {
  submitWork(task: string, opts?: {
    team?: string;
    repo?: string;
    repoBranch?: string;
    images?: File[];
  }): Promise<...> {
    if (opts?.images?.length) {
      const formData = new FormData();
      formData.append('task', task);
      if (opts.team) formData.append('team', opts.team);
      if (opts.repo) formData.append('repo', opts.repo);
      if (opts.repoBranch) formData.append('repoBranch', opts.repoBranch);
      opts.images.forEach(f => formData.append('images', f));
      return fetch('/api/orchestrator/api/work', {
        method: 'POST',
        body: formData,
      }).then(handleResponse);
    }
    // existing JSON path
    return apiFetch('/api/orchestrator/api/work', { ... });
  },
};
```

## Component Interfaces

### ImageUpload (FR-080)

```typescript
interface ImageUploadProps {
  onFilesSelected: (files: File[]) => void;
  maxFiles?: number;        // default 5
  maxSizeMB?: number;       // default 5
  accept?: string[];        // default ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  disabled?: boolean;
}
```

### ImageThumbnails (FR-081)

```typescript
interface ImageThumbnailsProps {
  images: ImageAttachment[];
  allowDelete?: boolean;     // default false
  onDelete?: (imageId: string) => void;
}
```
