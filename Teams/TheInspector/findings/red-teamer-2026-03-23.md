# Red Team Security Audit Findings — 2026-03-23

**Auditor:** red-teamer
**Mode:** STATIC (services down)
**Scope:** Full API surface — 6 route files, 7 service files, middleware, database schema
**Prior Audit:** 2026-03-23 (first audit) — re-verification of previously identified issues

---

## SEC-001: Complete Absence of Authentication Across Entire API

- **Severity:** P1
- **Category:** auth-bypass (OWASP A07 Authentication Failures)
- **Confirmation:** Confirmed (code path)
- **Re-verification:** STILL OPEN
- **File(s):**
  - `/workspace/Source/Backend/src/index.ts` (no auth middleware registered)
  - `/workspace/Source/Backend/src/middleware/` (contains only `logging.ts`, `metrics.ts`, `errorHandler.ts`)
  - `/workspace/Source/Backend/package.json` (no auth dependencies: no jsonwebtoken, passport, express-jwt, bcrypt, argon2)
- **Exploit scenario:**
  1. Attacker sends any HTTP request to any API endpoint (e.g., `GET /api/feature-requests`, `POST /api/bugs`, `DELETE /api/feature-requests/FR-0001`)
  2. No authentication check exists anywhere in the middleware pipeline or route handlers
  3. There is no `users` table in the database schema (`schema.ts`), no user/role concept in shared types, no session management
  4. Impact: Complete anonymous access to all CRUD operations, all data, all administrative actions
- **Recommendation:** Implement JWT-based authentication middleware. Add `users` table with password hashing (argon2/bcrypt). Register auth middleware before all `/api/*` routes. Add `jsonwebtoken` and `bcrypt`/`argon2` to dependencies.
- **Cross-ref:** [CROSS-REF: code-quality] missing auth architecture, [CROSS-REF: spec-reviewer] CLAUDE.md references `admin@example.com / admin123` login credentials but no auth system exists

---

## SEC-002: Complete Absence of Authorization / Access Control

- **Severity:** P1
- **Category:** privilege-escalation (OWASP A01 Broken Access Control)
- **Confirmation:** Confirmed (code path)
- **Re-verification:** STILL OPEN
- **File(s):**
  - `/workspace/Source/Backend/src/routes/featureRequests.ts:176` — `POST /:id/approve` (admin-level operation)
  - `/workspace/Source/Backend/src/routes/featureRequests.ts:196` — `POST /:id/deny` (admin-level operation)
  - `/workspace/Source/Backend/src/routes/featureRequests.ts:140` — `POST /:id/vote` (AI voting trigger)
  - `/workspace/Source/Backend/src/routes/cycles.ts:159` — `POST /:id/complete` (destructive cycle completion)
  - All DELETE endpoints across all routes
- **Exploit scenario:**
  1. Any anonymous network caller can invoke `POST /api/feature-requests/FR-0001/approve` to approve feature requests
  2. Any caller can invoke `POST /api/feature-requests/FR-0001/deny` with a comment to deny feature requests
  3. Any caller can invoke `POST /api/feature-requests/FR-0001/vote` to trigger AI voting, manipulating the pipeline
  4. Any caller can invoke `POST /api/cycles/CYCLE-0001/complete` to complete development cycles
  5. Any caller can `DELETE /api/bugs/BUG-0001` to destroy data
  6. Impact: Full data manipulation, pipeline sabotage, unauthorized approval/denial of feature requests (bypasses intended human-in-the-loop workflow)
- **Recommendation:** Implement role-based access control (RBAC). Critical operations (approve, deny, vote, complete, delete) should require admin or specific role. Standard CRUD should require authenticated user role at minimum.
- **Cross-ref:** [CROSS-REF: code-quality] no RBAC pattern, [CROSS-REF: spec-reviewer] human approval workflow has zero access enforcement

---

## SEC-003: Sequential/Predictable ID Generation Enables IDOR Enumeration

- **Severity:** P2
- **Category:** IDOR (OWASP A01 Broken Access Control)
- **Confirmation:** Confirmed (code path)
- **Re-verification:** STILL OPEN
- **File(s):**
  - `/workspace/Source/Backend/src/services/featureRequestService.ts:42-50` — `generateFRId()`: `FR-0001`, `FR-0002`, ...
  - `/workspace/Source/Backend/src/services/bugService.ts:39-47` — `generateBugId()`: `BUG-0001`, `BUG-0002`, ...
  - `/workspace/Source/Backend/src/services/cycleService.ts:119-127` — `generateCycleId()`: `CYCLE-0001`, `CYCLE-0002`, ...
  - `/workspace/Source/Backend/src/services/cycleService.ts:129-137` — `generateTicketId()`: `TKT-0001`, `TKT-0002`, ...
  - `/workspace/Source/Backend/src/services/featureService.ts:29-37` — `generateFeatureId()`: `FEAT-0001`, `FEAT-0002`, ...
  - `/workspace/Source/Backend/src/services/learningService.ts:32-39` — `generateLearningId()`: `LRN-0001`, `LRN-0002`, ...
- **Exploit scenario:**
  1. Attacker creates one entity (e.g., `POST /api/bugs`), receives ID `BUG-0005`
  2. Attacker enumerates `BUG-0001` through `BUG-0004` to access all prior records
  3. Pattern is consistent across all 6 entity types — predictable prefix + zero-padded sequential number
  4. Combined with SEC-001 (no auth), this allows complete data enumeration by any network caller
  5. Impact: Full data exfiltration of all entities in the system
- **Recommendation:** Use UUIDs (the `uuid` package is already a dependency but only used for vote IDs). Replace sequential ID generators with `uuidv4()`. If human-readable IDs are needed, use them as display labels only, not as primary keys for API access.
- **Cross-ref:** [CROSS-REF: code-quality] inconsistent ID strategy (votes use UUID, everything else uses sequential)

---

## SEC-004: Race Condition in Sequential ID Generation

- **Severity:** P3
- **Category:** integrity (OWASP A01 Broken Access Control)
- **Confirmation:** Confirmed (code path)
- **Re-verification:** NEW
- **File(s):**
  - `/workspace/Source/Backend/src/services/featureRequestService.ts:42-50`
  - `/workspace/Source/Backend/src/services/bugService.ts:39-47`
  - `/workspace/Source/Backend/src/services/cycleService.ts:119-137`
  - `/workspace/Source/Backend/src/services/featureService.ts:29-37`
  - `/workspace/Source/Backend/src/services/learningService.ts:32-39`
- **Exploit scenario:**
  1. Two concurrent `POST /api/bugs` requests arrive simultaneously
  2. Both read `SELECT id FROM bugs ORDER BY ROWID DESC LIMIT 1` and get `BUG-0005`
  3. Both compute `next = 6` and attempt to insert `BUG-0006`
  4. Second insert fails with primary key constraint violation (SQLite), causing a 500 error
  5. Impact: Denial of service through concurrent request flooding; data integrity risk if error handling doesn't properly rollback
- **Note:** SQLite's single-writer lock partially mitigates this in practice (WAL mode still serializes writes), but the logic is inherently racy. With a different database engine this would be exploitable.
- **Recommendation:** Use UUIDs, or use database-level auto-increment, or wrap the read+insert in an explicit transaction with retry logic.

---

## SEC-005: Unauthenticated Prometheus Metrics Endpoint

- **Severity:** P2
- **Category:** information-disclosure (OWASP A01 Broken Access Control)
- **Confirmation:** Confirmed (code path)
- **Re-verification:** STILL OPEN
- **File(s):**
  - `/workspace/Source/Backend/src/index.ts:46` — `app.get('/metrics', metricsHandler);`
  - `/workspace/Source/Backend/src/middleware/metrics.ts` — exposes default Node.js metrics + custom counters
- **Exploit scenario:**
  1. Attacker accesses `GET /metrics` without authentication
  2. Response includes: default Node.js process metrics (memory, CPU, event loop lag, active handles), HTTP request counts/latency by route and status code, feature request status transition counts, AI voting invocation counts
  3. Impact: Reveals internal system architecture, traffic patterns, error rates, and business metrics. Attacker learns which routes exist, how many errors occur (potential injection targets), and can infer business activity (feature request approvals/denials, voting frequency)
- **Recommendation:** Gate `/metrics` behind authentication or restrict to internal network only. Move it to a separate admin port not exposed externally.
- **Cross-ref:** [CROSS-REF: code-quality] metrics exposure is a deployment concern

---

## SEC-006: Missing Input Length Limits on Bug Reports, Tickets, Learnings

- **Severity:** P3
- **Category:** denial-of-service (OWASP A03 Injection)
- **Confirmation:** Confirmed (code path)
- **Re-verification:** STILL OPEN (partially addressed for feature requests only)
- **File(s):**
  - `/workspace/Source/Backend/src/services/bugService.ts:81-99` — `createBug()`: no length validation on `title`, `description`, `source_system`
  - `/workspace/Source/Backend/src/services/bugService.ts:115-166` — `updateBug()`: no length validation on any field
  - `/workspace/Source/Backend/src/services/cycleService.ts:282-296` — `createTicket()`: no length validation on `title`, `description`, `assignee`
  - `/workspace/Source/Backend/src/services/cycleService.ts:305-366` — `updateTicket()`: no length validation on any field
  - `/workspace/Source/Backend/src/services/learningService.ts:73-91` — `createLearning()`: no length validation on `content`
  - `/workspace/Source/Backend/src/services/cycleService.ts:225-272` — `updateCycle()`: no length validation on `spec_changes`
- **Note:** `featureRequestService.ts` correctly validates `TITLE_MAX_LENGTH` (200) and `DESCRIPTION_MAX_LENGTH` (10000) — but this pattern is not applied elsewhere.
- **Exploit scenario:**
  1. Express body parser limits to 16KB (`express.json({ limit: '16kb' })`), providing a coarse upper bound
  2. However, attacker can still insert repeated 16KB payloads with maximum-length strings into `title`, `description`, `content`, `spec_changes`, and `assignee` fields
  3. Over time, database grows with oversized records; query performance degrades
  4. Activity feed (`dashboardService.ts`) loads all records from all 6 tables without pagination — large content fields cause memory pressure
  5. Impact: Application-level DoS through database bloat and expensive queries
- **Recommendation:** Apply consistent `TITLE_MAX_LENGTH` and `DESCRIPTION_MAX_LENGTH` limits across all entity services, matching the pattern in `featureRequestService.ts`.
- **Cross-ref:** [CROSS-REF: code-quality] inconsistent validation patterns

---

## SEC-007: Unbounded Activity Feed Query Loads All Records

- **Severity:** P3
- **Category:** denial-of-service
- **Confirmation:** Confirmed (code path)
- **Re-verification:** NEW
- **File(s):**
  - `/workspace/Source/Backend/src/services/dashboardService.ts:72-227` — `getDashboardActivity()`
- **Exploit scenario:**
  1. `getDashboardActivity()` queries ALL rows from 6 tables (`feature_requests`, `bugs`, `cycles`, `tickets`, `learnings`, `features`) into memory
  2. It then creates activity items (potentially 2x the row count due to create+update events), sorts them in-memory, and slices to the limit
  3. While the output is capped at 200 items (MAX_ACTIVITY_LIMIT), the intermediate in-memory array is unbounded
  4. Attacker floods the system with many entities (each costs one 16KB POST), then hits `GET /api/dashboard/activity` repeatedly
  5. Impact: Memory exhaustion on the server; each request loads the entire dataset into memory
- **Recommendation:** Push filtering and limiting into SQL queries. Use `UNION ALL` with `ORDER BY timestamp DESC LIMIT ?` at the database level instead of loading everything into Node.js memory.

---

## SEC-008: No Rate Limiting on Any Endpoint

- **Severity:** P2
- **Category:** denial-of-service (OWASP A07 Authentication Failures)
- **Confirmation:** Confirmed (code path)
- **Re-verification:** STILL OPEN
- **File(s):**
  - `/workspace/Source/Backend/src/index.ts` — no rate limiting middleware
  - `/workspace/Source/Backend/package.json` — no `express-rate-limit` or similar dependency
- **Exploit scenario:**
  1. Attacker sends unlimited requests to any endpoint
  2. Write endpoints (`POST /api/bugs`, `POST /api/feature-requests`, `POST /api/learnings`) can flood the database
  3. `POST /api/feature-requests/:id/vote` triggers simulated AI voting on each call — repeated calls could manipulate or disrupt the pipeline
  4. Combined with SEC-001 (no auth), there is no identity to throttle against
  5. Impact: Resource exhaustion, data flooding, pipeline manipulation
- **Recommendation:** Add `express-rate-limit` middleware. Apply stricter limits to write endpoints and administrative operations (approve/deny/vote/complete).

---

## SEC-009: No Security Headers (Missing Helmet)

- **Severity:** P3
- **Category:** misconfiguration (OWASP A05 Security Misconfiguration)
- **Confirmation:** Confirmed (code path)
- **Re-verification:** NEW
- **File(s):**
  - `/workspace/Source/Backend/src/index.ts` — no `helmet` middleware
  - `/workspace/Source/Backend/package.json` — no `helmet` dependency
- **Exploit scenario:**
  1. API responses lack security headers: no `X-Content-Type-Options`, no `Strict-Transport-Security`, no `X-Frame-Options`, no `Content-Security-Policy`
  2. If API responses are rendered in a browser context (error pages, redirects), XSS and clickjacking attacks become easier
  3. Impact: Increases attack surface for browser-based attacks against API consumers
- **Recommendation:** Add `helmet` middleware to set standard security headers.

---

## SEC-010: Missing `source_system` Validation on Bug Reports

- **Severity:** P3
- **Category:** injection / data integrity (OWASP A03 Injection)
- **Confirmation:** Confirmed (code path)
- **Re-verification:** NEW
- **File(s):**
  - `/workspace/Source/Backend/src/services/bugService.ts:84` — `source_system` accepted as arbitrary string
  - `/workspace/Source/Backend/src/services/bugService.ts:150-151` — `updateBug()` also accepts arbitrary `source_system`
- **Exploit scenario:**
  1. `createBug()` accepts any string for `source_system` (defaults to `'manual'`)
  2. Unlike `featureRequestService.ts` which validates `source` against `VALID_SOURCES` enum, `bugService.ts` has no validation
  3. Attacker can inject arbitrary strings (including HTML/script content) into `source_system` field
  4. If `source_system` is rendered in the frontend without escaping, this becomes a stored XSS vector
  5. Impact: Stored XSS potential (depends on frontend rendering); data integrity violation
- **Recommendation:** Define and validate against a `VALID_SOURCE_SYSTEMS` enum list (e.g., `['manual', 'ci_cd', 'monitoring', 'user_report']`), similar to the `VALID_SOURCES` pattern in `featureRequestService.ts`.
- **Cross-ref:** [CROSS-REF: code-quality] inconsistent validation between feature requests and bugs

---

## SEC-011: No CSRF Protection

- **Severity:** P3
- **Category:** auth-bypass (OWASP A01 Broken Access Control)
- **Confirmation:** Confirmed (code path)
- **Re-verification:** NEW
- **File(s):**
  - `/workspace/Source/Backend/src/index.ts:30-35` — CORS configured with `credentials: true`
  - `/workspace/Source/Backend/package.json` — no CSRF middleware dependency
- **Exploit scenario:**
  1. CORS allows `credentials: true`, meaning browsers will send cookies with cross-origin requests to allowed origins
  2. No CSRF token validation exists on any state-changing endpoint
  3. If authentication is later added using cookies/sessions, an attacker on an allowed origin can forge state-changing requests
  4. Currently moot (no auth = no session to hijack), but will become exploitable once auth is implemented
  5. Impact: Future risk — state-changing operations could be forged from malicious pages if cookie-based auth is added
- **Recommendation:** When implementing authentication, add CSRF protection (e.g., `csurf` middleware or double-submit cookie pattern). If using JWT in Authorization header (not cookies), CSRF is not applicable.

---

## SEC-012: `assignee` Field Accepts Arbitrary Unsanitized Input

- **Severity:** P3
- **Category:** injection / stored XSS (OWASP A03 Injection)
- **Confirmation:** Confirmed (code path)
- **Re-verification:** NEW
- **File(s):**
  - `/workspace/Source/Backend/src/services/cycleService.ts:282-296` — `createTicket()`: `assignee` has no validation
  - `/workspace/Source/Backend/src/services/cycleService.ts:349-350` — `updateTicket()`: `assignee` has no validation
- **Exploit scenario:**
  1. `POST /api/cycles/:id/tickets` with `{"title":"task", "description":"do it", "assignee":"<script>alert(1)</script>"}`
  2. Ticket is stored with malicious assignee value
  3. If frontend renders `assignee` without escaping (e.g., `innerHTML`), XSS executes
  4. Impact: Stored XSS potential (depends on frontend rendering)
- **Recommendation:** Validate `assignee` against a list of valid agent/user names, or at minimum apply length limits and character restrictions.

---

## SEC-013: Database Path Controllable via Environment Variable Without Validation

- **Severity:** P3
- **Category:** path traversal (OWASP A03 Injection)
- **Confirmation:** Confirmed (code path)
- **Re-verification:** NEW
- **File(s):**
  - `/workspace/Source/Backend/src/database/connection.ts:8` — `const DB_PATH = process.env.DB_PATH || path.join(...)`
- **Exploit scenario:**
  1. If an attacker can influence environment variables (e.g., in a shared hosting or container misconfiguration), setting `DB_PATH=/etc/shadow.db` or a path traversal value could write a SQLite database to an arbitrary filesystem location
  2. Impact: File system write to arbitrary location; potential overwrite of sensitive files
- **Note:** Low exploitability — requires control over environment variables, which typically implies host-level compromise already.
- **Recommendation:** Validate `DB_PATH` to ensure it resolves within an expected directory. Use `path.resolve()` and verify the result starts with an allowed prefix.

---

## SEC-014: `human_approval_comment` in Deny Endpoint Has No Length Limit

- **Severity:** P4
- **Category:** denial-of-service
- **Confirmation:** Confirmed (code path)
- **Re-verification:** NEW
- **File(s):**
  - `/workspace/Source/Backend/src/routes/featureRequests.ts:202-205` — validates comment is non-empty string, but no max length
  - `/workspace/Source/Backend/src/services/featureRequestService.ts:325-348` — `denyFeatureRequest()` stores comment directly
- **Exploit scenario:**
  1. Attacker calls `POST /api/feature-requests/FR-0001/deny` with a near-16KB comment (limited only by Express body parser)
  2. Comment stored in `human_approval_comment` column
  3. Impact: Minor — bounded by 16KB body limit, but still no application-level validation
- **Recommendation:** Add a `COMMENT_MAX_LENGTH` validation (e.g., 2000 characters).

---

## Summary Table

| ID | Severity | Category | Status vs Prior Audit |
|----|----------|----------|----------------------|
| SEC-001 | P1 | auth-bypass | STILL OPEN |
| SEC-002 | P1 | privilege-escalation | STILL OPEN |
| SEC-003 | P2 | IDOR | STILL OPEN |
| SEC-004 | P3 | integrity / race condition | NEW |
| SEC-005 | P2 | information-disclosure | STILL OPEN |
| SEC-006 | P3 | denial-of-service | STILL OPEN |
| SEC-007 | P3 | denial-of-service | NEW |
| SEC-008 | P2 | denial-of-service | STILL OPEN |
| SEC-009 | P3 | misconfiguration | NEW |
| SEC-010 | P3 | injection / data integrity | NEW |
| SEC-011 | P3 | auth-bypass (future) | NEW |
| SEC-012 | P3 | injection / stored XSS | NEW |
| SEC-013 | P3 | path traversal | NEW |
| SEC-014 | P4 | denial-of-service | NEW |

## Properly Defended Patterns (No Finding)

- **SQL Injection:** All SQL queries use parameterized statements via `better-sqlite3` `prepare().run()/all()`. No string concatenation of user input into SQL. LIKE search in `featureService.ts` properly escapes `%`, `_`, `\`.
- **Enum validation:** Feature request `source`, `priority`, `status`; bug `severity`, `status`; cycle `status`; ticket `status`; learning `category` — all validated against allowed value lists.
- **Status transition enforcement:** State machines enforced server-side for feature requests, cycles, and tickets.
- **Body size limit:** Express body parser limits to 16KB.
- **CORS origins:** Restricted to configured origins (defaults to `localhost:5173`), not wildcard `*`.
- **Error handler:** Does not leak stack traces to clients (only returns generic "Internal server error" for unexpected errors).

```json
{
  "audit_date": "2026-03-23",
  "auditor": "red-teamer",
  "mode": "static",
  "findings_total": 14,
  "by_severity": {
    "P1": 2,
    "P2": 3,
    "P3": 8,
    "P4": 1
  },
  "by_status": {
    "STILL_OPEN": 6,
    "NEW": 8,
    "FIXED": 0,
    "REGRESSED": 0
  },
  "owasp_coverage": {
    "A01_Broken_Access_Control": ["SEC-002", "SEC-003", "SEC-005", "SEC-011"],
    "A02_Cryptographic_Failures": [],
    "A03_Injection": ["SEC-006", "SEC-010", "SEC-012", "SEC-013"],
    "A07_Authentication_Failures": ["SEC-001", "SEC-008"]
  }
}
```
