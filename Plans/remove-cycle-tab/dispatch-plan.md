# Fix: Remove the Cycle tab from Orchestrator page

## Summary

The Orchestrator page (`OrchestratorCyclesPage.tsx`) currently has a two-tab UI: **Cycles** and **Runs**. The Cycles tab is redundant — it duplicates information available in the Runs section. This fix removes the Cycles tab entirely and makes the Runs content the default (and only) view.

## Risk Assessment

RISK_LEVEL: low

- Bug fix / UI simplification
- 2 source files changed, 1 test file updated
- No schema changes, no backend changes, no auth/security impact

## Scope

**scope_tag:** frontend-only

## Root Cause

The Cycles tab (with `CycleCard`, `CompletedCyclesSection`, `CycleLogStream`) provides no additional value over the Runs section. The tab bar adds unnecessary UI complexity.

## Files to Change

### Frontend Files

1. **`Source/Frontend/src/pages/OrchestratorCyclesPage.tsx`** — Main page component
2. **`Source/Frontend/tests/OrchestratorCycles.test.tsx`** — Tests for the page
3. **`Source/Frontend/tests/OrchestratorRuns.test.tsx`** — Tests referencing tab bar (tab integration tests at bottom)

## Fix Plan

### `Source/Frontend/src/pages/OrchestratorCyclesPage.tsx`

1. **Remove imports** for `CycleCard`, `CompletedCyclesSection`, and `OrchestratorCycle` type (lines 8, 9, 12)
2. **Remove the `TabId` type** (line 14) and `POLL_INTERVAL_MS` constant (line 16) — no longer needed for cycle polling
3. **Remove all cycle-related state**: `activeTab`, `cycles`, `loading`, `error`, `intervalRef` (lines 21-25)
4. **Remove `fetchCycles` callback** (lines 27-37)
5. **Remove the cycle polling `useEffect`** (lines 39-51)
6. **Remove `handleStop` callback** (lines 53-61)
7. **Remove `handleSwitchToCycles` callback** (lines 64-66)
8. **Remove `activeCycles` / `completedCycles` derived state** (lines 68-69)
9. **Remove the entire tab bar JSX** (lines 78-96)
10. **Remove the cycles tab content branch** (lines 99-142) — keep only the Runs content
11. **Simplify the page** to just render `<Header>` + `<RunsTab />` (no `onSwitchToCycles` prop)
12. **Keep the `orchestrator` import** only if still used — remove if not
13. **Update subtitle** from "Real-time orchestrator cycle dashboard" to "Orchestrator run history" or similar

The simplified component should look roughly like:
```tsx
import React from 'react'
import { Header } from '../components/layout/Header'
import { RunsTab } from '../components/orchestrator/RunsTab'

export function OrchestratorCyclesPage() {
  return (
    <div>
      <Header title="Orchestrator" subtitle="Run history and status" />
      <div className="p-6">
        <RunsTab />
      </div>
    </div>
  )
}
```

### `Source/Frontend/tests/OrchestratorCycles.test.tsx`

1. **Remove all tests that reference cycle-specific UI**: loading spinner, active cycles, polling, empty state, error banner, cycle card, port links, elapsed time, stop button, completed cycles section — these all test the removed Cycles tab content
2. **Remove `CompletedCyclesSection` tests** entirely (the `describe('CompletedCyclesSection', ...)` block)
3. **Keep** the module export tests (`OrchestratorCyclesPage is a valid export`, `App.tsx default export is defined`)
4. **Add a simple test** verifying the page renders with `<RunsTab>` (renders runs-tab testid)
5. **Remove mock setup** for `orchestrator.listCycles`, `orchestrator.stopCycle`, fake timers, and cycle fixtures
6. **Update imports** — remove `CompletedCyclesSection`, `OrchestratorCycle` type

### `Source/Frontend/tests/OrchestratorRuns.test.tsx`

1. **Update or remove** the `OrchestratorCyclesPage — tab bar` describe block at the bottom (lines 791-819) — the tab bar no longer exists. Keep the module export assertions but remove tab-bar-specific ones.
2. **Update** any tests that pass `onSwitchToCycles` — the prop still exists on `RunsTab` but the page no longer passes it, so the "cycle link" tests (FR-095 lines 755-786) remain valid as unit tests of RunsTab but the integration context changes. These can stay as-is since they test `RunsTab` directly.

### Files NOT changed (but now unused — can be cleaned up later)

These cycle-specific components are no longer imported by the page but may still be used elsewhere. The fixer should verify no other imports exist before deleting:
- `Source/Frontend/src/components/orchestrator/CycleCard.tsx`
- `Source/Frontend/src/components/orchestrator/CompletedCyclesSection.tsx`
- `Source/Frontend/src/components/orchestrator/CycleLogStream.tsx`
- `Source/Frontend/tests/OrchestratorCycleCard.test.tsx`

If no other files import them, delete them to avoid dead code.

---

## Dispatch Instructions

### frontend-fixer-1

**Role:** `frontend-fixer`
**Task:** Remove the Cycles tab from the Orchestrator page and simplify to Runs-only view.

Read the fix plan at `Plans/remove-cycle-tab/dispatch-plan.md` and implement all changes listed under "Fix Plan". Key points:
- Simplify `OrchestratorCyclesPage.tsx` to remove all cycle state/UI, keep only Header + RunsTab
- Update `OrchestratorCycles.test.tsx` — remove cycle-specific tests, keep module export tests, add basic render test
- Update `OrchestratorRuns.test.tsx` — remove/update the tab bar integration test block
- Check if `CycleCard.tsx`, `CompletedCyclesSection.tsx`, `CycleLogStream.tsx` are imported anywhere else — if not, delete them and their test file
- Run all frontend tests to verify zero new failures

**Verification:** Run `cd Source/Frontend && npx vitest run` — all tests must pass.
