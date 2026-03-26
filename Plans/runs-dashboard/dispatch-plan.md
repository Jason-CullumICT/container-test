# Runs Dashboard & Retry Workflow — Dispatch Plan

**Task:** Add Runs dashboard tab with retry/cleanup workflow to the Orchestrator page
**Risk Level:** medium (new feature, new components, 6-8 files changed/created, no schema changes)
**Team:** TheATeam

RISK_LEVEL: medium

## Scoping

### Frontend Changes (all work is frontend-only)

| FR | Description | Size | Files |
|----|-------------|------|-------|
| FR-090 | API client extensions (retryRun, cleanupRun) | S | client.ts |
| FR-090 | Type definitions for OrchestratorRun | S | types.ts |
| FR-091 | Runs tab with table + polling | L | OrchestratorCyclesPage.tsx, RunsTab.tsx (new) |
| FR-092 | Run detail expandable row | M | RunDetailRow.tsx (new) |
| FR-093 | Retry button with notification | S | RunsTab.tsx |
| FR-094 | Cleanup button with optimistic removal | S | RunsTab.tsx |
| FR-095 | Real-time pulsing indicators + cycle link | S | RunsTab.tsx |
| Tests | Unit tests for all FRs | M | OrchestratorRuns.test.tsx (new) |

**Total points:** S(1)+S(1)+L(4)+M(2)+S(1)+S(1)+S(1)+M(2) = 13 points
**Scaling decision:** 13 points -> but all in one layer (frontend), and high file proximity. Use 2 frontend coders to parallelize.

## Implementation Agents

### frontend-coder-1

**Assignment:** API client, types, tab infrastructure, and RunsTab component (FR-090, FR-091, FR-093, FR-094, FR-095)
**Points:** 8 (S+S+L+S+S+S)

**Instructions:**
Read the plan files at `Plans/runs-dashboard/` (requirements.md, design.md, contracts.md) and follow them exactly.

**Files to modify:**
1. `Source/Frontend/src/api/client.ts` — Add `retryRun(id, opts?)` and `cleanupRun(id)` methods to the orchestrator object
2. `Source/Frontend/src/components/orchestrator/types.ts` — Add OrchestratorRun and related types per contracts.md
3. `Source/Frontend/src/pages/OrchestratorCyclesPage.tsx` — Add tab bar (Cycles | Runs) with useState, conditionally render existing content or new RunsTab

**Files to create:**
4. `Source/Frontend/src/components/orchestrator/RunsTab.tsx` — Main runs tab component:
   - Poll `orchestrator.listRuns()` every 10s (same useRef+setInterval pattern as cycles page)
   - Render table with columns: truncated ID (last 8 chars, title=full), status badge, team badge, risk badge, task (80 chars), time-ago, feedback loops, actions
   - Retry button on failed runs: calls `orchestrator.retryRun(id)`, disabled while in-flight, shows green notification banner on success with new run ID (auto-dismiss 5s)
   - Cleanup button on completed/failed runs: calls `orchestrator.cleanupRun(id)`, optimistic removal from local state, re-fetch on error
   - Pulsing dot indicator for active statuses (planning, implementing, qa_running, validating)
   - Cycle link: if run has `cycleId`, render a link that switches to Cycles tab (accept an `onSwitchToCycles` prop)
   - Track expanded row ID in state, pass to RunDetailRow
   - Use color maps from design.md (RUN_STATUS_COLORS, RISK_COLORS)

**Patterns to follow:**
- Status badge pattern from `CycleCard.tsx` (STATUS_BADGE map with bg/text classes)
- Polling pattern from `OrchestratorCyclesPage.tsx` (useRef + setInterval + cleanup)
- Button loading pattern from `CycleCard.tsx` (disabled + text change while loading)
- Error banner pattern (bg-red-50 border-red-200 text-red-700)
- No external libraries — use native `window.confirm` if needed, inline banners for notifications

**Traceability comments:** Every component/function must have `// Verifies: FR-0XX` comments.

### frontend-coder-2

**Assignment:** RunDetailRow expandable component and all tests (FR-092, tests for FR-090-095)
**Points:** 4 (M+M)

**Instructions:**
Read the plan files at `Plans/runs-dashboard/` (requirements.md, design.md, contracts.md) and follow them exactly.

Wait for or coordinate with frontend-coder-1 on the types defined in `types.ts` and the `RunsTab.tsx` interface.

**Files to create:**
1. `Source/Frontend/src/components/orchestrator/RunDetailRow.tsx` — Expandable detail section:
   - Receives an `OrchestratorRun` object as prop and `expanded: boolean`
   - Conditionally renders detail content when expanded
   - Sections:
     a. Full task description (plain text, no truncation)
     b. Phase results grid: 5 phases (leader, implementation, qa, smoketest, inspector), each with a pass (green check) / fail (red X) / skipped (gray dash) icon
     c. E2E test results: if `run.testResults` exists, show total/passed/failed counts with color coding
     d. PR info: if `run.pr` exists, show PR number as link to URL, AI review verdict badge, merge status badge
     e. RetryOf: if `run.retryOf` exists, show "Retry of: {id}" as a clickable element (calls an `onNavigateToRun` prop)
   - Use expandable pattern from CompletedCyclesSection (conditional render with transition)
   - Add `data-testid` attributes for testing

2. `Source/Frontend/tests/OrchestratorRuns.test.tsx` — Comprehensive tests:
   - FR-090: Test that `retryRun` and `cleanupRun` exist and call correct endpoints (mock apiFetch)
   - FR-091: Test RunsTab renders table with correct columns, polling starts and cleans up, status/team/risk badges render with correct classes
   - FR-092: Test RunDetailRow expands on click, shows phase results, test results, PR info, retryOf link
   - FR-093: Test retry button appears only on failed runs, disables while loading, shows notification on success
   - FR-094: Test cleanup button appears on completed/failed runs, removes row optimistically
   - FR-095: Test pulsing indicator on active runs, cycle link renders when cycleId present
   - Mock the orchestrator API client (same pattern as `tests/OrchestratorCycles.test.tsx`)
   - Use `@testing-library/react` and `vitest` (same test stack as existing tests)
   - Every test must have `// Verifies: FR-0XX` traceability comment

**Patterns to follow:**
- Expandable section from `CompletedCyclesSection.tsx`
- Test mocking from `tests/OrchestratorCycles.test.tsx` and `tests/OrchestratorCycleCard.test.tsx`
- Badge rendering from `CycleCard.tsx`

**Traceability comments:** Every component/test must have `// Verifies: FR-0XX` comments.

## Dependencies Between Agents

frontend-coder-2 depends on frontend-coder-1 for:
- Type definitions in `types.ts` (OrchestratorRun interface)
- RunsTab component interface (props, state shape) for writing integration-level tests

**Recommendation:** Run frontend-coder-1 first, then frontend-coder-2. Or run in parallel with frontend-coder-2 using the contracts.md types as the stable contract, then reconcile.

## QA Verification Gates

After implementation, run:
1. `cd Source/Frontend && npx vitest run` — all tests must pass
2. `cd Source/Frontend && npx tsc --noEmit` — no type errors
3. `python3 tools/traceability-enforcer.py` — FR traceability check
4. Visual review: Runs tab renders, expandable rows work, retry/cleanup actions function
