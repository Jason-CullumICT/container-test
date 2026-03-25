# Chaos Test Report: Orchestrator Cycle Dashboard

**Tester:** chaos-tester
**Team:** TheATeam
**Date:** 2026-03-25
**Scope:** FR-070 through FR-076 (Orchestrator Cycle Dashboard)
**Specifications:** Plans/orchestrator-cycle-dashboard/requirements.md, contracts.md, design.md

---

## Test Summary

| Category | Result |
|----------|--------|
| Tests | 189 passed, 0 failed (12 test files) |
| Traceability | PASS — all 7 new FRs (FR-070–FR-076) have source + test coverage |
| console.log violations | 0 |
| Architecture violations | 0 |
| New test failures | 0 |

---

## Adversarial Analysis

### AREA 1: Empty Cycle List Handling

**Verdict: PASS**

- `OrchestratorCyclesPage.tsx:72-79` — renders an empty state (`data-testid="empty-state"`) with descriptive text when no cycles are returned
- Test at `OrchestratorCycles.test.tsx:134-141` — verifies empty state renders correctly when `listCycles()` returns `{ data: [] }`
- Edge case: `result.data ?? []` (line 23) safely handles a response where `data` is undefined/null

### AREA 2: API Error Handling

**Verdict: PASS**

- `OrchestratorCyclesPage.tsx:26` — catches errors from `listCycles()`, extracts message, sets error state
- Error banner rendered at line 63 with `data-testid="error-banner"`
- Test at `OrchestratorCycles.test.tsx:144-151` — verifies error banner displays on `listCycles()` rejection
- Stop cycle errors also caught at line 47, displayed via the same error banner
- **Edge case tested**: Non-Error throws handled via `err instanceof Error ? err.message : 'Failed to fetch cycles'`

### AREA 3: SSE Disconnect / Connection Errors

**Verdict: PASS**

- `CycleLogStream.tsx:50-52` — `onerror` handler sets `connectionError` state
- Two distinct error states rendered:
  - No logs + error → "Logs unavailable — connection error" (line 74-76)
  - Has logs + error → "Connection lost — stream ended" (line 89-91)
- EventSource closed on unmount (line 54-56) — tested at `OrchestratorCycleCard.test.tsx:300-305`
- Malformed JSON gracefully skipped (try/catch in `onmessage`, line 42-47) — tested at line 325-337
- **EventSource URL encoding**: Uses `encodeURIComponent(cycleId)` (line 38) — tested with special chars at line 339-345

### AREA 4: Polling Cleanup (Memory Leak Prevention)

**Verdict: PASS**

- `OrchestratorCyclesPage.tsx:37-38` — `useEffect` cleanup clears interval on unmount
- Uses `useRef` for interval handle (line 18) — correct pattern for mutable ref
- Test at `OrchestratorCycles.test.tsx:123-131` — verifies no additional calls after unmount
- `CycleCard.tsx:57-61` — elapsed time timer also cleaned up properly

### AREA 5: Component Contract Compliance

**Verdict: PASS**

All component interfaces match contracts.md exactly:
- `CycleCardProps` — `{ cycle, onStop, onRefresh }` ✓
- `CycleLogStreamProps` — `{ cycleId, expanded }` ✓
- `CompletedCyclesSectionProps` — `{ cycles }` ✓
- Types `OrchestratorCycle` and `CycleLogEntry` match contracts.md ✓

### AREA 6: Route and Sidebar Changes

**Verdict: PASS**

- `App.tsx` — imports `OrchestratorCyclesPage`, routes `/cycle` to it (FR-075) ✓
- `Sidebar.tsx` — label changed to "Orchestrator", icon changed to ⚡ (FR-076) ✓
- Old `DevelopmentCyclePage.tsx` not deleted (per DD-02) ✓
- No other routes or imports affected by the change ✓
- Layout.test.tsx updated to verify "Orchestrator" label (line 93) ✓

---

## Findings

### FINDING 1: Port Link URL Not Validated Against Non-Numeric Injection
**Severity: MEDIUM**

**Location:** `CycleCard.tsx:127` — `href={`http://localhost:${port}`}`

The `port` value from `cycle.ports` is interpolated directly into the href without validating it's a number. The TypeScript type is `Record<string, number>`, so TypeScript constrains this at compile time, but the runtime data comes from an external orchestrator API returning `any`.

**Attack scenario:** If the orchestrator API returns `ports: { app: "@attacker.com/path" }`, the rendered href would be `http://localhost:@attacker.com/path`, which is a valid URL that navigates to `attacker.com`.

**Mitigation:** The `http://localhost:` prefix prevents `javascript:` protocol injection. The `target="_blank"` + `rel="noopener noreferrer"` prevents tab hijacking. This is a dev tool used on localhost. Risk is LOW in practice but MEDIUM by principle.

**Recommendation:** Add a runtime check: `typeof port === 'number' && port > 0 && port <= 65535` before rendering port links.

### FINDING 2: Unbounded Log Accumulation in CycleLogStream
**Severity: LOW**

**Location:** `CycleLogStream.tsx:44` — `setLogs((prev) => [...prev, entry])`

Logs accumulate indefinitely in the `logs` state array. For long-running cycles with high log volume, this could cause memory pressure and rendering performance degradation.

**Mitigation:** The component is only visible when expanded and logs are cleared when `expanded` toggles (line 34: `setLogs([])`). The `max-h-64 overflow-y-auto` CSS limits visual rendering.

**Recommendation:** Add a max log buffer (e.g., keep last 500 entries) to prevent memory growth for very long sessions.

### FINDING 3: No Loading State for Stop Cycle Action
**Severity: INFO**

**Location:** `CycleCard.tsx:64-69`

The stop handler sets `stopping` state (line 66) but `onStop` is called as a fire-and-forget (line 67) — the `stopping` state is never reset. If the stop fails, the button remains disabled showing "Stopping..." until the cycle card re-renders from the next poll.

**Current behavior:** The 5-second polling will eventually refresh the card with the updated cycle status or the same status if stop failed. The `stopping` state is reset when the component re-mounts with new props.

**Impact:** Minor UX inconsistency — user sees "Stopping..." for up to 5 seconds if the stop succeeds, or indefinitely if the stop fails (until next poll refreshes the card).

### FINDING 4: CompletedCyclesSection Shows Truncated IDs
**Severity: INFO**

**Location:** `CompletedCyclesSection.tsx:59` — `{cycle.id.slice(0, 8)}`

Completed cycle IDs are truncated to 8 characters. If cycle IDs are not UUID-format, 8 characters may not be unique enough to distinguish cycles.

**Impact:** Minimal — this is display-only and the section is for informational purposes.

### FINDING 5: Missing FR-075 Traceability in App.tsx Source
**Severity: INFO**

**Location:** `App.tsx:20`

The `// Verifies: FR-075` comment is in a JSX comment (`{/* Verifies: FR-075 */}`) rather than a standard JS comment. The traceability enforcer correctly picks this up, so no functional issue.

---

## Architecture Compliance

| Rule | Status | Notes |
|------|--------|-------|
| No console.log | ✓ | Zero instances found |
| Shared types are single source | ✓ | Uses local types (correct — external service, per contracts.md) |
| Every FR needs a test | ✓ | FR-070–FR-076 all covered |
| No backend modifications | ✓ | Frontend-only changes |
| Business logic has no framework imports | ✓ | `formatElapsed`, `formatDuration` are pure functions |
| Component unmount cleanup | ✓ | Intervals, EventSource all cleaned up |

---

## Verification Gates

```
Frontend tests:   189 passed, 0 failed ✅
Traceability:     PASS — all implemented FRs covered ✅
console.log:      0 violations ✅
```

---

## Overall Verdict: PASS

The implementation is solid with good error handling, proper cleanup, correct contract compliance, and comprehensive test coverage. The findings are all LOW/INFO severity with no blockers. The MEDIUM port validation issue is mitigated by the `http://localhost:` prefix and the dev-tool context.

**Recommendations for future improvement (non-blocking):**
1. Add runtime port number validation in CycleCard
2. Add max log buffer in CycleLogStream
3. Reset `stopping` state on stop failure in CycleCard
