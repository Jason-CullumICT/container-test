# Runs Dashboard — API Contracts

## New API Client Methods

### retryRun
```typescript
retryRun(id: string, opts?: { team?: string }): Promise<{ id: string; status: string }>
// POST /api/orchestrator/api/runs/{id}/retry
// Body: opts (optional JSON)
```

### cleanupRun
```typescript
cleanupRun(id: string): Promise<void>
// POST /api/orchestrator/api/cycles/{id}/cleanup
// No body
```

## New TypeScript Interfaces

Add to `Source/Frontend/src/components/orchestrator/types.ts`:

```typescript
export type OrchestratorRunStatus =
  | 'planning'
  | 'implementing'
  | 'qa_running'
  | 'validating'
  | 'complete'
  | 'failed'

export interface RunPhaseResult {
  phase: string          // 'leader' | 'implementation' | 'qa' | 'smoketest' | 'inspector'
  status: string         // 'passed' | 'failed' | 'skipped'
  message?: string
}

export interface RunTestResults {
  total: number
  passed: number
  failed: number
}

export interface RunPRInfo {
  number: number
  url: string
  aiReviewVerdict?: string   // 'approved' | 'changes_requested' | etc
  mergeStatus?: string       // 'merged' | 'open' | 'closed'
}

export interface OrchestratorRun {
  id: string
  status: OrchestratorRunStatus
  team?: string
  task?: string
  riskLevel?: 'low' | 'medium' | 'high'
  phases?: RunPhaseResult[]
  testResults?: RunTestResults
  pr?: RunPRInfo
  retryOf?: string           // ID of original run if this is a retry
  feedbackLoops?: number
  cycleId?: string           // linked cycle ID for cross-referencing
  startedAt?: string
  completedAt?: string
  error?: string
}
```

## Existing Methods (Already Present, Unchanged)
```typescript
listRuns(): Promise<{ data: any[] }>   // becomes Promise<{ data: OrchestratorRun[] }> with cast
getRun(id: string): Promise<any>       // becomes Promise<OrchestratorRun> with cast
```

Note: Since these hit an external orchestrator service, we cast the `any` responses to our local types at the call site, not in the client itself.
