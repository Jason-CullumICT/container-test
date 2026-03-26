# UX Consistency and Polish Pass — Design Document

## Overview

A design-quality pass across the entire portal frontend. No new features, no backend changes. Focus on visual consistency, accessibility, and interaction polish.

## Current State Analysis

### Color Inconsistencies Found
- `completed` status uses `purple-100/purple-700` (should be green for success)
- `in_development` uses `yellow-100/yellow-700` (should be amber-500 per spec)
- Bug severity `medium` uses `yellow-100/yellow-700` (should be gray-500 neutral)
- Bug severity `high` uses `orange-100/orange-700` (should be amber)
- FR priority `high` uses `orange-100/orange-600` (should be amber)
- CycleCard team badge uses `indigo-100/indigo-700` (should be gray or blue)
- ActivityFeed cycle type uses `purple-100/purple-700`, feature uses `indigo-100/indigo-700`
- SummaryWidgets uses purple, orange, pink for cycle phases
- "Submit to Orchestrator" button is purple (should be blue primary CTA)
- CompletedCyclesSection team badge uses `blue-100/blue-800` (inconsistent with CycleCard indigo)

### Terminology Inconsistencies
- BugForm.tsx and BugDetail.tsx use "Screenshots" where FeatureRequestForm uses "Attachments"

### Loading State Issues
- All pages use bare spinners with no contextual text
- Spinner sizes inconsistent: h-8/w-8 vs h-10/w-10

### Empty State Issues
- Inconsistent patterns: some use emoji, some plain text, different padding/structure
- ActivityFeed empty state is minimal inline text
- No icon-based empty states (task asks for subtle icons, no emoji)

### Filter UI Issues
- LearningsPage has a separate search button + form submit pattern
- Other pages use immediate-onChange selects
- No active filter indicator on any page

### Button Issues
- "Submit to Orchestrator" is purple (should be blue)
- "Report Bug" submit is red (could be argued either way, but task says primary = blue for submit)
- Generally consistent otherwise

### Accessibility Issues
- CycleLogStream: `text-green-400` on `gray-900` bg has poor contrast
- No aria-labels on icon-only buttons (close, delete, refresh)
- ImageThumbnails grid is not responsive

## Target Color System

| Semantic | Tailwind Token | Usage |
|----------|---------------|-------|
| Primary | blue-600 | CTAs, links, info badges, voting, triaged, running |
| Success | green-600 | approved, resolved, complete, completed, low severity |
| Danger | red-600 | critical severity, failed, deny, bugs CTA, reported bugs |
| Warning | amber-500 | high severity, in_development |
| Neutral | gray-* | inactive, default, closed, medium severity (gray-500) |

### Specific Mappings

**Feature Request STATUS_COLORS:**
- potential → gray-100/gray-700 (no change)
- voting → blue-100/blue-700 (no change)
- approved → green-100/green-700 (no change)
- denied → red-100/red-700 (no change)
- in_development → amber-100/amber-700 (was yellow)
- completed → green-100/green-700 (was purple)

**Feature Request PRIORITY_COLORS:**
- low → gray-100/gray-600 (no change)
- medium → gray-100/gray-500 (was blue)
- high → amber-100/amber-600 (was orange)
- critical → red-100/red-600 (no change)

**Bug SEVERITY_COLORS:**
- low → green-100/green-700 (no change)
- medium → gray-100/gray-500 (was yellow)
- high → amber-100/amber-700 (was orange)
- critical → red-100/red-700 (no change)

**Bug STATUS_COLORS:**
- reported → gray-100/gray-700 (no change)
- triaged → blue-100/blue-700 (no change)
- in_development → amber-100/amber-700 (was yellow)
- resolved → green-100/green-700 (no change)
- closed → gray-100/gray-500 (no change)

**CycleCard:**
- Team badge: blue-100/blue-700 (was indigo)
- Status badges: no change needed (already blue/green/red/gray)

**CompletedCyclesSection:**
- Team badge: blue-100/blue-700 (was blue-100/blue-800, just lighten text)

**SummaryWidgets CYCLE_PHASE_COLORS:**
- spec_changes → blue-100/blue-800 (was purple)
- ticket_breakdown → blue-100/blue-800 (no change)
- implementation → amber-100/amber-800 (was yellow)
- review → amber-100/amber-800 (was orange)
- smoke_test → gray-100/gray-800 (was pink)
- complete → green-100/green-800 (no change)

**SummaryWidgets bug severity bars:**
- critical → bg-red-500 (no change)
- high → bg-amber-500 (was orange)
- medium → bg-gray-400 (was yellow)
- low → bg-green-500 (no change)

**ActivityFeed TYPE_COLORS:**
- feature_request → blue-100/blue-700 (no change)
- bug → red-100/red-700 (no change)
- cycle → blue-100/blue-700 (was purple)
- ticket → gray-100/gray-600 (was yellow)
- learning → green-100/green-700 (no change)
- feature → blue-100/blue-700 (was indigo)

**LearningsList CATEGORY_COLORS:**
- process → blue-100/blue-700 (no change)
- technical → gray-100/gray-700 (was purple)
- domain → green-100/green-700 (no change)

**CycleLogStream LEVEL_COLORS:**
- info → text-green-300 (was green-400, accessibility fix)
- warn → text-yellow-400 (no change)
- error → text-red-400 (no change)

## Files Affected

All in `Source/Frontend/src/`:

### Color System (Task 1)
1. `components/feature-requests/FeatureRequestList.tsx` — STATUS_COLORS, PRIORITY_COLORS
2. `components/feature-requests/FeatureRequestDetail.tsx` — STATUS_COLORS
3. `components/bugs/BugList.tsx` — SEVERITY_COLORS, STATUS_COLORS
4. `components/bugs/BugDetail.tsx` — SEVERITY_COLORS, STATUS_COLORS, "Submit to Orchestrator" button
5. `components/orchestrator/CycleCard.tsx` — team badge color
6. `components/orchestrator/CompletedCyclesSection.tsx` — team badge color
7. `components/dashboard/SummaryWidgets.tsx` — CYCLE_PHASE_COLORS, severity bar colors
8. `components/dashboard/ActivityFeed.tsx` — TYPE_COLORS
9. `components/learnings/LearningsList.tsx` — CATEGORY_COLORS

### Terminology (Task 2)
10. `components/bugs/BugForm.tsx` — "Screenshots" → "Attachments"
11. `components/bugs/BugDetail.tsx` — "Screenshots" → "Attachments"

### Loading States (Task 3)
12. `pages/DashboardPage.tsx` — add "Loading dashboard..."
13. `pages/FeatureRequestsPage.tsx` — add "Loading feature requests..."
14. `pages/BugReportsPage.tsx` — add "Loading bug reports..."
15. `pages/OrchestratorCyclesPage.tsx` — add "Loading cycles..."
16. `pages/LearningsPage.tsx` — add "Loading learnings..."

### Empty States (Task 4)
17. `components/feature-requests/FeatureRequestList.tsx` — standardize empty state
18. `components/bugs/BugList.tsx` — standardize empty state
19. `pages/OrchestratorCyclesPage.tsx` — replace emoji with SVG icon
20. `components/learnings/LearningsList.tsx` — replace emoji with SVG icon
21. `components/dashboard/ActivityFeed.tsx` — standardize empty state

### Filter UI (Task 5)
22. `pages/LearningsPage.tsx` — convert to inline selects, add active filter indicator
23. `pages/FeatureRequestsPage.tsx` — add active filter indicator
24. `pages/BugReportsPage.tsx` — add active filter indicator

### Button Hierarchy (Task 6)
25. `components/feature-requests/FeatureRequestDetail.tsx` — "Submit to Orchestrator" purple→blue
26. `components/bugs/BugForm.tsx` — verify/adjust submit button

### Accessibility (Task 7)
27. `components/orchestrator/CycleLogStream.tsx` — text-green-400→text-green-300
28. Various close/delete/refresh buttons — add aria-label
29. `components/common/ImageThumbnails.tsx` — responsive grid

### Card Consistency (Task 8)
30. `components/feature-requests/FeatureRequestList.tsx` — ensure hover:shadow-md
31. `components/bugs/BugList.tsx` — ensure matching structure

### Polling Indicator (Task 9)
32. `pages/OrchestratorCyclesPage.tsx` — add "Last updated: Xs ago" text

## Complexity Assessment

~25 unique files affected, all frontend-only, no schema changes, no new endpoints.
Most changes are CSS class string replacements and small JSX additions.

**Total: ~32 change points across ~20 unique files**

RISK_LEVEL: medium
