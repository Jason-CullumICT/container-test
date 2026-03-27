# Frontend Coder Learnings

## 2026-03-27 — Status Sync & UX Consistency Polish

- CycleLogStream.tsx and CycleCard.tsx referenced in dispatch plans do not exist. The orchestrator UI uses RunsTab.tsx and RunDetailRow.tsx instead.
- FeatureRequestDetail had duplicate run-fetching logic (two separate useEffects both polling orchestrator runs). The canonical pattern is a single useEffect with task prefix matching.
- BugDetail was missing auto-sync when a linked orchestrator run completed — only had manual buttons. Pattern should match FeatureRequestDetail: auto-update status on `complete`, manual buttons as fallback.
- The task prefix for matching runs must match the format used in submitWork: `Implement feature: {title}` for features, `Fix bug: {title}` for bugs.
- Color system: yellow-* classes should be amber-* across the codebase. Check RunDetailRow verdict colors when editing.
- Pre-existing test failures: many test fixtures missing `target_repo` field. Not blocking but should be fixed in a separate pass.
