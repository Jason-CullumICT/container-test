// Verifies: FR-027
// Verifies: FR-032
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DevelopmentCyclePage } from '../src/pages/DevelopmentCyclePage'
import type { DevelopmentCycle } from '../../Shared/types'

vi.mock('../src/api/client', () => ({
  cycles: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    createTicket: vi.fn(),
    updateTicket: vi.fn(),
    completeCycle: vi.fn(),
  },
}))

import { cycles } from '../src/api/client'

const mockActiveCycle: DevelopmentCycle = {
  id: 'CYCLE-0001',
  work_item_id: 'FR-0001',
  work_item_type: 'feature_request',
  status: 'implementation',
  spec_changes: 'Updated auth module spec',
  tickets: [
    {
      id: 'TKT-0001',
      cycle_id: 'CYCLE-0001',
      title: 'Implement auth module',
      description: 'Build the authentication module',
      status: 'in_progress',
      assignee: 'dev-1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'TKT-0002',
      cycle_id: 'CYCLE-0001',
      title: 'Write tests',
      description: 'Write unit and integration tests',
      status: 'pending',
      assignee: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
  pipeline_run_id: null,
  created_at: new Date().toISOString(),
  completed_at: null,
}

function renderPage() {
  return render(
    <MemoryRouter>
      <DevelopmentCyclePage />
    </MemoryRouter>
  )
}

describe('DevelopmentCyclePage', () => {
  beforeEach(() => {
    vi.mocked(cycles.list).mockResolvedValue({ data: [mockActiveCycle] })
  })

  it('renders the page heading', () => {
    // Verifies: FR-027
    renderPage()
    expect(screen.getByText('Development Cycle')).toBeInTheDocument()
  })

  it('shows loading spinner initially', () => {
    // Verifies: FR-027
    renderPage()
    const spinner = document.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()
  })

  it('displays active cycle after loading', async () => {
    // Verifies: FR-027
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('CYCLE-0001')).toBeInTheDocument()
    })
  })

  it('displays the phase stepper', async () => {
    // Verifies: FR-027
    renderPage()
    await waitFor(() => {
      expect(screen.getAllByText('Implementation').length).toBeGreaterThan(0)
    })
    // All phases should be visible (use getAllByText since text may appear in multiple places)
    expect(screen.getAllByText('Spec Changes').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Ticket Breakdown').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Review').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Smoke Test').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Complete').length).toBeGreaterThan(0)
  })

  it('shows tickets in the board', async () => {
    // Verifies: FR-027
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Implement auth module')).toBeInTheDocument()
    })
    expect(screen.getByText('Write tests')).toBeInTheDocument()
  })

  it('shows ticket assignee', async () => {
    // Verifies: FR-027
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('dev-1')).toBeInTheDocument()
    })
  })

  it('shows empty state with start button when no cycles', async () => {
    // Verifies: FR-027
    vi.mocked(cycles.list).mockResolvedValue({ data: [] })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('No active development cycle')).toBeInTheDocument()
    })
    expect(screen.getAllByText(/Start New Cycle/).length).toBeGreaterThan(0)
  })

  it('calls cycles.create when start new cycle is clicked', async () => {
    // Verifies: FR-027
    vi.mocked(cycles.list).mockResolvedValue({ data: [] })
    vi.mocked(cycles.create).mockResolvedValue(mockActiveCycle)
    vi.mocked(cycles.list).mockResolvedValueOnce({ data: [] }).mockResolvedValue({ data: [mockActiveCycle] })

    renderPage()
    await waitFor(() => {
      expect(screen.getAllByText(/Start New Cycle/).length).toBeGreaterThan(0)
    })

    const startBtns = screen.getAllByText(/Start New Cycle/)
    fireEvent.click(startBtns[0])

    await waitFor(() => {
      expect(cycles.create).toHaveBeenCalled()
    })
  })

  it('shows error state when fetch fails', async () => {
    // Verifies: FR-027
    vi.mocked(cycles.list).mockRejectedValue(new Error('Server error'))
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Failed to load cycles/)).toBeInTheDocument()
    })
  })

  it('displays spec changes when present', async () => {
    // Verifies: FR-027
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Updated auth module spec')).toBeInTheDocument()
    })
  })

  it('advances ticket status when advance button clicked', async () => {
    // Verifies: FR-027
    vi.mocked(cycles.updateTicket).mockResolvedValue({
      ...mockActiveCycle.tickets[0],
      status: 'code_review',
    })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Implement auth module')).toBeInTheDocument()
    })

    // Find advance button for in_progress ticket
    const advanceBtn = screen.getByText('→ code review')
    fireEvent.click(advanceBtn)

    await waitFor(() => {
      expect(cycles.updateTicket).toHaveBeenCalledWith(
        'CYCLE-0001',
        'TKT-0001',
        { status: 'code_review' }
      )
    })
  })
})
