# UX Consistency Polish — Dispatch Plan

**Task:** UX consistency and polish pass across the entire portal frontend
**Risk Level:** medium (20+ files, frontend-only, no schema changes)
**Design Doc:** Plans/ux-consistency-polish/design.md

## Scoping / Bin-Packing

All changes are frontend-only. No backend-coder needed.

### Frontend Complexity Points
| Work Item | Size | Points | Files |
|-----------|------|--------|-------|
| Color system (Task 1) | L | 4 | 9 files |
| Terminology (Task 2) | S | 1 | 2 files |
| Loading states (Task 3) | S | 1 | 5 files |
| Empty states (Task 4) | M | 2 | 5 files |
| Filter UI (Task 5) | M | 2 | 3 files |
| Button hierarchy (Task 6) | S | 1 | 2 files |
| Accessibility (Task 7) | M | 2 | 3 files |
| Card consistency (Task 8) | S | 1 | 2 files |
| Polling indicator (Task 9) | S | 1 | 1 file |
| **Total** | | **15** | |

15 points → 3 frontend coders per scaling rules.

### Assignment by file proximity

---

### frontend-coder-1

**Focus: Color system + Button hierarchy (Tasks 1, 2, 6)**
Points: 4 + 1 + 1 = 6

Update all status/severity badge color maps and button colors across list and detail components.

**Files to modify (all paths relative to `Source/Frontend/src/`):**

1. **`components/feature-requests/FeatureRequestList.tsx`**
   - Change `STATUS_COLORS.in_development` from `bg-yellow-100 text-yellow-700` → `bg-amber-100 text-amber-700`
   - Change `STATUS_COLORS.completed` from `bg-purple-100 text-purple-700` → `bg-green-100 text-green-700`
   - Change `PRIORITY_COLORS.medium` from `bg-blue-100 text-blue-600` → `bg-gray-100 text-gray-500`
   - Change `PRIORITY_COLORS.high` from `bg-orange-100 text-orange-600` → `bg-amber-100 text-amber-600`

2. **`components/feature-requests/FeatureRequestDetail.tsx`**
   - Change `STATUS_COLORS.in_development` from `bg-yellow-100 text-yellow-700` → `bg-amber-100 text-amber-700`
   - Change `STATUS_COLORS.completed` from `bg-purple-100 text-purple-700` → `bg-green-100 text-green-700`
   - Change "Submit to Orchestrator" button from `bg-purple-600 hover:bg-purple-700` → `bg-blue-600 hover:bg-blue-700`

3. **`components/bugs/BugList.tsx`**
   - Change `SEVERITY_COLORS.medium` from `bg-yellow-100 text-yellow-700` → `bg-gray-100 text-gray-500`
   - Change `SEVERITY_COLORS.high` from `bg-orange-100 text-orange-700` → `bg-amber-100 text-amber-700`
   - Change `STATUS_COLORS.in_development` from `bg-yellow-100 text-yellow-700` → `bg-amber-100 text-amber-700`

4. **`components/bugs/BugDetail.tsx`**
   - Change `SEVERITY_COLORS.medium` from `bg-yellow-100 text-yellow-700 border-yellow-200` → `bg-gray-100 text-gray-500 border-gray-200`
   - Change `SEVERITY_COLORS.high` from `bg-orange-100 text-orange-700 border-orange-200` → `bg-amber-100 text-amber-700 border-amber-200`
   - Change `STATUS_COLORS.in_development` from `bg-yellow-100 text-yellow-700` → `bg-amber-100 text-amber-700`
   - Rename "Screenshots" label → "Attachments"

5. **`components/bugs/BugForm.tsx`**
   - Rename "Screenshots" label → "Attachments"

6. **`components/orchestrator/CycleCard.tsx`**
   - Change team badge from `bg-indigo-100 text-indigo-700` → `bg-blue-100 text-blue-700`

7. **`components/orchestrator/CompletedCyclesSection.tsx`**
   - Ensure team badge is `bg-blue-100 text-blue-700` (currently blue-100/blue-800, change text to blue-700)

8. **`components/dashboard/SummaryWidgets.tsx`**
   - Change `CYCLE_PHASE_COLORS.spec_changes` from `bg-purple-100 text-purple-800` → `bg-blue-100 text-blue-800`
   - Change `CYCLE_PHASE_COLORS.implementation` from `bg-yellow-100 text-yellow-800` → `bg-amber-100 text-amber-800`
   - Change `CYCLE_PHASE_COLORS.review` from `bg-orange-100 text-orange-800` → `bg-amber-100 text-amber-800`
   - Change `CYCLE_PHASE_COLORS.smoke_test` from `bg-pink-100 text-pink-800` → `bg-gray-100 text-gray-800`
   - Change bug severity bar `high` from `bg-orange-500` → `bg-amber-500`
   - Change bug severity bar `medium` from `bg-yellow-500` → `bg-gray-400`

9. **`components/dashboard/ActivityFeed.tsx`**
   - Change `TYPE_COLORS.cycle` from `bg-purple-100 text-purple-700` → `bg-blue-100 text-blue-700`
   - Change `TYPE_COLORS.ticket` from `bg-yellow-100 text-yellow-700` → `bg-gray-100 text-gray-600`
   - Change `TYPE_COLORS.feature` from `bg-indigo-100 text-indigo-700` → `bg-blue-100 text-blue-700`

10. **`components/learnings/LearningsList.tsx`**
    - Change `CATEGORY_COLORS.technical` from `bg-purple-100 text-purple-700` → `bg-gray-100 text-gray-700`

**Verification:** After changes, grep for `purple-`, `orange-`, `indigo-`, `pink-` in Source/Frontend/src/ — should find zero matches in status/badge color maps. Only amber, blue, green, red, gray should remain.

---

### frontend-coder-2

**Focus: Loading states + Empty states + Polling indicator (Tasks 3, 4, 9)**
Points: 1 + 2 + 1 + 1 = 5

Standardize all loading spinners with contextual text and all empty states with icon+heading+subtitle pattern.

**Files to modify (all paths relative to `Source/Frontend/src/`):**

1. **`pages/DashboardPage.tsx`**
   - Find the loading spinner div and add `<p className="mt-3 text-sm text-gray-500">Loading dashboard...</p>` below the spinner div, inside the centering wrapper
   - Standardize spinner to `h-8 w-8 border-b-2 border-blue-600`

2. **`pages/FeatureRequestsPage.tsx`**
   - Add `<p className="mt-3 text-sm text-gray-500">Loading feature requests...</p>` below spinner
   - Ensure spinner is `h-8 w-8 border-b-2 border-blue-600`

3. **`pages/BugReportsPage.tsx`**
   - Add `<p className="mt-3 text-sm text-gray-500">Loading bug reports...</p>` below spinner
   - Ensure spinner is `h-8 w-8 border-b-2 border-blue-600`

4. **`pages/OrchestratorCyclesPage.tsx`**
   - Add `<p className="mt-3 text-sm text-gray-500">Loading cycles...</p>` below spinner
   - Standardize spinner to `h-8 w-8 border-b-2 border-blue-600`
   - **Empty state:** Replace emoji `⚡` with an inline SVG icon (a simple circle-slash or empty-box icon using `<svg>` with `className="mx-auto h-12 w-12 text-gray-300"`). Keep the heading and subtitle.
   - **Polling indicator:** Add state to track last fetch time. After the `<Header>` component and before the content `<div>`, add: `<div className="px-6 flex justify-end"><span className="text-xs text-gray-400">Last updated: {secondsAgo}s ago</span></div>`. Update `secondsAgo` every second via a `useEffect`/`setInterval` that increments a counter, reset to 0 on each successful fetch.

5. **`components/feature-requests/FeatureRequestList.tsx`**
   - **Empty state:** Replace current simple text with centered container:
     ```
     <div className="text-center py-12">
       <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
         <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
       </svg>
       <h3 className="mt-3 text-base font-medium text-gray-600">No feature requests found</h3>
       <p className="mt-1 text-sm text-gray-400">Create one to get started</p>
     </div>
     ```

6. **`components/bugs/BugList.tsx`**
   - **Empty state:** Same pattern as above but with bug icon (circle with exclamation), heading "No bug reports found", subtitle "All clear!"

7. **`components/learnings/LearningsList.tsx`**
   - **Empty state:** Replace emoji `📚` with SVG icon (book/document icon), keep heading and subtitle structure, ensure classes match the standard pattern

8. **`components/dashboard/ActivityFeed.tsx`**
   - **Empty state:** Replace minimal "No recent activity" text with the standard centered pattern: SVG icon (clock or activity icon), heading "No recent activity", subtitle "Activity will appear here as changes are made"

9. **`pages/LearningsPage.tsx`**
   - Standardize spinner to `h-8 w-8 border-b-2 border-blue-600`
   - Add `<p className="mt-3 text-sm text-gray-500">Loading learnings...</p>` below spinner

**Verification:** All loading states should have contextual text. All empty states should follow the icon+heading+subtitle pattern with no emoji.

---

### frontend-coder-3

**Focus: Filter UI + Accessibility + Card consistency (Tasks 5, 7, 8)**
Points: 2 + 2 + 1 = 5

Standardize filter UI, fix accessibility issues, and ensure card consistency.

**Files to modify (all paths relative to `Source/Frontend/src/`):**

1. **`pages/LearningsPage.tsx`**
   - Convert the cycle filter from form-submit pattern to immediate-onChange pattern (remove the `<form>`, `<button>Filter</button>`, and the `handleCycleSearch` submit handler)
   - Make the cycle input an immediate filter: on `onChange`, set the cycle filter value directly (debounce with 300ms if needed)
   - Remove the separate "Filter" button
   - Keep the clear `×` button for active filters
   - Add active filter indicator: when any filter is not its default value, add a visual indicator. For each `<select>`, when value !== default, add `border-blue-500 ring-1 ring-blue-500` to the select's className (conditionally)

2. **`pages/FeatureRequestsPage.tsx`**
   - Add active filter indicator: when status or source filter is not "all"/default, add `border-blue-500 ring-1 ring-blue-500` to that select's className

3. **`pages/BugReportsPage.tsx`**
   - Add active filter indicator: same pattern as FeatureRequestsPage

4. **`components/orchestrator/CycleLogStream.tsx`**
   - Change `LEVEL_COLORS.info` from `text-green-400` → `text-green-300`
   - Change fallback from `text-green-400` → `text-green-300`

5. **`components/common/ImageThumbnails.tsx`**
   - Change grid className from current to `grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3`
   - Add `aria-label="Remove image"` to delete buttons

6. **Add `aria-label` to icon-only buttons in these files:**
   - `components/feature-requests/FeatureRequestDetail.tsx` — close button (the `×` button): add `aria-label="Close"`
   - `components/bugs/BugDetail.tsx` — close button: add `aria-label="Close"`
   - `components/orchestrator/CycleCard.tsx` — stop button: add `aria-label="Stop cycle"`, view logs button: add `aria-label="Toggle logs"`
   - `pages/DashboardPage.tsx` — refresh button: add `aria-label="Refresh dashboard"`
   - `components/common/ImageThumbnails.tsx` — delete button already handled above
   - `pages/LearningsPage.tsx` — clear filter button: add `aria-label="Clear filter"`

7. **`components/feature-requests/FeatureRequestList.tsx`**
   - Ensure card has: `bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-all p-4`
   - Ensure title is: `text-base font-semibold` (currently `font-medium`, change to `font-semibold`)

8. **`components/bugs/BugList.tsx`**
   - Match card structure exactly to FeatureRequestList: `bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-all p-4`
   - Ensure title is: `text-base font-semibold`
   - Ensure same metadata layout pattern (flex items-center gap-3 mt-2 text-xs text-gray-400)

**Verification:**
- Run accessibility check: no icon-only buttons without aria-label
- Grep for `text-green-400` in CycleLogStream — should be zero
- Compare FeatureRequestList and BugList card classNames — should be identical
- Filter selects should have blue ring when active
