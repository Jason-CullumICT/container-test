# Red Teamer Learnings — Development Workflow Platform

## First Audit: 2026-03-23

### Critical Discovery: Zero Authentication/Authorization

The single most important finding in this codebase is **complete absence of any authentication or authorization**. There is no auth middleware, no JWT validation, no session management, and no user/role concept anywhere in the source. Every single API endpoint is entirely open to anonymous callers on the network.

Key evidence:
- `/workspace/Source/Backend/src/index.ts` — no auth middleware registered in Express pipeline
- `/workspace/Source/Backend/src/middleware/` — contains only `logging.ts`, `metrics.ts`, `errorHandler.ts`; no `auth.ts` or equivalent
- `package.json` — no `jsonwebtoken`, `passport`, `express-jwt`, `bcrypt`, or any auth-related dependency
- No `users` table in `schema.ts`, no user concept in `Shared/types.ts`
- Config references `/api/auth/login` and `/api/auth/register` as threat entry points, but these routes do not exist

### Vulnerability Patterns Found

**Vulnerable patterns:**
- Sequential numeric ID generation (COUNT(*) + 1) — predictable IDs enable IDOR enumeration without auth
- No input length limits on free-text fields (title, description, content, comment)
- `GET /metrics` exposed unauthenticated — leaks internal service metrics
- `completeCycle` uses `Math.random()` for deployment simulation — not a security issue per se, but a flawed security model if any business decisions relied on it
- The `createLearning` in `cycleService.ts` passes a hardcoded `'process'` category which bypasses the enum validation gate — minor logic inconsistency

**Properly defended patterns:**
- All SQL queries use parameterized statements via `better-sqlite3` `prepare().run()/all()` — no SQL injection surface
- Enum validation on all user-controlled status/severity/priority inputs
- Status transition state machines enforced server-side
- Body size limited to 16kb via `express.json({ limit: '16kb' })`
- CORS restricted to configured origins (defaults to localhost:5173)
- Error handler does not leak stack traces to clients (only logs them internally)
- LIKE query in `featureService.listFeatures` properly escapes `%`, `_`, `\` characters

### File Paths for Future Audits

| File | What to Check |
|------|--------------|
| `/workspace/Source/Backend/src/index.ts` | Auth middleware registration (currently absent) |
| `/workspace/Source/Backend/src/middleware/` | Auth/authz middleware (currently absent) |
| `/workspace/Source/Backend/src/routes/featureRequests.ts:176` | `POST /:id/approve` — admin-level operation, unauthenticated |
| `/workspace/Source/Backend/src/routes/featureRequests.ts:196` | `POST /:id/deny` — admin-level operation, unauthenticated |
| `/workspace/Source/Backend/src/services/featureRequestService.ts:38` | Sequential ID generation (IDOR risk) |
| `/workspace/Source/Backend/src/services/bugService.ts:39` | Sequential ID generation (IDOR risk) |
| `/workspace/Source/Backend/src/services/cycleService.ts:119` | Sequential ID generation (IDOR risk) |
| `/workspace/Source/Backend/src/index.ts:46` | `GET /metrics` — unauthenticated Prometheus endpoint |

### Domain-Specific Security Patterns

- The "human approval" workflow (`/approve`, `/deny` endpoints) is a critical operation with zero access control — any party on the network can approve/deny feature requests
- AI voting simulation (`/vote`) is also unauthenticated — anyone can trigger AI votes, potentially manipulating the pipeline
- Cycle creation/completion are destructive operations with no authorization guard
- The `completeCycle` function uses `Math.random()` for simulated deployment failure; in production this would need a real CI/CD integration with proper auth

### Recommendations for Next Audit Cycle

1. After auth is implemented, audit the JWT implementation specifically (algorithm confusion, weak secrets, missing expiry)
2. Check for IDOR again once IDs become UUIDs (if they migrate from sequential IDs)
3. Verify `/metrics` is gated behind auth or network-level restriction in production
4. Re-assess rate limiting once auth is in place (currently no rate limiting at all)

---

## Second Audit: 2026-03-23 (Re-verification)

### Status of Prior Findings

All 6 previously identified issues remain **STILL OPEN** with zero remediation. No authentication, authorization, rate limiting, or security headers have been added since the first audit.

### New Discoveries

- **Race condition in ID generation:** Sequential ID generation (`SELECT id ORDER BY ROWID DESC LIMIT 1` then `INSERT`) is not atomic. Under concurrent writes, duplicate IDs could be generated. Mitigated by SQLite's write serialization but architecturally unsound.
- **Inconsistent validation across entities:** `featureRequestService.ts` has `TITLE_MAX_LENGTH`/`DESCRIPTION_MAX_LENGTH` validation; `bugService.ts`, `cycleService.ts`, `learningService.ts` have none. This suggests the length validation was added as a targeted fix rather than a cross-cutting concern.
- **`source_system` on bugs is unvalidated:** Unlike feature requests where `source` is validated against `VALID_SOURCES`, `bugService.ts` accepts any string for `source_system` — potential stored XSS vector.
- **`assignee` field unvalidated:** Tickets accept any string for `assignee` with no length or character restrictions — another stored XSS vector.
- **Dashboard activity feed loads entire database into memory:** `getDashboardActivity()` fetches all rows from all 6 tables before sorting and slicing in JS. No SQL-level pagination.
- **CORS `credentials: true` without CSRF:** When auth is added, if cookies are used, this will be an exploitable CSRF vector.

### Updated File Paths for Future Audits

| File | What to Check |
|------|--------------|
| `/workspace/Source/Backend/src/services/bugService.ts:84` | `source_system` validation (currently absent) |
| `/workspace/Source/Backend/src/services/cycleService.ts:292` | `assignee` validation (currently absent) |
| `/workspace/Source/Backend/src/services/dashboardService.ts:72-227` | Unbounded in-memory query (DoS risk) |
| `/workspace/Source/Backend/src/database/connection.ts:8` | `DB_PATH` from env var without path validation |

### Key Takeaway

This codebase has solid fundamentals in SQL injection prevention and enum validation, but completely lacks the authentication/authorization layer. The P1 findings (SEC-001, SEC-002) render most other security controls moot — without auth, every endpoint is an open attack surface. Fixing auth should be the absolute first priority before any other security work.

## Third Audit: 2026-03-24

### Pipeline Feature Security Analysis
- 5 new pipeline endpoints (list, get, start stage, complete stage, get by cycle) — all unauthenticated
- SEC-015 (P1): Unauthenticated pipeline stage manipulation — any caller can advance stages and trigger completeCycle()
- SEC-016 (P2): Pipeline bypass via direct POST /cycles/:id/complete — completeCycle() has no pipeline_run_id guard
- SEC-017 (P2): completeStageAction bypasses cycle transition validation via raw SQL UPDATE
- SEC-018 (P3): No guard against operations on completed pipeline runs
- SEC-019 (P3): Sequential pipeline run IDs (RUN-XXXX) — IDOR extends to pipeline domain
- SEC-020 (P3): Pipeline metrics exposed via unauthenticated /metrics

### Pipeline Properly Defended Patterns
- Verdict validation: 'approved'/'rejected' enforced at service layer
- Linear stage ordering: previous stage must be completed before starting next
- Stage status enforcement: can't complete non-running, can't start already-running
- Pipeline-linked cycle PATCH blocked (FR-039) — but POST /complete bypass exists

### Updated File Paths
| File | What to Check |
|------|--------------|
| `/workspace/Source/Backend/src/services/pipelineService.ts:274-288` | Stage 5 non-transactional completeCycle trigger |
| `/workspace/Source/Backend/src/services/pipelineService.ts:292-294` | Raw SQL cycle status update bypassing validation |
| `/workspace/Source/Backend/src/services/cycleService.ts:397-469` | completeCycle() missing pipeline_run_id guard |
| `/workspace/Source/Backend/src/routes/pipelines.ts:57-108` | Stage start/complete — no auth |

### All Prior Findings Still Open
All 14 prior findings remain STILL OPEN. Zero remediation since first audit.

## Fourth Audit: 2026-03-25 (Image Upload Feature)

### Image Upload Security Analysis

New attack surface introduced by multer-based image upload feature. Prior P1 (no auth) still the root cause enabling most new findings.

**Critical new findings:**

- **SEC-021 (P1): MIME type check trivially bypassed** — `upload.ts:31` checks `file.mimetype` which comes from the HTTP Content-Type header, not file magic bytes. Any attacker can send a PHP/JSP/exe with `Content-Type: image/jpeg` and it will be accepted and stored on disk with the original file extension (because `path.extname(file.originalname)` preserves the extension). Combined with the static file server at `/uploads`, this enables stored XSS and potential RCE if the server ever executes PHP/etc.

- **SEC-022 (P2): File extension not validated** — `upload.ts:25-26` uses `path.extname(file.originalname)` verbatim as the stored extension. An attacker submits `evil.php` with `Content-Type: image/jpeg`; stored as `<uuid>.php`. Static server serves it back. If server runs PHP, this is RCE.

- **SEC-023 (P1): Unauthenticated image upload/delete** — All 4 new image endpoints (`POST/GET/DELETE /:id/images`) have zero authentication, consistent with the rest of the API. Anyone can upload files to disk or delete existing images.

- **SEC-024 (P2): Cross-entity image deletion (IDOR)** — `DELETE /api/bugs/:id/images/:imageId` at `bugs.ts:200-208` extracts only `imageId` and calls `deleteImage(getDb(), imageId)` with no check that the image belongs to the bug identified in `:id`. An attacker can enumerate IMG-XXXX IDs and delete images belonging to any entity. Same pattern in `featureRequests.ts:281-289`.

- **SEC-025 (P2): No aggregate file upload size cap** — 5 files × 5MB = 25MB possible per request, plus multer buffers to disk. Combined with no rate limiting or authentication, enables disk exhaustion DoS.

- **SEC-026 (P3): `original_name` stored and displayed without sanitization** — `imageService.ts:83` stores `file.originalname` raw from the multipart form. `ImageThumbnails.tsx:30` renders it as `{img.original_name}` (React escapes, so stored XSS in JSX is mitigated). But `alt={img.original_name}` at line 27 and the `aria-label` at line 36 inject the raw name into DOM attributes — potential DOM XSS if a browser mishandles attribute escaping in edge cases (low risk in modern browsers, but worth noting).

- **SEC-027 (P3): Sequential image IDs enable IDOR enumeration** — `imageService.ts:42-50` generates IDs as IMG-0001, IMG-0002... same sequential pattern as all other entities. Attacker can iterate IMG-XXXX to delete or list images across all entities.

- **SEC-028 (P3): `/uploads` directory served without any access control** — `index.ts:56` registers `express.static` for the entire uploads directory with no authentication. Any file in the directory is publicly accessible by filename. No directory listing by default (express.static), but direct file access is open.

- **SEC-029 (P4): Race condition between DB delete and file delete** — `imageService.ts:129-139`: DB record deleted first, then file deletion attempted. If file deletion fails, the file remains on disk but is orphaned (no DB record). With no auth and sequential IDs, attackers can cause this state intentionally or an error leaves unreachable files accumulating.

**Properly defended in image feature:**
- File size limit: 5MB per file, max 5 files — hardcoded limits in multer config
- UUID-based stored filenames prevent path traversal in the storage path itself (but extension is preserved)
- SQL queries in imageService all parameterized — no SQL injection
- `entity_type` constrained by DB CHECK constraint to 'feature_request' | 'bug'
- React's JSX rendering escapes `{img.original_name}` text nodes — no stored XSS via text rendering

### Key Patterns for Image Upload Audits
- Always check: does MIME filter use magic bytes or Content-Type header? (Header = bypassable)
- Always check: is file extension derived from original filename or forced to a safe set?
- Always check: does delete endpoint verify the deleted item belongs to the requesting entity?
- Static file serving: is there directory listing? Is auth required?
- ID generation: sequential = IDOR risk across all entities

### Updated File Paths
| File | What to Check |
|------|--------------|
| `/workspace/Source/Backend/src/middleware/upload.ts:30-36` | MIME check — header-based, bypassable |
| `/workspace/Source/Backend/src/middleware/upload.ts:24-27` | Extension from originalname — preserved verbatim |
| `/workspace/Source/Backend/src/services/imageService.ts:42-50` | Sequential ID generation |

## Fifth Audit: 2026-03-25 (Runs Dashboard — Not Implemented)

### Key Finding: Implementation Not Delivered
The Runs Dashboard feature (FR-090–FR-098) was NOT implemented. Plans and E2E test specs exist but zero source code was written.

### Orchestrator Proxy Security Analysis
- SEC-RED-001 (P1): Unauthenticated orchestrator proxy — full SSRF gateway. 5th audit, STILL OPEN.
- SEC-RED-002 (P1): Unauthenticated stop-cycle enables DoS. STILL OPEN.
- SEC-RED-003 (P2): Open proxy path traversal via string concatenation (`${orchestratorUrl}${req.url}`)
- SEC-RED-004 (P2): Internal orchestrator URL leaked in 502 error response
- SEC-RED-005 (P2): Untyped `any` returns in orchestrator client enable data injection
- SEC-RED-006 (P2): Port links in CycleCard vulnerable to JavaScript URI injection
- SEC-RED-007 (P3): SSE log stream has no size or rate limit — memory exhaustion vector
- SEC-RED-008 (P3): No CSRF protection on state-changing proxy requests
- SEC-RED-010 (P3): Planned cleanup endpoint could delete active resources
- SEC-RED-011 (P3): Cycle ID rendered without truncation — UI spoofing
- SEC-RED-012 (P4): Error message from orchestrator rendered unsanitized

### Planned Design Security Concerns
- SEC-RED-009 (P2): Retry endpoint needs idempotency key and rate limiting
- Retry-of-retry chains need depth guard
- Cleanup needs confirmation dialog and status guard

### Updated File Paths
| File | What to Check |
|------|--------------|
| `/workspace/Source/Backend/src/index.ts:71-139` | Orchestrator proxy — no auth, SSRF, info leak |
| `/workspace/Source/Backend/src/index.ts:73` | URL concatenation — path traversal risk |
| `/workspace/Source/Backend/src/index.ts:137` | Internal URL leaked in error response |
| `/workspace/Source/Frontend/src/api/client.ts:327-356` | `any` types on orchestrator methods |
| `/workspace/Source/Frontend/src/components/orchestrator/CycleCard.tsx:126-134` | Port links — JS URI injection |
| `/workspace/Source/Frontend/src/components/orchestrator/CycleLogStream.tsx:41-47` | Unbounded SSE log accumulation |

### All Prior Findings Still Open
All findings from audits 1-4 remain STILL OPEN. Zero remediation across 5 audits.
| `/workspace/Source/Backend/src/routes/bugs.ts:200-208` | Delete image — no ownership check |
| `/workspace/Source/Backend/src/routes/featureRequests.ts:281-289` | Delete image — no ownership check |
| `/workspace/Source/Backend/src/index.ts:56` | Static file serving for uploads — no auth |
