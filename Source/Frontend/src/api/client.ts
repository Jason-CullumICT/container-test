// Verifies: FR-023
// Typed API client for all backend endpoints with uniform error handling

import type {
  FeatureRequest,
  BugReport,
  DevelopmentCycle,
  Ticket,
  Learning,
  Feature,
  DashboardSummary,
  ActivityItem,
  PipelineRun,
  CycleFeedback,
} from '../../../Shared/types'

import type {
  CreateFeatureRequestInput,
  UpdateFeatureRequestInput,
  DenyFeatureRequestInput,
  CreateBugInput,
  UpdateBugInput,
  UpdateCycleInput,
  CreateTicketInput,
  UpdateTicketInput,
  CreateLearningInput,
  CompleteStageInput,
  CreateCycleFeedbackInput,
} from '../../../Shared/api'

// --- Error class ---

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// --- Core fetch wrapper ---

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (res.status === 204) {
    return undefined as unknown as T
  }

  const data = await res.json()

  if (!res.ok) {
    const message = (data as { error?: string }).error ?? `HTTP ${res.status}`
    throw new ApiError(message, res.status)
  }

  return data as T
}

// --- Feature Requests ---

export const featureRequests = {
  list(params?: { status?: string; source?: string }): Promise<{ data: FeatureRequest[] }> {
    const query = new URLSearchParams()
    if (params?.status) query.set('status', params.status)
    if (params?.source) query.set('source', params.source)
    const qs = query.toString()
    return apiFetch(`/api/feature-requests${qs ? `?${qs}` : ''}`)
  },

  create(input: CreateFeatureRequestInput): Promise<FeatureRequest> {
    return apiFetch('/api/feature-requests', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  getById(id: string): Promise<FeatureRequest> {
    return apiFetch(`/api/feature-requests/${id}`)
  },

  update(id: string, input: UpdateFeatureRequestInput): Promise<FeatureRequest> {
    return apiFetch(`/api/feature-requests/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  },

  delete(id: string): Promise<void> {
    return apiFetch(`/api/feature-requests/${id}`, { method: 'DELETE' })
  },

  vote(id: string): Promise<FeatureRequest> {
    return apiFetch(`/api/feature-requests/${id}/vote`, { method: 'POST' })
  },

  approve(id: string): Promise<FeatureRequest> {
    return apiFetch(`/api/feature-requests/${id}/approve`, { method: 'POST' })
  },

  deny(id: string, input: DenyFeatureRequestInput): Promise<FeatureRequest> {
    return apiFetch(`/api/feature-requests/${id}/deny`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
}

// --- Bug Reports ---

export const bugs = {
  list(params?: { status?: string; severity?: string }): Promise<{ data: BugReport[] }> {
    const query = new URLSearchParams()
    if (params?.status) query.set('status', params.status)
    if (params?.severity) query.set('severity', params.severity)
    const qs = query.toString()
    return apiFetch(`/api/bugs${qs ? `?${qs}` : ''}`)
  },

  create(input: CreateBugInput): Promise<BugReport> {
    return apiFetch('/api/bugs', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  getById(id: string): Promise<BugReport> {
    return apiFetch(`/api/bugs/${id}`)
  },

  update(id: string, input: UpdateBugInput): Promise<BugReport> {
    return apiFetch(`/api/bugs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  },

  delete(id: string): Promise<void> {
    return apiFetch(`/api/bugs/${id}`, { method: 'DELETE' })
  },
}

// --- Development Cycles ---

export const cycles = {
  list(): Promise<{ data: DevelopmentCycle[] }> {
    return apiFetch('/api/cycles')
  },

  create(): Promise<DevelopmentCycle> {
    return apiFetch('/api/cycles', { method: 'POST' })
  },

  getById(id: string): Promise<DevelopmentCycle> {
    return apiFetch(`/api/cycles/${id}`)
  },

  update(id: string, input: UpdateCycleInput): Promise<DevelopmentCycle> {
    return apiFetch(`/api/cycles/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  },

  createTicket(cycleId: string, input: CreateTicketInput): Promise<Ticket> {
    return apiFetch(`/api/cycles/${cycleId}/tickets`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  updateTicket(cycleId: string, ticketId: string, input: UpdateTicketInput): Promise<Ticket> {
    return apiFetch(`/api/cycles/${cycleId}/tickets/${ticketId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  },

  completeCycle(id: string): Promise<DevelopmentCycle> {
    return apiFetch(`/api/cycles/${id}/complete`, { method: 'POST' })
  },
}

// --- Dashboard ---

export const dashboard = {
  getSummary(): Promise<DashboardSummary> {
    return apiFetch('/api/dashboard/summary')
  },

  getActivity(limit?: number): Promise<{ data: ActivityItem[] }> {
    const qs = limit ? `?limit=${limit}` : ''
    return apiFetch(`/api/dashboard/activity${qs}`)
  },
}

// --- Learnings ---

export const learnings = {
  list(params?: { category?: string; cycle_id?: string }): Promise<{ data: Learning[] }> {
    const query = new URLSearchParams()
    if (params?.category) query.set('category', params.category)
    if (params?.cycle_id) query.set('cycle_id', params.cycle_id)
    const qs = query.toString()
    return apiFetch(`/api/learnings${qs ? `?${qs}` : ''}`)
  },

  create(input: CreateLearningInput): Promise<Learning> {
    return apiFetch('/api/learnings', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
}

// --- Features ---

export const features = {
  list(q?: string): Promise<{ data: Feature[] }> {
    const qs = q ? `?q=${encodeURIComponent(q)}` : ''
    return apiFetch(`/api/features${qs}`)
  },
}

// --- Cycle Feedback (FR-063) ---

// Verifies: FR-063
export const cycleFeedback = {
  list(cycleId: string, params?: { agent_role?: string; feedback_type?: string }): Promise<{ data: CycleFeedback[] }> {
    const query = new URLSearchParams()
    if (params?.agent_role) query.set('agent_role', params.agent_role)
    if (params?.feedback_type) query.set('feedback_type', params.feedback_type)
    const qs = query.toString()
    return apiFetch(`/api/cycles/${cycleId}/feedback${qs ? `?${qs}` : ''}`)
  },

  create(cycleId: string, input: CreateCycleFeedbackInput): Promise<CycleFeedback> {
    return apiFetch(`/api/cycles/${cycleId}/feedback`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
}

// --- Pipeline Runs (FR-044) ---

export const pipelineRuns = {
  // Verifies: FR-044
  list(params?: { status?: string }): Promise<{ data: PipelineRun[] }> {
    const query = new URLSearchParams()
    if (params?.status) query.set('status', params.status)
    const qs = query.toString()
    return apiFetch(`/api/pipeline-runs${qs ? `?${qs}` : ''}`)
  },

  get(id: string): Promise<PipelineRun> {
    return apiFetch(`/api/pipeline-runs/${id}`)
  },

  startStage(runId: string, stageNumber: number): Promise<PipelineRun> {
    return apiFetch(`/api/pipeline-runs/${runId}/stages/${stageNumber}/start`, {
      method: 'POST',
    })
  },

  completeStage(runId: string, stageNumber: number, input: CompleteStageInput): Promise<PipelineRun> {
    return apiFetch(`/api/pipeline-runs/${runId}/stages/${stageNumber}/complete`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  getByCycleId(cycleId: string): Promise<PipelineRun> {
    return apiFetch(`/api/cycles/${cycleId}/pipeline`)
  },
}
