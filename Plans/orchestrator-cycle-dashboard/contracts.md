# API Contracts: Orchestrator Cycle Dashboard

**Date:** 2026-03-25

## No New Backend Endpoints

This feature is frontend-only. All data comes from the existing orchestrator proxy at `/api/orchestrator/*`.

## Existing API Client Methods Used

From `Source/Frontend/src/api/client.ts`:

```typescript
orchestrator.listCycles(): Promise<{ data: any[] }>
orchestrator.getCycle(id: string): Promise<any>
orchestrator.stopCycle(id: string): Promise<{ stopped: boolean }>
orchestrator.submitWork(task: string, opts?): Promise<{ id, status, statusUrl, ports, branch }>
```

## SSE Endpoint

```
GET /api/orchestrator/api/cycles/:id/logs
Content-Type: text/event-stream

Each event:
data: {"timestamp": "ISO8601", "agent": "string", "message": "string", "level": "info|warn|error"}
```

Connect using native `EventSource` API. No authentication headers needed (proxied through backend).

## Frontend Type Definitions

These types are local to the frontend orchestrator components (not shared types, since the orchestrator is an external service with its own schema).

Define in `Source/Frontend/src/components/orchestrator/types.ts`:

```typescript
// Verifies: FR-070
export interface OrchestratorCycle {
  id: string
  status: 'running' | 'completed' | 'stopped' | 'failed'
  team?: string
  task?: string
  phase?: string
  progress?: number
  ports?: Record<string, number>
  branch?: string
  startedAt?: string
  completedAt?: string
  error?: string
}

// Verifies: FR-073
export interface CycleLogEntry {
  timestamp: string
  agent?: string
  message: string
  level?: 'info' | 'warn' | 'error'
}
```

## Component Interface Contracts

### OrchestratorCyclesPage
- No props (top-level page)
- Uses `orchestrator.listCycles()` internally
- Manages polling state

### CycleCard
```typescript
interface CycleCardProps {
  cycle: OrchestratorCycle
  onStop: (id: string) => void
  onRefresh: () => void
}
```

### CycleLogStream
```typescript
interface CycleLogStreamProps {
  cycleId: string
  expanded: boolean
}
```

### CompletedCyclesSection
```typescript
interface CompletedCyclesSectionProps {
  cycles: OrchestratorCycle[]
}
```
