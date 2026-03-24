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
