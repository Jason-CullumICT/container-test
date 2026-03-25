# Image Upload — Design Decisions

## DD-IMG-01: Two-step upload (create entity, then upload images)

Images are uploaded in a second request after the entity (FR or bug) is created, rather than in a single multipart POST. This avoids rewriting the existing create endpoints and keeps the create flow simple (JSON). The frontend handles the two-step flow transparently.

## DD-IMG-02: Stored filename uses UUID to prevent collisions

Files are stored with UUID-based filenames (e.g., `a1b2c3d4.png`), not original names. This prevents filename collisions, path traversal attacks, and encoding issues. The original filename is preserved in the `original_name` DB column for display.

## DD-IMG-03: Static file serving via Express

Uploaded files are served via `express.static('uploads')` mounted at `/uploads/`. No auth required for viewing images — this is acceptable for an internal dev workflow tool. If auth is needed later, a signed-URL pattern can be added.

## DD-IMG-04: Multer for file handling

Multer is the standard Express file upload middleware. It handles multipart parsing, file size limits, and disk storage. No need for a more complex solution (S3, etc.) for a local dev tool.

## DD-IMG-05: Image deletion removes file from disk

When an image record is deleted from the DB, the corresponding file is also deleted from the uploads directory. This prevents orphaned files from accumulating.

## DD-IMG-06: Orchestrator proxy multipart forwarding

The orchestrator proxy currently forwards JSON. For image-inclusive work submissions, the proxy detects multipart content-type and uses a streaming forward approach (piping the request body with its original content-type and boundary) rather than re-parsing and re-encoding the multipart data.

## DD-IMG-07: Client-side validation mirrors server-side

The ImageUpload component validates file type and size before upload, matching the backend's multer configuration. This provides immediate feedback without a round-trip, but the server-side validation is the authoritative check.

## DD-IMG-08: No image processing/resizing

Images are stored as-is. No server-side thumbnailing or resizing. The frontend uses CSS to display thumbnails at appropriate sizes. This keeps the backend simple and avoids adding image processing dependencies (sharp, etc.).
