// Verifies: FR-070
// Local types for orchestrator cycle data (external service schema, not shared types)

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

// Verifies: FR-090
export type OrchestratorRunStatus =
  | 'planning'
  | 'implementing'
  | 'qa_running'
  | 'validating'
  | 'complete'
  | 'failed'

// Verifies: FR-090
export interface RunPhaseResult {
  phase: string
  status: string
  message?: string
}

// Verifies: FR-090
export interface RunTestResults {
  total: number
  passed: number
  failed: number
}

// Verifies: FR-090
export interface RunPRInfo {
  number: number
  url: string
  aiReviewVerdict?: string
  mergeStatus?: string
}

// Verifies: FR-090
export interface OrchestratorRun {
  id: string
  status: OrchestratorRunStatus
  team?: string
  task?: string
  riskLevel?: 'low' | 'medium' | 'high'
  phases?: RunPhaseResult[]
  testResults?: RunTestResults
  pr?: RunPRInfo
  retryOf?: string
  feedbackLoops?: number
  cycleId?: string
  startedAt?: string
  completedAt?: string
  error?: string
}
