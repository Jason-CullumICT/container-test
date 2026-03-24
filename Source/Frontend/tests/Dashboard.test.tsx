// Verifies: FR-024
// Verifies: FR-032
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DashboardPage } from '../src/pages/DashboardPage'
import type { DashboardSummary, ActivityItem } from '../../Shared/types'

// Mock the API client
vi.mock('../src/api/client', () => ({
  dashboard: {
    getSummary: vi.fn(),
    getActivity: vi.fn(),
  },
  featureRequests: {
    list: vi.fn(),
  },
  bugs: {
    list: vi.fn(),
  },
}))

import { dashboard } from '../src/api/client'

const mockSummary: DashboardSummary = {
  feature_requests: {
    potential: 3,
    voting: 1,
    approved: 2,
    denied: 1,
    in_development: 1,
    completed: 5,
  },
  bugs: {
    by_status: {
      reported: 2,
      triaged: 1,
      in_development: 0,
      resolved: 3,
      closed: 1,
    },
    by_severity: {
      low: 2,
      medium: 2,
      high: 1,
      critical: 1,
    },
  },
  active_cycle: {
    id: 'CYCLE-0001',
    status: 'implementation',
    work_item_id: 'FR-0001',
    work_item_type: 'feature_request',
    pipeline_run_id: 'RUN-0001',
    pipeline_stage: 3,
    pipeline_status: 'running',
  },
}

const mockActivities: ActivityItem[] = [
  {
    type: 'feature_request',
    entity_id: 'FR-0001',
    description: 'Feature request created: Dark mode',
    timestamp: new Date().toISOString(),
  },
  {
    type: 'bug',
    entity_id: 'BUG-0001',
    description: 'Bug reported: Login fails on mobile',
    timestamp: new Date().toISOString(),
  },
]

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>
  )
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.mocked(dashboard.getSummary).mockResolvedValue(mockSummary)
    vi.mocked(dashboard.getActivity).mockResolvedValue({ data: mockActivities })
  })

  it('renders the dashboard heading', async () => {
    // Verifies: FR-024
    renderDashboard()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('shows loading state initially', () => {
    // Verifies: FR-024
    renderDashboard()
    // Loading spinner should appear
    const spinner = document.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()
  })

  it('displays summary widgets after loading', async () => {
    // Verifies: FR-024
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('Feature Requests')).toBeInTheDocument()
    })
    expect(screen.getByText('Active Bugs')).toBeInTheDocument()
    expect(screen.getByText('Active Cycle')).toBeInTheDocument()
  })

  it('displays active cycle info', async () => {
    // Verifies: FR-024
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('CYCLE-0001')).toBeInTheDocument()
    })
    expect(screen.getAllByText('Implementation').length).toBeGreaterThan(0)
  })

  it('displays activity feed after loading', async () => {
    // Verifies: FR-024
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('Recent Activity')).toBeInTheDocument()
    })
    expect(screen.getByText('Feature request created: Dark mode')).toBeInTheDocument()
    expect(screen.getByText('Bug reported: Login fails on mobile')).toBeInTheDocument()
  })

  it('shows error state when summary fetch fails', async () => {
    // Verifies: FR-024
    vi.mocked(dashboard.getSummary).mockRejectedValue(new Error('Network error'))
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText(/Failed to load dashboard/)).toBeInTheDocument()
    })
  })

  it('shows no active cycle message when cycle is null', async () => {
    // Verifies: FR-024
    vi.mocked(dashboard.getSummary).mockResolvedValue({
      ...mockSummary,
      active_cycle: null,
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('No active cycle')).toBeInTheDocument()
    })
  })

  it('displays pipeline stage info in active cycle widget', async () => {
    // Verifies: FR-047
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('Pipeline Stage 3/5')).toBeInTheDocument()
    })
    expect(screen.getByText('(running)')).toBeInTheDocument()
  })

  it('does not display pipeline info when no pipeline linked', async () => {
    // Verifies: FR-047
    vi.mocked(dashboard.getSummary).mockResolvedValue({
      ...mockSummary,
      active_cycle: {
        id: 'CYCLE-0002',
        status: 'review',
        work_item_id: 'BUG-0001',
        work_item_type: 'bug',
        pipeline_run_id: null,
        pipeline_stage: null,
        pipeline_status: null,
      },
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('CYCLE-0002')).toBeInTheDocument()
    })
    expect(screen.queryByText(/Pipeline Stage/)).not.toBeInTheDocument()
  })
})
