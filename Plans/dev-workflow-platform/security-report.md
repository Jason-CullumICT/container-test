# Security Review Report — Development Workflow Platform

**Pipeline Run ID:** run-1774234977-188
**Reviewer:** Security QA Agent
**Date:** 2026-03-23
**Scope:** Source/Backend/src/ and Source/Frontend/src/

---

## Verdict: PASSED_WITH_WARNINGS

The codebase has made significant security improvements since the previous review. All six previously flagged items (H-01, M-02, M-03, M-04, L-03, L-04) have been addressed either fully or partially. CORS is now correctly configured, the deny state guard is in place, the activity feed limit is capped, enum validation is present across all services, and all route handlers use try/catch + next(err). The remaining open issues are lower severity: input length validation is still missing from the bug and learning services (M-04 is partially resolved), and several free-text fields in the cycle/ticket service lack length caps.

---

## Previous Findings — Verification Status

| ID | Previous Finding | Status | Notes |
|----|-----------------|--------|-------|
| H-01 | No CORS configuration | **FIXED** | `cors` middleware in `index.ts:30-35` restricts to `ALLOWED_ORIGINS` env var with explicit methods/headers |
| M-01 | All endpoints unauthenticated | **UNCHANGED** | Still no auth; spec states v1 has no auth. Acknowledged as deliberate. |
| M-02 | `denyFeatureRequest` allows any status | **FIXED** | `featureRequestService.ts:329-334` enforces `potential`/`voting` guard; throws 409 otherwise |
| M-03 | No upper bound on activity `limit` | **FIXED** | `dashboardService.ts:69-77` defines `MAX_ACTIVITY_LIMIT = 200` and uses `Math.min(...)` |
| M-04 | Missing input length validation | **PARTIAL** | Fixed for feature requests (`TITLE_MAX_LENGTH=200`, `DESCRIPTION_MAX_LENGTH=10000`). Not fixed for `bugService` or `learningService` (see M-04 below) |
| L-01 | Non-atomic ID generation | **UNCHANGED** | Still COUNT-based; safe for single-threaded Node.js. Risk accepted. |
| L-02 | `/metrics` exposed on same port | **UNCHANGED** | Still bound to same port without IP restriction. Risk level unchanged. |
| L-03 | Unvalidated `source`/`priority` enums | **FIXED** | All three services validate enums. Feature requests validate `source` and `priority`; bugs validate `severity` and `status`; learnings validate `category` |
| L-04 | Missing try/catch in route handlers | **FIXED** | All six route files now wrap handlers in `try { ... } catch (err) { next(err); }` per DD-3 |

---

## Summary Table

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH     | 0 |
| MEDIUM   | 2 (M-01 unchanged, M-04 partial) |
| LOW      | 4 (L-01, L-02 unchanged + L-05, L-06 new) |
| INFO     | 3 |

---

## Findings

### MEDIUM

#### M-01 — All API Endpoints Unauthenticated (No Auth Layer)

**Status:** Unchanged from previous run. Documented as deliberate v1 decision.

**Files:** `Source/Backend/src/index.ts`, all route files
**Description:** Every endpoint, including destructive and state-changing operations (`DELETE`, `POST /approve`, `POST /deny`, `POST /cycles/:id/complete`), is accessible without any authentication or authorization check. This is a deliberate phase 1 decision per the spec.

**Remediation (for v2):**
Add a middleware stub `requireAuth` togglable via environment variable. At minimum protect approval/denial and cycle-completion paths with a pre-shared token or session before production release.

---

#### M-04 — Input Length Validation Incomplete: Bug and Learning Services

**Status:** Partially fixed. Feature request service has correct length caps. Bug and learning services do not.

**Files:**
- `Source/Backend/src/services/bugService.ts` — `createBug` (lines 77-95) and `updateBug` (lines 111-162)
- `Source/Backend/src/services/learningService.ts` — `createLearning` (lines 69-87)

**Description:** The feature request service correctly enforces `TITLE_MAX_LENGTH = 200` and `DESCRIPTION_MAX_LENGTH = 10000`. However the equivalent guards are absent from:
- `bugService.createBug`: `title` and `description` have no length cap
- `bugService.updateBug`: `title`, `description`, and `source_system` have no length cap
- `learningService.createLearning`: `content` and `cycle_id` have no length cap

An actor can submit multi-megabyte strings in these fields. Express's `json({ limit: '16kb' })` body cap (now 16 KB, reduced from default 100 KB) provides a partial backstop, but individual field lengths within that limit are unchecked.

**Remediation:**
Add the same constant-and-guard pattern used in `featureRequestService.ts`:

```typescript
// bugService.ts
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 10000;
const SOURCE_SYSTEM_MAX = 100;

if (title.length > TITLE_MAX) throw new AppError(400, `title must be at most ${TITLE_MAX} characters`);
if (description.length > DESCRIPTION_MAX) throw new AppError(400, `description must be at most ${DESCRIPTION_MAX} characters`);
```

```typescript
// learningService.ts
const CONTENT_MAX = 10000;
if (content.length > CONTENT_MAX) throw new AppError(400, `content must be at most ${CONTENT_MAX} characters`);
```

---

### LOW

#### L-01 — Non-Atomic ID Generation (Race Condition Risk)

**Status:** Unchanged from previous run. Accepted risk for single-threaded architecture.

**Files:** All service ID generators (e.g., `bugService.ts:39-43`, `featureRequestService.ts:42-46`)
**Description:** IDs are generated via `SELECT COUNT(*) + 1`. Safe under single-threaded Node.js with better-sqlite3 (synchronous). Risk acknowledged; would need UUID migration before any multi-worker deployment.

---

#### L-02 — `/metrics` Endpoint Exposed Without Network Controls

**Status:** Unchanged from previous run.

**File:** `Source/Backend/src/index.ts:46`, `Source/Backend/src/middleware/metrics.ts:62-66`
**Description:** The Prometheus metrics endpoint remains on the same port as the API with no IP restriction or authentication. Leaks process memory stats, CPU usage, event loop lag, route names, and request rate distribution.

**Remediation (same as previous):**
Bind on a separate port or restrict by IP:
```typescript
if (req.ip !== '127.0.0.1' && !req.ip?.startsWith('::ffff:127.')) return res.status(403).end();
```

---

#### L-05 — No Input Length Caps on Cycle and Ticket Free-Text Fields

**File:** `Source/Backend/src/services/cycleService.ts`
**Description:** The cycle and ticket service functions accept free-text fields with no upper length bound:
- `createTicket` (line 274): `title` and `description` have no max length
- `updateTicket` (lines 297-358): `title`, `description`, and `assignee` have no max length
- `updateCycle` (lines 217-264): `spec_changes` has no max length — this field could hold a multi-megabyte document

The 16 KB body limit provides partial protection, but large `spec_changes` documents can approach that limit on their own.

**Remediation:**
Apply the same length-cap pattern used in `featureRequestService.ts`:
```typescript
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 10000;
const SPEC_CHANGES_MAX = 50000;
const ASSIGNEE_MAX = 100;
```

---

#### L-06 — Dashboard Activity Route Does Not Reject Non-Integer `limit` Values

**File:** `Source/Backend/src/routes/dashboard.ts:33-39`
**Description:** The route parses `limit` via `parseInt(String(limitParam), 10)` but does not check whether the result is `NaN` or negative before passing it to the service. The service handles this gracefully (defaults to 20 via `Math.min(NaN > 0 ? NaN : DEFAULT)`, which evaluates safely), but the caller receives a 200 with silently-defaulted results rather than a 400 error. This makes the API inconsistent: invalid `limit` values are silently ignored rather than rejected.

**Remediation:**
Add explicit validation in the route:
```typescript
if (limitParam !== undefined) {
  if (isNaN(limit) || limit < 1) {
    return res.status(400).json({ error: 'limit must be a positive integer' });
  }
}
```

---

### INFO

#### I-01 — SQL Injection: All Queries Are Correctly Parameterized

All database queries across all service files use `better-sqlite3`'s prepared statement API with positional `?` placeholders and separate parameter arrays. Dynamic query construction (e.g., `bugService.ts:53-67`, `featureRequestService.ts:134-148`, dynamic SET clause in `cycleService.ts`) builds only structural SQL from validated enum values, with all user-supplied values bound as parameters. The `featureService.ts:45-49` LIKE search correctly escapes `%`, `_`, and `\` metacharacters before building the search term. No SQL injection risk identified.

---

#### I-02 — XSS: React's Default Escaping Is Used Throughout the Frontend

No usage of `dangerouslySetInnerHTML`, `innerHTML`, `eval()`, or `document.write()` was found in any frontend component or hook. All user-supplied text is rendered as JSX text nodes, which React escapes automatically. No XSS risk identified.

---

#### I-03 — Error Information Leakage: Stack Traces Are Not Exposed to Clients

The centralized `errorHandler` (`Source/Backend/src/middleware/errorHandler.ts:34-42`) logs stack traces to the logger but returns only `{ error: 'Internal server error' }` to the client for unhandled errors. Known `AppError` subclasses return their message string only. No `console.log` calls were found anywhere in the backend source. No error leakage risk identified.

---

## Positive Security Observations

- **CORS properly configured:** `cors` middleware restricts to `ALLOWED_ORIGINS` env var with explicit methods (`GET, POST, PATCH, DELETE, OPTIONS`) and allowed headers including `traceparent`/`tracestate` for OTel propagation.
- **Body size limited:** `express.json({ limit: '16kb' })` — tighter than the previous default 100 KB.
- **State machine guards on deny:** `denyFeatureRequest` correctly limits denial to `potential` and `voting` statuses per DD-5.
- **Activity feed capped:** `MAX_ACTIVITY_LIMIT = 200` enforced in service layer, independent of the route.
- **Full try/catch coverage:** All six route files now route errors through the centralized error handler.
- **Enum validation complete:** `source`, `priority` on FRs; `severity`, `status` on bugs; `category` on learnings — all validated against typed constant arrays.
- **Parameterized queries:** 100% of DB queries use prepared statements with bound parameters.
- **LIKE metachar escaping:** `featureService.ts` correctly escapes `%_\` before building LIKE search terms.
- **No hardcoded secrets:** No API keys, tokens, or passwords found in any source file.
- **Foreign key enforcement + WAL mode:** Database connection correctly sets `foreign_keys = ON` and `journal_mode = WAL`.
- **Structured logging:** Logger abstraction used consistently; no `console.log` calls in source.
- **No unsafe React patterns:** No `dangerouslySetInnerHTML`, `innerHTML`, or `eval()` in frontend.
