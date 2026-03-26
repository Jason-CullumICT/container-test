# Runs Dashboard & Retry Workflow — Design Review

**Reviewer:** design agent
**Date:** 2026-03-26
**Branch:** cycle/run-1774486940077-6519f274

RISK_LEVEL: medium

## Summary

The implementation adds a Runs dashboard tab with retry/cleanup workflow to the Orchestrator page. All changes are frontend-only as specified. The implementation closely follows the design.md, contracts.md, and requirements.md specifications.

## Verification Gates

| Gate | Result |
|------|--------|
| Unit tests (vitest) | **PASS** — 61/61 tests pass in OrchestratorRuns.test.tsx |
| All frontend tests | **PASS** — 300/300 tests pass across 15 files, zero new failures |
| TypeScript (tsc --noEmit) | **PASS** — No new type errors (pre-existing errors in unrelated test files) |
| Traceability enforcer | **PASS** — FR-090 through FR-095 all have test coverage |
| E2E tests written | **PASS** — Playwright tests at Source/E2E/tests/cycle-run-1774486940077-6519f274/ |

## Files Changed

| File | Change Type | Status |
|------|-------------|--------|
| Source/Frontend/src/api/client.ts | Modified — added retryRun, cleanupRun | OK |
| Source/Frontend/src/components/orchestrator/types.ts | Modified — added OrchestratorRun types | OK |
| Source/Frontend/src/pages/OrchestratorCyclesPage.tsx | Modified — added tab bar, RunsTab integration | OK |
| Source/Frontend/src/components/orchestrator/RunsTab.tsx | New — main runs tab component | OK |
| Source/Frontend/src/components/orchestrator/RunDetailRow.tsx | New — expandable detail row | OK |
| Source/Frontend/tests/OrchestratorRuns.test.tsx | New — 61 tests covering FR-090-095 | OK |

## FR Traceability

| FR | Component(s) | Test Coverage | Status |
|----|-------------|---------------|--------|
| FR-090 | client.ts, types.ts | 5 tests | PASS |
| FR-091 | OrchestratorCyclesPage.tsx, RunsTab.tsx | 16 tests | PASS |
| FR-092 | RunDetailRow.tsx, RunsTab.tsx | 18 tests | PASS |
| FR-093 | RunsTab.tsx | 6 tests | PASS |
| FR-094 | RunsTab.tsx | 5 tests | PASS |
| FR-095 | RunsTab.tsx | 6 tests | PASS |

## Findings

### MEDIUM — React act() warnings in tests

**Severity:** MEDIUM
**Location:** tests/OrchestratorRuns.test.tsx (multiple tests)
**Description:** Several tests produce React `act()` warnings due to state updates happening after the test assertion. This is cosmetic and doesn't affect test correctness, but indicates cleanup of async operations (polling intervals) isn't fully awaited.
**Impact:** No functional impact. Tests pass correctly. These warnings are also present in the existing OrchestratorCycles tests — a pre-existing pattern.
**Recommendation:** Acceptable for now. Could be addressed in a future cleanup pass by wrapping interval cleanup in `act()`.

### LOW — Pre-existing TypeScript errors in unrelated files

**Severity:** LOW (pre-existing, not introduced by this change)
**Location:** tests/BugReports.test.tsx, tests/DevelopmentCycle.test.tsx, tests/FeatureBrowser.test.tsx, tests/PipelineStepper.test.tsx, src/components/cycles/ConsideredFixesList.tsx, src/components/cycles/FeedbackLog.tsx
**Description:** Type errors exist in test fixtures that are missing newer required properties (related_work_item_id, work_item_ref, etc.) and in two component files with broken import paths. None are related to this feature.
**Impact:** None — these were pre-existing before this branch.

### INFO — encodeURIComponent used in API paths

**Severity:** INFO
**Location:** client.ts:373, client.ts:381
**Description:** `retryRun` and `cleanupRun` use `encodeURIComponent(id)` for the path parameter. This is good defensive practice for URL safety but the run IDs are typically UUIDs that don't need encoding. No issue, just noting the positive security practice.

### INFO — Optimistic cleanup has correct rollback

**Severity:** INFO
**Location:** RunsTab.tsx:110-118
**Description:** The cleanup handler correctly implements optimistic removal with re-fetch on error, matching the DD-06 design decision. The error notification is also shown on failure.

### INFO — Polling only active when tab is visible

**Severity:** INFO
**Location:** OrchestratorCyclesPage.tsx:41-51, RunsTab.tsx:73-79
**Description:** Cycles polling stops when Runs tab is active (and vice versa via component unmount). This is efficient resource usage.

## Design Compliance

| Design Decision | Compliance |
|-----------------|-----------|
| DD-01: Frontend-only change | **PASS** — No backend files modified |
| DD-02: Tab-based navigation | **PASS** — useState tab bar with Cycles/Runs |
| DD-03: Local types in types.ts | **PASS** — All new interfaces in orchestrator/types.ts |
| DD-04: 10s poll interval | **PASS** — POLL_INTERVAL_MS = 10000 |
| DD-05: Inline notification | **PASS** — Green/red banner with 5s auto-dismiss |
| DD-06: Optimistic cleanup | **PASS** — Immediate removal, re-fetch on error |

## Contract Compliance

| Contract Item | Compliance |
|--------------|-----------|
| retryRun(id, opts?) signature | **PASS** |
| cleanupRun(id) signature | **PASS** |
| OrchestratorRun interface | **PASS** — matches contracts.md exactly |
| RunPhaseResult, RunTestResults, RunPRInfo | **PASS** |
| OrchestratorRunStatus union type | **PASS** |
| Status color maps | **PASS** — matches design.md |
| Pulsing indicator HTML | **PASS** — matches design.md spec |

## Architecture Compliance

- No direct DB calls from components (frontend-only, uses API client)
- Shared types not modified (local types in orchestrator/types.ts)
- Service layer pattern followed (orchestrator client abstraction)
- `{data: T[]}` wrapper pattern used for listRuns
- No hardcoded secrets
- No framework imports in business logic utilities (formatTimeAgo is pure)
- Traceability comments on all components and tests

## Security Review

- No XSS vectors: all dynamic content rendered via React JSX (auto-escaped)
- PR URLs rendered via `<a>` with `rel="noopener noreferrer"` and `target="_blank"` — correct
- No user-controlled HTML injection
- API calls use proper encodeURIComponent for path parameters
- No localStorage/sessionStorage usage for sensitive data

## Conclusion

Implementation is complete, well-tested (61 unit tests, 6 E2E tests), and fully compliant with the design, contracts, and requirements specifications. All verification gates pass. No critical or high-severity findings. Ready for merge.
