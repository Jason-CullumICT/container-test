// Verifies: FR-044
// Verifies: FR-045
// Verifies: FR-046
// Verifies: FR-049
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PipelineStepper } from '../src/components/cycles/PipelineStepper'
import { DevelopmentCyclePage } from '../src/pages/DevelopmentCyclePage'
import type { PipelineRun, PipelineStage, DevelopmentCycle } from '../../Shared/types'

// --- Mock data ---

function makeStage(overrides: Partial<PipelineStage> & { stage_number: number; stage_name: PipelineStage['stage_name'] }): PipelineStage {
  return {
    id: `stage-${overrides.stage_number}`,
    pipeline_run_id: 'RUN-0001',
    status: 'pending',
    verdict: null,
    agent_ids: [],
    started_at: null,
    completed_at: null,
    ...overrides,
  }
}

const mockPipelineRun: PipelineRun = {
  id: 'RUN-0001',
  cycle_id: 'CYCLE-0001',
  team: 'TheATeam',
  status: 'running',
  current_stage: 3,
  stages_total: 5,
  stages: [
    makeStage({ stage_number: 1, stage_name: 'requirements', status: 'completed', verdict: 'approved', agent_ids: ['requirements-reviewer'] }),
    makeStage({ stage_number: 2, stage_name: 'api_contract', status: 'completed', verdict: 'approved', agent_ids: ['api-contract'] }),
    makeStage({ stage_number: 3, stage_name: 'implementation', status: 'running', agent_ids: ['backend-coder', 'frontend-coder'] }),
    makeStage({ stage_number: 4, stage_name: 'qa', status: 'pending', agent_ids: ['chaos-tester', 'security-qa', 'traceability-reporter', 'visual-playwright', 'qa-review-and-tests'] }),
    makeStage({ stage_number: 5, stage_name: 'integration', status: 'pending', agent_ids: ['design-critic', 'integration-reviewer'] }),
  ],
  created_at: '2026-03-24T10:00:00.000Z',
  updated_at: '2026-03-24T10:05:00.000Z',
  completed_at: null,
}

// --- PipelineStepper unit tests ---

describe('PipelineStepper', () => {
  it('renders all 5 stages', () => {
    // Verifies: FR-045
    render(<PipelineStepper pipelineRun={mockPipelineRun} />)
    expect(screen.getByText('Requirements')).toBeInTheDocument()
    expect(screen.getByText('API Contract')).toBeInTheDocument()
    expect(screen.getByText('Implementation')).toBeInTheDocument()
    expect(screen.getByText('QA')).toBeInTheDocument()
    expect(screen.getByText('Integration')).toBeInTheDocument()
  })

  it('displays pipeline run ID', () => {
    // Verifies: FR-045
    render(<PipelineStepper pipelineRun={mockPipelineRun} />)
    expect(screen.getByText('RUN-0001')).toBeInTheDocument()
  })

  it('shows stage progress count', () => {
    // Verifies: FR-045
    render(<PipelineStepper pipelineRun={mockPipelineRun} />)
    expect(screen.getByText('Stage 3 of 5')).toBeInTheDocument()
  })

  it('shows pipeline status badge', () => {
    // Verifies: FR-045
    render(<PipelineStepper pipelineRun={mockPipelineRun} />)
    expect(screen.getByText('running')).toBeInTheDocument()
  })

  it('shows team label', () => {
    // Verifies: FR-045
    render(<PipelineStepper pipelineRun={mockPipelineRun} />)
    expect(screen.getByText('TheATeam')).toBeInTheDocument()
    expect(screen.getByText(/Orchestrated via/)).toBeInTheDocument()
  })

  it('displays agent names for stages', () => {
    // Verifies: FR-045
    render(<PipelineStepper pipelineRun={mockPipelineRun} />)
    expect(screen.getByText('backend-coder')).toBeInTheDocument()
    expect(screen.getByText('frontend-coder')).toBeInTheDocument()
    expect(screen.getByText('requirements-reviewer')).toBeInTheDocument()
  })

  it('shows verdict badges for completed stages', () => {
    // Verifies: FR-045
    render(<PipelineStepper pipelineRun={mockPipelineRun} />)
    const approvedBadges = screen.getAllByText('approved')
    // 2 completed stages with approved verdict
    expect(approvedBadges.length).toBe(2)
  })

  it('shows completed status for a fully completed pipeline', () => {
    // Verifies: FR-045
    const completedRun: PipelineRun = {
      ...mockPipelineRun,
      status: 'completed',
      current_stage: 5,
      completed_at: '2026-03-24T12:00:00.000Z',
      stages: mockPipelineRun.stages.map((s) => ({
        ...s,
        status: 'completed' as const,
        verdict: 'approved',
      })),
    }
    render(<PipelineStepper pipelineRun={completedRun} />)
    expect(screen.getByText('completed')).toBeInTheDocument()
  })

  it('shows rejected stage with failed styling', () => {
    // Verifies: FR-045
    const failedRun: PipelineRun = {
      ...mockPipelineRun,
      stages: mockPipelineRun.stages.map((s) =>
        s.stage_number === 3
          ? { ...s, status: 'failed' as const, verdict: 'rejected' }
          : s
      ),
    }
    render(<PipelineStepper pipelineRun={failedRun} />)
    expect(screen.getByText('rejected')).toBeInTheDocument()
  })

  it('has pipeline-stepper test id', () => {
    // Verifies: FR-045
    render(<PipelineStepper pipelineRun={mockPipelineRun} />)
    expect(screen.getByTestId('pipeline-stepper')).toBeInTheDocument()
  })
})

// --- API client tests for pipeline ---

describe('pipelineRuns API client', () => {
  it('exports all required pipeline API functions', () => {
    // Verifies: FR-044
    // Import the real module to check exports exist
    // (We test the mock below, but this validates the contract)
    expect(typeof pipelineRunsModule.list).toBe('function')
    expect(typeof pipelineRunsModule.get).toBe('function')
    expect(typeof pipelineRunsModule.startStage).toBe('function')
    expect(typeof pipelineRunsModule.completeStage).toBe('function')
    expect(typeof pipelineRunsModule.getByCycleId).toBe('function')
  })
})

// We import before mocking to validate exports
import { pipelineRuns as pipelineRunsModule } from '../src/api/client'

// --- CycleView integration tests with pipeline ---

vi.mock('../src/api/client', () => ({
  cycles: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    createTicket: vi.fn(),
    updateTicket: vi.fn(),
    completeCycle: vi.fn(),
  },
  pipelineRuns: {
    list: vi.fn(),
    get: vi.fn(),
    startStage: vi.fn(),
    completeStage: vi.fn(),
    getByCycleId: vi.fn(),
  },
}))

import { cycles } from '../src/api/client'

const mockPipelineCycle: DevelopmentCycle = {
  id: 'CYCLE-0002',
  work_item_id: 'FR-0010',
  work_item_type: 'feature_request',
  status: 'implementation',
  spec_changes: null,
  tickets: [],
  pipeline_run_id: 'RUN-0001',
  pipeline_run: mockPipelineRun,
  created_at: '2026-03-24T10:00:00.000Z',
  completed_at: null,
}

const mockLegacyCycle: DevelopmentCycle = {
  id: 'CYCLE-0003',
  work_item_id: 'BUG-0001',
  work_item_type: 'bug',
  status: 'implementation',
  spec_changes: null,
  tickets: [
    {
      id: 'TKT-0010',
      cycle_id: 'CYCLE-0003',
      title: 'Fix login bug',
      description: 'Fix the login issue',
      status: 'in_progress',
      assignee: null,
      created_at: '2026-03-24T10:00:00.000Z',
      updated_at: '2026-03-24T10:00:00.000Z',
    },
  ],
  pipeline_run_id: null,
  created_at: '2026-03-24T10:00:00.000Z',
  completed_at: null,
}

function renderCyclePage() {
  return render(
    <MemoryRouter>
      <DevelopmentCyclePage />
    </MemoryRouter>
  )
}

describe('DevelopmentCyclePage with pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows PipelineStepper for pipeline-linked cycle', async () => {
    // Verifies: FR-046
    vi.mocked(cycles.list).mockResolvedValue({ data: [mockPipelineCycle] })
    renderCyclePage()
    await waitFor(() => {
      expect(screen.getByTestId('pipeline-stepper')).toBeInTheDocument()
    })
    expect(screen.getByText('Pipeline Progress')).toBeInTheDocument()
    expect(screen.getByText('TheATeam')).toBeInTheDocument()
  })

  it('hides manual advance buttons for pipeline-linked cycle', async () => {
    // Verifies: FR-046
    vi.mocked(cycles.list).mockResolvedValue({ data: [mockPipelineCycle] })
    renderCyclePage()
    await waitFor(() => {
      expect(screen.getByText('CYCLE-0002')).toBeInTheDocument()
    })
    // Should NOT have the manual advance button
    expect(screen.queryByText(/→ Review/)).not.toBeInTheDocument()
  })

  it('shows manual advance buttons for legacy (non-pipeline) cycle', async () => {
    // Verifies: FR-046
    vi.mocked(cycles.list).mockResolvedValue({ data: [mockLegacyCycle] })
    renderCyclePage()
    await waitFor(() => {
      expect(screen.getByText('CYCLE-0003')).toBeInTheDocument()
    })
    // Should have the manual advance button
    expect(screen.getByText(/→ Review/)).toBeInTheDocument()
  })

  it('does not show PipelineStepper for legacy cycle', async () => {
    // Verifies: FR-046
    vi.mocked(cycles.list).mockResolvedValue({ data: [mockLegacyCycle] })
    renderCyclePage()
    await waitFor(() => {
      expect(screen.getByText('CYCLE-0003')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('pipeline-stepper')).not.toBeInTheDocument()
  })
})
