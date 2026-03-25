# Security Review Report — Orchestrator Cycle Dashboard (Run 6)

**Pipeline Run ID:** (pending — assigned by orchestrator)
**Reviewer:** Security QA Agent
**Date:** 2026-03-25
**Scope:** Source/Frontend/src/ — Orchestrator Cycle Dashboard (FR-070 through FR-076)
**Previous Report:** Plans/dev-workflow-platform/security-report-run5.md (Run 5)

---

## Verdict: PASSED

The orchestrator cycle dashboard is a frontend-only feature that introduces no new backend code or API endpoints. It adds 4 new React components and modifies 2 existing files (App.tsx, Sidebar.tsx). No CRITICAL, HIGH, or MEDIUM security issues found. All prior findings carry forward unchanged. Two new LOW findings and one INFO finding identified.

---

## Test Results

| Suite | Files | Tests | Result |
|-------|-------|-------|--------|
| Frontend | 12 | 189 | ALL PASSED |
| Traceability | — | 53 FRs | PASS (100% coverage of implemented FRs) |

**Baseline comparison:** Run 5 had 139 frontend tests. Run 6 has 189 frontend tests (+50 orchestrator dashboard tests). Zero regressions.

---

## New Feature Security Analysis (FR-070 through FR-076)

### XSS — SAFE

No usage of `dangerouslySetInnerHTML`, `innerHTML`, `eval()`, or `document.write()` in any new component. All data is rendered as JSX text nodes:
- `CycleCard.tsx`: cycle.id, cycle.team, cycle.task, cycle.phase, cycle.error rendered as text children
- `CycleLogStream.tsx`: log entry timestamp, agent, and message rendered as `<span>` text content
- `CompletedCyclesSection.tsx`: cycle.id, cycle.team, cycle.status rendered as text children

SSE log messages (`entry.message`) are rendered via JSX (`<span className="ml-1">{entry.message}</span>`) which auto-escapes HTML. **No XSS risk identified.**

### SSE Endpoint URL Construction — SAFE (CycleLogStream.tsx:37-38)

The SSE URL uses `encodeURIComponent(cycleId)` to prevent path traversal or injection:
```typescript
new EventSource(`/api/orchestrator/api/cycles/${encodeURIComponent(cycleId)}/logs`)
```
Test coverage confirms this with a special character cycle ID test (`cycle/special&id` → `cycle%2Fspecial%26id`). **No injection risk.**

### Port Link Construction — LOW RISK (See L-11)

`CycleCard.tsx:127` constructs port links as `http://localhost:${port}`. The `port` value comes from the untyped orchestrator API response (`Record<string, number>` in the type definition, but `any` at runtime). If the orchestrator API returned a non-numeric port value, the URL could be manipulated. See finding L-11.

### Polling Cleanup — CORRECT (OrchestratorCyclesPage.tsx:33-39)

The 5-second polling interval is properly cleaned up on unmount:
```typescript
return () => {
  if (intervalRef.current) clearInterval(intervalRef.current)
}
```
Test confirms no additional API calls occur after unmount. **No memory leak risk.**

### SSE EventSource Cleanup — CORRECT (CycleLogStream.tsx:54-56)

EventSource is properly closed on unmount or when `expanded` becomes false:
```typescript
return () => {
  eventSource.close()
}
```
Test confirms `close()` is called on unmount. **No connection leak risk.**

### Elapsed Time Timer Cleanup — CORRECT (CycleCard.tsx:57-61)

The 1-second elapsed time interval is properly cleaned up:
```typescript
return () => clearInterval(timer)
```
Timer only runs for `running` status cycles and stops when status changes. **No timer leak.**

### Progress Bar Value Clamping — CORRECT (CycleCard.tsx:114)

Progress percentage is clamped between 0 and 100:
```typescript
style={{ width: `${Math.min(100, Math.max(0, cycle.progress))}%` }}
```
Test confirms that a progress value of 150 renders as 100%. Prevents CSS overflow. **No visual injection risk.**

### Malformed SSE Data Handling — CORRECT (CycleLogStream.tsx:42-47)

SSE `onmessage` handler wraps `JSON.parse` in try/catch. Malformed data is silently skipped. Test confirms no crash on invalid JSON. **No denial-of-service risk from bad SSE data.**

### Unbounded Log Accumulation — LOW RISK (See L-12)

See finding L-12.

### `console.log` Usage — NONE

Grep confirmed zero `console.log` calls in all new orchestrator components. **Compliant with CLAUDE.md observability requirements.**

### No Hardcoded Secrets — PASS

No API keys, tokens, passwords, or credentials in any new file.

---

## Run 5 Findings — Carry-Forward Status

All prior findings carry forward unchanged. This feature is frontend-only with no backend changes.

| ID | Previous Finding | Status |
|----|-----------------|--------|
| M-01 | All endpoints unauthenticated | **UNCHANGED** — orchestrator proxy also unauthenticated |
| L-02 | `/metrics` on same port | **UNCHANGED** |
| L-05-R | Uncapped length on spec_changes, assignee | **UNCHANGED** |
| L-06 | Non-integer limit silently defaulted | **UNCHANGED** |
| L-07 | Bug status transitions not guarded | **UNCHANGED** |
| L-08 | Pipeline completeStageAction not transactional | **UNCHANGED** |
| L-09 | No length validation on traceability text fields | **UNCHANGED** |
| L-10 | `related_work_item_type` not enum-validated | **UNCHANGED** |

---

## Summary Table

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH     | 0 |
| MEDIUM   | 1 (M-01 unchanged — deliberate v1 decision) |
| LOW      | 9 (7 unchanged + 2 new: L-11, L-12) |
| INFO     | 7 (6 unchanged + 1 new: I-07) |

---

## Findings

### LOW

#### L-11 — Port Link URLs Constructed from Untyped API Response (NEW)

**File:** `Source/Frontend/src/components/orchestrator/CycleCard.tsx` (line 127)
**Description:** Port links are rendered as `<a href="http://localhost:${port}">` where `port` comes from `cycle.ports` (typed as `Record<string, number>` but returned as `any` from the API client). If the orchestrator API returned a non-numeric value (e.g., a string like `javascript:alert(1)//`), the resulting URL would be `http://localhost:javascript:alert(1)//` which is not exploitable due to the `http://localhost:` prefix. However, a crafted port name (the key, not value) is rendered as text content and is also safe.

The `rel="noopener noreferrer"` attribute is correctly applied to all port links, preventing reverse tab-nabbing.

**Severity:** LOW — The `http://localhost:` prefix makes URL injection non-exploitable. The only risk is a confusing link if the API returns garbage data.

**Remediation (optional):**
```typescript
const numericPort = Number(port)
if (!Number.isFinite(numericPort) || numericPort < 1 || numericPort > 65535) return null
```

---

#### L-12 — Unbounded SSE Log Accumulation in Client Memory (NEW)

**File:** `Source/Frontend/src/components/orchestrator/CycleLogStream.tsx` (line 44)
**Description:** Every SSE message is appended to the `logs` state array without any cap:
```typescript
setLogs((prev) => [...prev, entry])
```

For long-running cycles, this array could grow indefinitely, consuming browser memory. A cycle running for hours with frequent log output could accumulate thousands of entries.

**Severity:** LOW — This is a client-side resource concern, not a security vulnerability. The component is only active when the user has explicitly expanded the log stream. Closing the log stream or navigating away clears the state.

**Remediation (optional):**
```typescript
const MAX_LOG_ENTRIES = 1000
setLogs((prev) => {
  const next = [...prev, entry]
  return next.length > MAX_LOG_ENTRIES ? next.slice(-MAX_LOG_ENTRIES) : next
})
```

---

### INFO

#### I-07 — Orchestrator API Responses Cast from `any` Without Runtime Validation (NEW)

**File:** `Source/Frontend/src/pages/OrchestratorCyclesPage.tsx` (line 23)
**Description:** The `orchestrator.listCycles()` method returns `Promise<{ data: any[] }>`. The response is cast to `OrchestratorCycle[]` without runtime validation:
```typescript
setCycles((result.data ?? []) as OrchestratorCycle[])
```

If the orchestrator API changes its response shape, the frontend would receive data that doesn't match the TypeScript interface, potentially causing runtime errors (e.g., accessing `cycle.status` on an object where `status` is missing). All component code uses optional chaining where appropriate (e.g., `cycle.ports && ...`, `cycle.team && ...`), which mitigates most null/undefined access issues.

**Severity:** INFO — This is a robustness concern, not a security issue. TypeScript type assertions are erased at runtime. The existing optional chaining provides adequate protection against missing fields.

---

## Architecture Compliance

| Rule | Status |
|------|--------|
| Specs are source of truth | PASS — Implementation traces to FR-070 through FR-076 per requirements.md |
| No direct DB calls from routes | N/A — Frontend-only change |
| Shared types single source | PASS — Orchestrator types correctly defined locally (external service, not shared DB types) |
| Every FR has a test with traceability | PASS — All 53 implemented FRs covered (FR-070–FR-076 in OrchestratorCycles.test.tsx + OrchestratorCycleCard.test.tsx) |
| No hardcoded secrets | PASS |
| Routes have observability | PASS — No console.log; structured logging not needed (frontend components) |
| Business logic has no framework imports | N/A — React components appropriately use React |
| No backend modifications | PASS — Only frontend files created/modified |

---

## Positive Security Observations

1. **SSE URL properly encoded** — `encodeURIComponent(cycleId)` prevents path traversal (CycleLogStream.tsx:38)
2. **All links use `rel="noopener noreferrer"`** — Prevents reverse tab-nabbing on port links (CycleCard.tsx:129)
3. **Progress bar value clamped** — `Math.min(100, Math.max(0, ...))` prevents CSS overflow (CycleCard.tsx:114)
4. **Malformed SSE data handled** — JSON.parse in try/catch with silent skip (CycleLogStream.tsx:42-47)
5. **All timers and connections cleaned up** — Polling interval, elapsed time interval, EventSource all have cleanup in useEffect return (3 separate cleanup paths, all tested)
6. **No `dangerouslySetInnerHTML`** — All data rendered as safe JSX text nodes
7. **No `console.log`** — Compliant with observability requirements
8. **Stop action requires confirmation** — `window.confirm()` prevents accidental cycle stops (CycleCard.tsx:65)
9. **Null-safe data access** — Optional chaining on team, task, phase, ports, error fields
10. **Connection error states displayed** — "Logs unavailable" and "Connection lost" messages shown to user (CycleLogStream.tsx:74-76, 89-91)
11. **Comprehensive test coverage** — 50 new tests covering all components, edge cases, and cleanup

---

## Comparison: Run 5 → Run 6

| Metric | Run 5 | Run 6 |
|--------|-------|-------|
| Verdict | PASSED_WITH_WARNINGS | PASSED |
| CRITICAL | 0 | 0 |
| HIGH | 0 | 0 |
| MEDIUM | 1 (M-01) | 1 (M-01 unchanged) |
| LOW | 7 | 9 (+2 new: L-11 port URLs, L-12 unbounded logs) |
| INFO | 6 | 7 (+1 new: I-07 untyped API cast) |
| Frontend tests | 139 | 189 (+50 orchestrator tests) |
| Traceability | 47 FRs at 100% | 53 FRs at 100% |
| New components | 0 | 4 (OrchestratorCyclesPage, CycleCard, CycleLogStream, CompletedCyclesSection) |
| Modified files | 0 | 2 (App.tsx, Sidebar.tsx) |
| Backend changes | 2 feedback endpoints | 0 (frontend-only) |
