# Security Review Report — Orchestrator Cycle Dashboard

**Reviewer:** Security QA Agent
**Date:** 2026-03-25
**Scope:** Frontend-only — `Source/Frontend/src/pages/OrchestratorCyclesPage.tsx`, `Source/Frontend/src/components/orchestrator/*`, modifications to `App.tsx` and `Sidebar.tsx`
**Feature:** FR-070 through FR-076 (Orchestrator Cycle Dashboard)
**Previous Report:** Plans/dev-workflow-platform/security-report-run5.md (Run 5)

---

## Verdict: PASSED_WITH_WARNINGS

The orchestrator cycle dashboard is a frontend-only feature with clean, secure implementation. No CRITICAL or HIGH issues found. React's default JSX escaping prevents XSS. Resource cleanup (intervals, EventSource) is properly handled. One MEDIUM finding regarding unbounded log accumulation, and several LOW/INFO observations.

---

## Test Results

| Suite | Files | Tests | Result |
|-------|-------|-------|--------|
| OrchestratorCycles.test.tsx | 1 | 23 | ALL PASSED |
| OrchestratorCycleCard.test.tsx | 1 | 27 | ALL PASSED |
| Layout.test.tsx | 1 | 11 | ALL PASSED |
| Traceability | — | FR-070–FR-076 | PASS (all 7 FRs covered) |

**Total: 61 tests passing, 0 failures.**

---

## Security Analysis

### Positive Security Controls Observed

1. **XSS Prevention** — All dynamic content (`cycle.id`, `cycle.team`, `cycle.task`, `cycle.phase`, `cycle.error`, `entry.message`, `entry.agent`) is rendered via React JSX text interpolation, which auto-escapes HTML entities. No `dangerouslySetInnerHTML` or `innerHTML` usage anywhere.

2. **URL Path Injection Prevention** — `CycleLogStream` uses `encodeURIComponent(cycleId)` when constructing the SSE URL (`CycleLogStream.tsx:38`). Test confirms encoding of special characters like `/` and `&`.

3. **Tab-napping Prevention** — Port links include `rel="noopener noreferrer"` on all `target="_blank"` anchors (`CycleCard.tsx:129`).

4. **Progress Bar Clamping** — Progress value is clamped with `Math.min(100, Math.max(0, cycle.progress))` (`CycleCard.tsx:114`), preventing CSS injection or layout breakage from out-of-range values.

5. **Malformed Data Handling** — SSE `onmessage` handler wraps `JSON.parse` in try/catch, silently discarding malformed events (`CycleLogStream.tsx:42-47`). Test confirms graceful handling.

6. **Resource Cleanup** — Polling interval cleared on unmount (`OrchestratorCyclesPage.tsx:37-38`). EventSource closed on unmount/collapse (`CycleLogStream.tsx:54-56`). Elapsed-time timer cleared (`CycleCard.tsx:61`). No resource leaks.

7. **Destructive Action Guard** — Stop button requires `window.confirm()` before calling `orchestrator.stopCycle()` (`CycleCard.tsx:65`). Tests verify both confirm and cancel paths.

---

## Findings

### M-01: Unbounded Log Accumulation (MEDIUM)

**Location:** `CycleLogStream.tsx:44`
**Description:** The SSE `onmessage` handler appends every log entry to the `logs` state array with `setLogs((prev) => [...prev, entry])` and has no upper bound. For long-running orchestrator cycles that emit thousands of log events, this will consume unbounded memory and degrade rendering performance.
**Impact:** Denial of service to the browser tab — excessive memory consumption and React re-render overhead for very long-running cycles.
**Recommendation:** Cap the log array at a reasonable maximum (e.g., 1000 entries) using FIFO eviction: `setLogs((prev) => [...prev, entry].slice(-1000))`.
**Risk:** MEDIUM — realistic for long-running orchestrator cycles; mitigated by the fact that users can collapse the log stream.

### L-01: No Error Backoff on Polling (LOW)

**Location:** `OrchestratorCyclesPage.tsx:33-38`
**Description:** The 5-second polling interval runs unconditionally via `setInterval`. When the API is unreachable, it will continue making requests every 5 seconds indefinitely with no exponential backoff.
**Impact:** Unnecessary network traffic and potential console noise when the orchestrator is down. Minimal real impact since this is a dev tool.
**Recommendation:** Consider pausing or slowing polling after consecutive failures (e.g., double the interval up to 30s on error, reset on success).
**Risk:** LOW — dev tool context, no external impact.

### L-02: Unvalidated Port Values in Links (LOW)

**Location:** `CycleCard.tsx:127`
**Description:** Port values from `cycle.ports` (typed as `Record<string, number>`) are interpolated into `http://localhost:${port}` links. The TypeScript type provides compile-time safety but no runtime validation. The orchestrator API returns `any`, so a malformed response could inject unexpected values.
**Impact:** At worst, creates a malformed URL that navigates to an unexpected local address. No script execution possible since React sets `href` as an attribute, not evaluated code. JavaScript URLs (`javascript:`) are blocked by React's href sanitization.
**Recommendation:** Optionally validate that port is a positive integer before rendering. Low priority given dev tool context.
**Risk:** LOW — React's attribute setting prevents code execution.

### I-01: No Runtime Type Validation on API Responses (INFO)

**Location:** `OrchestratorCyclesPage.tsx:23`
**Description:** `(result.data ?? []) as OrchestratorCycle[]` is a TypeScript type assertion, not a runtime validator. The orchestrator API client returns `any`. Malformed or unexpected shapes from the external orchestrator could cause undefined property access or UI rendering issues.
**Impact:** UI may render incorrectly or show undefined values. No security impact — just robustness.
**Note:** This is acknowledged in design decision DD-04 and is acceptable for a dev tool that communicates with a known internal service.

### I-02: No Authentication on SSE Endpoint (INFO)

**Location:** `CycleLogStream.tsx:37-38`
**Description:** EventSource connects to `/api/orchestrator/api/cycles/:id/logs` without authentication headers. The native `EventSource` API does not support custom headers.
**Impact:** None in practice — the endpoint is proxied through the backend which handles any necessary auth. Documented in contracts.md: "No authentication headers needed (proxied through backend)."
**Note:** By design for dev tool context.

### I-03: Approvals Page Removed from Routes (INFO)

**Location:** `App.tsx`
**Description:** The Approvals page (`/approvals`) route is no longer present in `App.tsx`. The Sidebar also no longer includes an "Approvals" nav item. This was part of the original 7-page design (FR-028) but appears to have been intentionally removed as the orchestrator dashboard replaces the dev cycle workflow.
**Impact:** No security impact. Noting for traceability — FR-028 coverage should be verified by the traceability reviewer.

---

## Carry-Forward from Run 5

All findings from `security-report-run5.md` remain applicable to the existing backend and non-orchestrator frontend code. This review scope is limited to the new orchestrator dashboard components. No regressions introduced.

---

## Summary Table

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| M-01 | MEDIUM | Unbounded log accumulation in CycleLogStream | OPEN |
| L-01 | LOW | No error backoff on polling | OPEN |
| L-02 | LOW | Unvalidated port values in links | OPEN |
| I-01 | INFO | No runtime type validation on API responses | ACCEPTED (DD-04) |
| I-02 | INFO | No authentication on SSE endpoint | ACCEPTED (by design) |
| I-03 | INFO | Approvals page removed from routes | NOTE for traceability |

**Overall assessment:** The implementation follows security best practices for a React frontend. The code is clean, properly escapes all dynamic content, handles errors gracefully, and cleans up resources. The MEDIUM finding (M-01) is the only item that should be addressed before production use of long-running cycles.
