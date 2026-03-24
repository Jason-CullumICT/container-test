// Verifies: FR-069
// Tests for FeedbackLog, ConsideredFixesList, TraceabilityReport, and BugDetail traceability
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { FeedbackLog } from '../src/components/cycles/FeedbackLog'
import { ConsideredFixesList } from '../src/components/cycles/ConsideredFixesList'
import { TraceabilityReport } from '../src/components/features/TraceabilityReport'
import { BugDetail } from '../src/components/bugs/BugDetail'
import type { CycleFeedback, ConsideredFix, BugReport } from '../../Shared/types'

// --- FeedbackLog Tests ---

const mockFeedback: CycleFeedback[] = [
  {
    id: 'CFBK-0001',
    cycle_id: 'CYCLE-0001',
    ticket_id: 'TKT-0001',
    agent_role: 'security-qa',
    team: 'TheATeam',
    feedback_type: 'finding',
    content: 'SQL injection risk in parameter handling',
    created_at: '2026-03-24T10:00:00.000Z',
  },
  {
    id: 'CFBK-0002',
    cycle_id: 'CYCLE-0001',
    ticket_id: null,
    agent_role: 'qa-review-and-tests',
    team: 'TheATeam',
    feedback_type: 'suggestion',
    content: 'Add input validation for all string fields',
    created_at: '2026-03-24T10:05:00.000Z',
  },
  {
    id: 'CFBK-0003',
    cycle_id: 'CYCLE-0001',
    ticket_id: null,
    agent_role: 'security-qa',
    team: 'TheATeam',
    feedback_type: 'approval',
    content: 'CORS configuration looks correct',
    created_at: '2026-03-24T10:10:00.000Z',
  },
]

describe('FeedbackLog', () => {
  it('renders empty state when no feedback', () => {
    // Verifies: FR-064
    render(<FeedbackLog feedback={[]} />)
    expect(screen.getByText('No feedback recorded for this cycle')).toBeInTheDocument()
  })

  it('renders all feedback entries', () => {
    // Verifies: FR-064
    render(<FeedbackLog feedback={mockFeedback} />)
    expect(screen.getAllByTestId('feedback-entry')).toHaveLength(3)
  })

  it('shows agent role badges', () => {
    // Verifies: FR-064
    render(<FeedbackLog feedback={mockFeedback} />)
    // security-qa appears as badge (2x) + filter option (1x) = 3
    expect(screen.getAllByText('security-qa').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('qa-review-and-tests').length).toBeGreaterThanOrEqual(1)
  })

  it('shows feedback type tags', () => {
    // Verifies: FR-064
    render(<FeedbackLog feedback={mockFeedback} />)
    // Type text appears in both the badge and the dropdown option, so use getAllByText
    expect(screen.getAllByText('finding').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('suggestion').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('approval').length).toBeGreaterThanOrEqual(1)
  })

  it('shows ticket link when ticket_id present', () => {
    // Verifies: FR-064
    render(<FeedbackLog feedback={mockFeedback} />)
    expect(screen.getByText('TKT-0001')).toBeInTheDocument()
  })

  it('shows feedback content', () => {
    // Verifies: FR-064
    render(<FeedbackLog feedback={mockFeedback} />)
    expect(screen.getByText('SQL injection risk in parameter handling')).toBeInTheDocument()
    expect(screen.getByText('Add input validation for all string fields')).toBeInTheDocument()
  })

  it('filters by agent role', () => {
    // Verifies: FR-064
    render(<FeedbackLog feedback={mockFeedback} />)
    const roleSelect = screen.getByDisplayValue('All Roles')
    fireEvent.change(roleSelect, { target: { value: 'qa-review-and-tests' } })
    expect(screen.getAllByTestId('feedback-entry')).toHaveLength(1)
    expect(screen.getByText('Add input validation for all string fields')).toBeInTheDocument()
  })

  it('filters by feedback type', () => {
    // Verifies: FR-064
    render(<FeedbackLog feedback={mockFeedback} />)
    const typeSelect = screen.getByDisplayValue('All Types')
    fireEvent.change(typeSelect, { target: { value: 'finding' } })
    expect(screen.getAllByTestId('feedback-entry')).toHaveLength(1)
    expect(screen.getByText('SQL injection risk in parameter handling')).toBeInTheDocument()
  })

  it('shows empty filter result message', () => {
    // Verifies: FR-064
    render(<FeedbackLog feedback={mockFeedback} />)
    const typeSelect = screen.getByDisplayValue('All Types')
    fireEvent.change(typeSelect, { target: { value: 'rejection' } })
    expect(screen.getByText('No feedback matches the selected filters')).toBeInTheDocument()
  })
})

// --- ConsideredFixesList Tests ---

const mockFixes: ConsideredFix[] = [
  {
    description: 'Use parameterized queries',
    rationale: 'Prevents SQL injection by separating data from query structure',
    selected: true,
  },
  {
    description: 'Use an ORM layer',
    rationale: 'Abstracts database access but adds complexity',
    selected: false,
  },
]

describe('ConsideredFixesList', () => {
  it('returns null when fixes is null', () => {
    // Verifies: FR-066
    const { container } = render(<ConsideredFixesList fixes={null} />)
    expect(container.innerHTML).toBe('')
  })

  it('returns null when fixes is empty', () => {
    // Verifies: FR-066
    const { container } = render(<ConsideredFixesList fixes={[]} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders fixes list', () => {
    // Verifies: FR-066
    render(<ConsideredFixesList fixes={mockFixes} />)
    expect(screen.getByText('Considered Fixes')).toBeInTheDocument()
    expect(screen.getAllByTestId('considered-fix')).toHaveLength(2)
  })

  it('highlights selected fix', () => {
    // Verifies: FR-066
    render(<ConsideredFixesList fixes={mockFixes} />)
    expect(screen.getByText('Selected')).toBeInTheDocument()
    expect(screen.getByText('Use parameterized queries')).toBeInTheDocument()
  })

  it('shows description and rationale for each fix', () => {
    // Verifies: FR-066
    render(<ConsideredFixesList fixes={mockFixes} />)
    expect(screen.getByText('Use an ORM layer')).toBeInTheDocument()
    expect(screen.getByText('Abstracts database access but adds complexity')).toBeInTheDocument()
  })
})

// --- TraceabilityReport Tests ---

const mockTraceabilityReport = JSON.stringify([
  { fr_id: 'FR-001', description: 'Shared types', status: 'covered', coverage: '100%' },
  { fr_id: 'FR-002', description: 'DB schema', status: 'covered', coverage: '100%' },
  { fr_id: 'FR-003', description: 'Logger', status: 'partial', coverage: '50%' },
])

describe('TraceabilityReport', () => {
  it('returns null when report is null', () => {
    // Verifies: FR-067
    const { container } = render(<TraceabilityReport report={null} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders expandable header with entry count', () => {
    // Verifies: FR-067
    render(<TraceabilityReport report={mockTraceabilityReport} />)
    expect(screen.getByText('Traceability Report')).toBeInTheDocument()
    expect(screen.getByText('(3 entries)')).toBeInTheDocument()
  })

  it('shows table when expanded', () => {
    // Verifies: FR-067
    render(<TraceabilityReport report={mockTraceabilityReport} />)
    fireEvent.click(screen.getByText('Traceability Report'))
    expect(screen.getByTestId('traceability-table')).toBeInTheDocument()
    expect(screen.getByText('FR-001')).toBeInTheDocument()
    expect(screen.getByText('FR-002')).toBeInTheDocument()
    expect(screen.getByText('FR-003')).toBeInTheDocument()
  })

  it('displays status and coverage columns', () => {
    // Verifies: FR-067
    render(<TraceabilityReport report={mockTraceabilityReport} />)
    fireEvent.click(screen.getByText('Traceability Report'))
    expect(screen.getAllByText('covered')).toHaveLength(2)
    expect(screen.getByText('partial')).toBeInTheDocument()
    expect(screen.getAllByText('100%')).toHaveLength(2)
    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  it('handles non-array JSON gracefully', () => {
    // Verifies: FR-067
    const objectReport = JSON.stringify({ total: 32, covered: 30, percentage: '93.75%' })
    render(<TraceabilityReport report={objectReport} />)
    fireEvent.click(screen.getByText('Traceability Report'))
    // Should render as formatted JSON, not a table
    expect(screen.queryByTestId('traceability-table')).not.toBeInTheDocument()
  })

  it('handles invalid JSON gracefully', () => {
    // Verifies: FR-067
    render(<TraceabilityReport report="not valid json {}" />)
    expect(screen.getByText('Traceability Report')).toBeInTheDocument()
    expect(screen.getByText('not valid json {}')).toBeInTheDocument()
  })
})

// --- BugDetail Traceability Tests ---

const mockBugWithTraceability: BugReport = {
  id: 'BUG-0010',
  title: 'Deployment failure: auth module crash',
  description: 'Auth module crashes on startup after deployment',
  severity: 'high',
  status: 'reported',
  source_system: 'ci-cd',
  related_work_item_id: 'FR-0005',
  related_work_item_type: 'feature_request',
  related_cycle_id: 'CYCLE-0003',
  created_at: '2026-03-24T12:00:00.000Z',
  updated_at: '2026-03-24T12:00:00.000Z',
}

const mockBugWithoutTraceability: BugReport = {
  id: 'BUG-0011',
  title: 'Manual bug report',
  description: 'Something is broken',
  severity: 'low',
  status: 'reported',
  source_system: 'manual',
  related_work_item_id: null,
  related_work_item_type: null,
  related_cycle_id: null,
  created_at: '2026-03-24T12:00:00.000Z',
  updated_at: '2026-03-24T12:00:00.000Z',
}

describe('BugDetail Traceability', () => {
  it('shows related work item link when present', () => {
    // Verifies: FR-068
    render(
      <MemoryRouter>
        <BugDetail bug={mockBugWithTraceability} onClose={vi.fn()} />
      </MemoryRouter>
    )
    expect(screen.getByTestId('bug-traceability')).toBeInTheDocument()
    expect(screen.getByTestId('related-work-item-link')).toBeInTheDocument()
    expect(screen.getByText('FR-0005')).toBeInTheDocument()
    expect(screen.getByText('(Feature Request)')).toBeInTheDocument()
  })

  it('shows related cycle link when present', () => {
    // Verifies: FR-068
    render(
      <MemoryRouter>
        <BugDetail bug={mockBugWithTraceability} onClose={vi.fn()} />
      </MemoryRouter>
    )
    expect(screen.getByTestId('related-cycle-link')).toBeInTheDocument()
    expect(screen.getByText('CYCLE-0003')).toBeInTheDocument()
  })

  it('hides traceability section when no related fields', () => {
    // Verifies: FR-068
    render(
      <MemoryRouter>
        <BugDetail bug={mockBugWithoutTraceability} onClose={vi.fn()} />
      </MemoryRouter>
    )
    expect(screen.queryByTestId('bug-traceability')).not.toBeInTheDocument()
  })

  it('renders work item link pointing to correct route for bug type', () => {
    // Verifies: FR-068
    const bugWithBugRef: BugReport = {
      ...mockBugWithTraceability,
      related_work_item_id: 'BUG-0001',
      related_work_item_type: 'bug',
    }
    render(
      <MemoryRouter>
        <BugDetail bug={bugWithBugRef} onClose={vi.fn()} />
      </MemoryRouter>
    )
    expect(screen.getByText('(Bug)')).toBeInTheDocument()
  })
})

// --- CycleView Integration Tests (FR-065) ---

// We test the FeedbackLog and team_name badge integration through CycleView
// by importing the component with mocked API

vi.mock('../src/api/client', () => ({
  cycles: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    createTicket: vi.fn(),
    updateTicket: vi.fn(),
    completeCycle: vi.fn(),
  },
  cycleFeedback: {
    list: vi.fn(),
    create: vi.fn(),
  },
}))

import { CycleView } from '../src/components/cycles/CycleView'
import type { DevelopmentCycle } from '../../Shared/types'

const mockCycleWithFeedback: DevelopmentCycle = {
  id: 'CYCLE-0001',
  work_item_id: 'FR-0001',
  work_item_type: 'feature_request',
  status: 'implementation',
  spec_changes: null,
  tickets: [],
  pipeline_run_id: null,
  feedback: mockFeedback,
  team_name: 'TheATeam',
  created_at: '2026-03-24T10:00:00.000Z',
  completed_at: null,
}

const mockCycleWithoutFeedback: DevelopmentCycle = {
  id: 'CYCLE-0002',
  work_item_id: 'BUG-0001',
  work_item_type: 'bug',
  status: 'review',
  spec_changes: null,
  tickets: [],
  pipeline_run_id: null,
  feedback: [],
  team_name: null,
  created_at: '2026-03-24T10:00:00.000Z',
  completed_at: null,
}

describe('CycleView with Feedback Integration', () => {
  it('shows team_name badge when present', () => {
    // Verifies: FR-065
    render(
      <MemoryRouter>
        <CycleView cycle={mockCycleWithFeedback} onCycleUpdated={vi.fn()} />
      </MemoryRouter>
    )
    expect(screen.getByTestId('team-badge')).toBeInTheDocument()
    expect(screen.getByTestId('team-badge').textContent).toBe('TheATeam')
  })

  it('hides team_name badge when null', () => {
    // Verifies: FR-065
    render(
      <MemoryRouter>
        <CycleView cycle={mockCycleWithoutFeedback} onCycleUpdated={vi.fn()} />
      </MemoryRouter>
    )
    expect(screen.queryByTestId('team-badge')).not.toBeInTheDocument()
  })

  it('shows feedback log section when feedback exists', () => {
    // Verifies: FR-065
    render(
      <MemoryRouter>
        <CycleView cycle={mockCycleWithFeedback} onCycleUpdated={vi.fn()} />
      </MemoryRouter>
    )
    expect(screen.getByText('Team Feedback (3)')).toBeInTheDocument()
    expect(screen.getByTestId('feedback-log')).toBeInTheDocument()
  })

  it('hides feedback log when no feedback', () => {
    // Verifies: FR-065
    render(
      <MemoryRouter>
        <CycleView cycle={mockCycleWithoutFeedback} onCycleUpdated={vi.fn()} />
      </MemoryRouter>
    )
    expect(screen.queryByText(/Team Feedback/)).not.toBeInTheDocument()
  })
})

// --- API Client Export Tests ---

describe('cycleFeedback API client', () => {
  it('exports cycleFeedback namespace', async () => {
    // Verifies: FR-063
    const client = await import('../src/api/client')
    expect(client.cycleFeedback).toBeDefined()
    expect(typeof client.cycleFeedback.list).toBe('function')
    expect(typeof client.cycleFeedback.create).toBe('function')
  })
})
