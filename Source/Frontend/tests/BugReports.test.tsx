// Verifies: FR-026
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { BugReportsPage } from '../src/pages/BugReportsPage'
import type { BugReport } from '../../Shared/types'

vi.mock('../src/api/client', () => ({
  bugs: {
    list: vi.fn(),
    create: vi.fn(),
  },
}))

import { bugs } from '../src/api/client'

const mockBugs: BugReport[] = [
  {
    id: 'BUG-0001',
    title: 'Login fails on mobile',
    description: 'Users cannot log in on mobile browsers',
    severity: 'high',
    status: 'reported',
    source_system: 'production',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'BUG-0002',
    title: 'CSS layout broken',
    description: 'The sidebar overlaps content on small screens',
    severity: 'medium',
    status: 'triaged',
    source_system: 'staging',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'BUG-0003',
    title: 'Database connection pool exhausted',
    description: 'Under load, DB connections are exhausted',
    severity: 'critical',
    status: 'in_development',
    source_system: 'production',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
]

function renderPage() {
  return render(
    <MemoryRouter>
      <BugReportsPage />
    </MemoryRouter>
  )
}

describe('BugReportsPage', () => {
  beforeEach(() => {
    vi.mocked(bugs.list).mockResolvedValue({ data: mockBugs })
  })

  it('renders Bug Reports heading', () => {
    // Verifies: FR-026
    renderPage()
    expect(screen.getByText('Bug Reports')).toBeInTheDocument()
  })

  it('shows loading spinner initially', () => {
    // Verifies: FR-026
    renderPage()
    const spinner = document.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()
  })

  it('displays bug list after loading', async () => {
    // Verifies: FR-026
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Login fails on mobile')).toBeInTheDocument()
    })
    expect(screen.getByText('CSS layout broken')).toBeInTheDocument()
    expect(screen.getByText('Database connection pool exhausted')).toBeInTheDocument()
  })

  it('shows severity badges in list', async () => {
    // Verifies: FR-026
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('high')).toBeInTheDocument()
    })
    expect(screen.getByText('medium')).toBeInTheDocument()
    expect(screen.getByText('critical')).toBeInTheDocument()
  })

  it('renders Report Bug button', () => {
    // Verifies: FR-026
    renderPage()
    expect(screen.getByText('+ Report Bug')).toBeInTheDocument()
  })

  it('shows create form when button is clicked', async () => {
    // Verifies: FR-026
    renderPage()
    fireEvent.click(screen.getByText('+ Report Bug'))
    expect(screen.getByText('Report a Bug')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Brief description of the bug')).toBeInTheDocument()
  })

  it('shows severity filter dropdown', () => {
    // Verifies: FR-026
    renderPage()
    expect(screen.getByDisplayValue('All Severities')).toBeInTheDocument()
  })

  it('shows status filter dropdown', () => {
    // Verifies: FR-026
    renderPage()
    expect(screen.getByDisplayValue('All Statuses')).toBeInTheDocument()
  })

  it('applies severity filter when selected', async () => {
    // Verifies: FR-026
    renderPage()
    const severitySelect = screen.getByDisplayValue('All Severities')
    fireEvent.change(severitySelect, { target: { value: 'critical' } })

    await waitFor(() => {
      expect(bugs.list).toHaveBeenCalledWith({
        status: undefined,
        severity: 'critical',
      })
    })
  })

  it('shows bug detail when a bug is clicked', async () => {
    // Verifies: FR-026
    renderPage()
    await waitFor(() => screen.getByText('Login fails on mobile'))

    fireEvent.click(screen.getByText('Login fails on mobile'))

    await waitFor(() => {
      expect(screen.getByText('high severity')).toBeInTheDocument()
    })
  })

  it('creates bug report successfully', async () => {
    // Verifies: FR-026
    const newBug: BugReport = {
      id: 'BUG-0010',
      title: 'New bug',
      description: 'Something broke',
      severity: 'medium',
      status: 'reported',
      source_system: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    vi.mocked(bugs.create).mockResolvedValue(newBug)

    renderPage()
    fireEvent.click(screen.getByText('+ Report Bug'))

    const titleInput = screen.getByPlaceholderText('Brief description of the bug')
    const descInput = screen.getByPlaceholderText('Steps to reproduce, expected vs actual behavior')

    fireEvent.change(titleInput, { target: { value: 'New bug' } })
    fireEvent.change(descInput, { target: { value: 'Something broke' } })

    fireEvent.click(screen.getByText('Report Bug'))

    await waitFor(() => {
      expect(bugs.create).toHaveBeenCalledWith({
        title: 'New bug',
        description: 'Something broke',
        severity: 'medium',
        source_system: undefined,
      })
    })
  })

  it('shows error state when fetch fails', async () => {
    // Verifies: FR-026
    vi.mocked(bugs.list).mockRejectedValue(new Error('Server error'))
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Failed to load bug reports/)).toBeInTheDocument()
    })
  })

  it('shows empty state when no bugs', async () => {
    // Verifies: FR-026
    vi.mocked(bugs.list).mockResolvedValue({ data: [] })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('No bug reports found')).toBeInTheDocument()
    })
  })
})
