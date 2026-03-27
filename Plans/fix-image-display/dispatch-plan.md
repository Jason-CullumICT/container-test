# Fix: Images in bugs and features aren't displayed correctly

## Root Cause Analysis

Three bugs identified in the frontend code that prevent images from working correctly in orchestrator submissions and cause runtime errors:

### Bug 1: BugDetail.tsx — Missing `onUpdate` prop (CRITICAL)
- **File**: `Source/Frontend/src/components/bugs/BugDetail.tsx`
- **Line 110**: Calls `onUpdate(updated)` but `onUpdate` is not declared in `BugDetailProps` interface (line 11-14) and not destructured from props
- **Impact**: `ReferenceError: onUpdate is not defined` crashes the `handleSubmitToOrchestrator` function. While `strict: true` is enabled in tsconfig, Vite uses esbuild for transpilation (no type checking), so this compiles but crashes at runtime.
- **Symptom**: Submitting a bug to the orchestrator always fails with an error after the submission itself succeeds, preventing the UI from updating bug status to `in_development`

### Bug 2: BugReportsPage.tsx — No `onUpdate` handler passed to BugDetail
- **File**: `Source/Frontend/src/pages/BugReportsPage.tsx`
- **Lines 162-165**: `<BugDetail bug={selectedBug} onClose={...} />` — missing `onUpdate` prop
- **Impact**: Even after fixing Bug 1, BugDetail needs the page to provide the callback

### Bug 3: FeatureRequestDetail.tsx — Missing `repo` in orchestrator submit
- **File**: `Source/Frontend/src/components/feature-requests/FeatureRequestDetail.tsx`
- **Lines 101-103**: `orchestrator.submitWork()` is called with `{ images, claudeSessionToken, tokenLabel }` but omits `repo: selectedRepo`
- **Impact**: The orchestrator doesn't receive the target repository for feature request submissions. The `selectedRepo` state exists (line 33) and the repo selector UI works (lines 288-307), but the value is never sent.

## Scope

- **scope_tag**: `frontend-only`
- **Files to modify**: 3 frontend files
- **Files to verify**: Existing frontend tests for images
- **Confidence**: high

## Fix Plan

### frontend-fixer-1

#### Fix 1: BugDetail.tsx — Add `onUpdate` prop and wire it up

**File**: `Source/Frontend/src/components/bugs/BugDetail.tsx`

1. Update `BugDetailProps` interface (line 11-14) to add `onUpdate`:
```typescript
interface BugDetailProps {
  bug: BugReport
  onUpdate: (updated: BugReport) => void
  onClose: () => void
}
```

2. Update the destructuring on line 31 to include `onUpdate`:
```typescript
export function BugDetail({ bug, onUpdate, onClose }: BugDetailProps) {
```

These two changes make the existing `onUpdate(updated)` call on line 110 valid.

#### Fix 2: BugReportsPage.tsx — Pass `onUpdate` to BugDetail

**File**: `Source/Frontend/src/pages/BugReportsPage.tsx`

1. Add a `handleUpdate` function (similar to FeatureRequestsPage pattern):
```typescript
const handleUpdate = (updated: BugReport) => {
  setSelectedBug(updated)
  refetch()
}
```

2. Update the BugDetail render (lines 162-165) to pass `onUpdate`:
```tsx
<BugDetail
  bug={selectedBug}
  onUpdate={handleUpdate}
  onClose={() => setSelectedBug(null)}
/>
```

#### Fix 3: FeatureRequestDetail.tsx — Add `repo` to orchestrator submit

**File**: `Source/Frontend/src/components/feature-requests/FeatureRequestDetail.tsx`

1. Update the `orchestrator.submitWork()` call (lines 101-103) to include `repo`:
```typescript
await orchestrator.submitWork(
  `Implement feature: ${fr.title}\n\n${fr.description}`,
  { repo: selectedRepo, images: imageFiles.length > 0 ? imageFiles : undefined, claudeSessionToken: sessionToken || undefined, tokenLabel: tokenLabel || undefined }
)
```

### Verification

After fixes, verify:
1. `tsc --noEmit` passes with no errors on the modified files
2. Existing image-related tests still pass
3. BugDetail renders without runtime errors
4. Orchestrator submissions for both bugs and features include all expected fields
