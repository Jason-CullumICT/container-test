# Fix: work-backlog repo not available for selection

## Root Cause Analysis

The portal has hardcoded repo lists in multiple frontend components that only include `container-test` and `claude-ai-OS`. The `work-backlog` repo is missing from all of these lists. While there is a dynamic `repos.list()` API call, it silently catches errors and falls back to the hardcoded defaults. The fix is to add `work-backlog` to every hardcoded repo list so it's always available.

## Scope

- **scope_tag:** `frontend-only`
- **confidence:** high
- **Files to modify:** 4 frontend files

## Files Affected

| File | Change |
|------|--------|
| `Source/Frontend/src/components/common/RepoSelector.tsx` (lines 11-14) | Add `work-backlog` to hardcoded `knownRepos` default |
| `Source/Frontend/src/components/bugs/BugDetail.tsx` (lines 38-41) | Add `work-backlog` to hardcoded `knownRepos` default |
| `Source/Frontend/src/components/bugs/BugForm.tsx` (line 19) | No repo list here, but default is `container-test` — acceptable |
| `Source/Frontend/src/components/feature-requests/FeatureRequestForm.tsx` (line 19) | No repo list here, but default is `container-test` — acceptable |

## Detailed Fix Instructions

### Fix 1: RepoSelector.tsx (line 11-14)

Add `work-backlog` entry to the `useState` default array:

**File:** `Source/Frontend/src/components/common/RepoSelector.tsx`

**Current (lines 11-14):**
```tsx
const [knownRepos, setKnownRepos] = useState<{ name: string; fullName: string; url: string }[]>([
  { name: "container-test", fullName: "Jason-CullumICT/container-test", url: "https://github.com/Jason-CullumICT/container-test" },
  { name: "claude-ai-OS", fullName: "Jason-CullumICT/claude-ai-OS", url: "https://github.com/Jason-CullumICT/claude-ai-OS" },
])
```

**Replace with:**
```tsx
const [knownRepos, setKnownRepos] = useState<{ name: string; fullName: string; url: string }[]>([
  { name: "container-test", fullName: "Jason-CullumICT/container-test", url: "https://github.com/Jason-CullumICT/container-test" },
  { name: "claude-ai-OS", fullName: "Jason-CullumICT/claude-ai-OS", url: "https://github.com/Jason-CullumICT/claude-ai-OS" },
  { name: "work-backlog", fullName: "Jason-CullumICT/work-backlog", url: "https://github.com/Jason-CullumICT/work-backlog" },
])
```

### Fix 2: BugDetail.tsx (lines 38-41)

Add `work-backlog` entry to the `useState` default array:

**File:** `Source/Frontend/src/components/bugs/BugDetail.tsx`

**Current (lines 38-41):**
```tsx
const [knownRepos, setKnownRepos] = useState<{ name: string; url: string }[]>([
  { name: "container-test", url: "https://github.com/Jason-CullumICT/container-test" },
  { name: "claude-ai-OS", url: "https://github.com/Jason-CullumICT/claude-ai-OS" },
])
```

**Replace with:**
```tsx
const [knownRepos, setKnownRepos] = useState<{ name: string; url: string }[]>([
  { name: "container-test", url: "https://github.com/Jason-CullumICT/container-test" },
  { name: "claude-ai-OS", url: "https://github.com/Jason-CullumICT/claude-ai-OS" },
  { name: "work-backlog", url: "https://github.com/Jason-CullumICT/work-backlog" },
])
```

### No changes needed for:
- **BugForm.tsx** — uses `RepoSelector` component, which will now include `work-backlog`
- **FeatureRequestForm.tsx** — uses `RepoSelector` component, which will now include `work-backlog`
- **FeatureRequestDetail.tsx** — starts with empty list and fetches from API; has fallback logic to inject saved repo
- **BugReportsPage.tsx** — only uses `target_repo` from existing bug records for batch submit grouping

## Verification

1. Build frontend: `cd Source/Frontend && npx tsc --noEmit`
2. Run frontend tests: `cd Source/Frontend && npx vitest run`
3. Visual check: confirm `work-backlog` appears in repo dropdowns on bug and feature request forms

---

### frontend-fixer-1

**Module:** `Source/Frontend/`
**Task:** Add `work-backlog` repo to hardcoded default repo lists

Apply the two fixes described above:

1. In `Source/Frontend/src/components/common/RepoSelector.tsx` (lines 11-14): Add `{ name: "work-backlog", fullName: "Jason-CullumICT/work-backlog", url: "https://github.com/Jason-CullumICT/work-backlog" }` to the `knownRepos` useState default array.

2. In `Source/Frontend/src/components/bugs/BugDetail.tsx` (lines 38-41): Add `{ name: "work-backlog", url: "https://github.com/Jason-CullumICT/work-backlog" }` to the `knownRepos` useState default array. Note: this component uses a simpler type without `fullName`.

After making changes, run:
- `cd Source/Frontend && npx tsc --noEmit` (type check)
- `cd Source/Frontend && npx vitest run` (tests)

Ensure zero new failures.
