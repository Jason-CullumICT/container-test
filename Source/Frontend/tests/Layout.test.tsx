// Verifies: FR-022
// Verifies: FR-023
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { Layout } from '../src/components/layout/Layout'
import { Sidebar } from '../src/components/layout/Sidebar'
import { Header } from '../src/components/layout/Header'
import { ApiError } from '../src/api/client'

vi.mock('../src/api/client', () => ({
  dashboard: {
    getSummary: vi.fn(),
  },
  featureRequests: {
    list: vi.fn(),
  },
  bugs: {
    list: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.name = 'ApiError'
      this.status = status
    }
  },
}))

import { dashboard, featureRequests } from '../src/api/client'

const mockSummary = {
  feature_requests: {
    potential: 2,
    voting: 3,
    approved: 1,
    denied: 0,
    in_development: 1,
    completed: 5,
  },
  bugs: {
    by_status: {
      reported: 4,
      triaged: 2,
      in_development: 1,
      resolved: 3,
      closed: 0,
    },
    by_severity: { low: 2, medium: 2, high: 2, critical: 2 },
  },
  active_cycle: null,
}

function renderLayout(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<div>Dashboard Content</div>} />
          <Route path="/feature-requests" element={<div>Feature Requests Content</div>} />
          <Route path="/bugs" element={<div>Bug Reports Content</div>} />
          <Route path="/cycle" element={<div>Cycle Content</div>} />
          <Route path="/approvals" element={<div>Approvals Content</div>} />
          <Route path="/features" element={<div>Features Content</div>} />
          <Route path="/learnings" element={<div>Learnings Content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe('Layout and Sidebar (FR-022)', () => {
  beforeEach(() => {
    vi.mocked(dashboard.getSummary).mockResolvedValue(mockSummary)
    vi.mocked(featureRequests.list).mockResolvedValue({ data: [] })
  })

  it('renders sidebar navigation', () => {
    // Verifies: FR-022
    renderLayout()
    expect(screen.getByText('Dev Workflow')).toBeInTheDocument()
  })

  it('renders all navigation links', () => {
    // Verifies: FR-022
    // Verifies: FR-076
    renderLayout()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Feature Requests')).toBeInTheDocument()
    expect(screen.getByText('Bug Reports')).toBeInTheDocument()
    expect(screen.getByText('Orchestrator')).toBeInTheDocument()
    expect(screen.getByText('Feature Browser')).toBeInTheDocument()
    expect(screen.getByText('Learnings')).toBeInTheDocument()
  })

  it('renders main content outlet', () => {
    // Verifies: FR-022
    renderLayout('/')
    expect(screen.getByText('Dashboard Content')).toBeInTheDocument()
  })

  it('fetches badge counts on mount', async () => {
    // Verifies: FR-022
    renderLayout()
    await waitFor(() => {
      expect(dashboard.getSummary).toHaveBeenCalled()
    })
  })

  it('shows active bug count badge when bugs exist', async () => {
    // Verifies: FR-022
    renderLayout()
    await waitFor(() => {
      // active bugs = reported(4) + triaged(2) + in_development(1) = 7
      expect(screen.getByText('7')).toBeInTheDocument()
    })
  })

  it('handles badge count fetch failure gracefully', async () => {
    // Verifies: FR-022
    vi.mocked(dashboard.getSummary).mockRejectedValue(new Error('Network error'))
    // Should render without crashing
    renderLayout()
    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
    })
  })
})

describe('Sidebar component', () => {
  it('renders badges for active bugs and pending FRs', () => {
    // Verifies: FR-022
    render(
      <MemoryRouter>
        <Sidebar activeBugs={3} pendingFRs={8} />
      </MemoryRouter>
    )
    // Badges should appear
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
  })

  it('does not show badges when counts are 0', () => {
    // Verifies: FR-022
    render(
      <MemoryRouter>
        <Sidebar activeBugs={0} pendingFRs={0} />
      </MemoryRouter>
    )
    // No badge numbers should appear
    const badges = document.querySelectorAll('.bg-red-500')
    expect(badges.length).toBe(0)
  })
})

describe('Header component', () => {
  it('renders title and subtitle', () => {
    // Verifies: FR-022
    render(<Header title="Test Title" subtitle="Test Subtitle" />)
    expect(screen.getByText('Test Title')).toBeInTheDocument()
    expect(screen.getByText('Test Subtitle')).toBeInTheDocument()
  })

  it('renders action buttons', () => {
    // Verifies: FR-022
    render(
      <Header
        title="Test"
        actions={<button>Action Button</button>}
      />
    )
    expect(screen.getByText('Action Button')).toBeInTheDocument()
  })
})

describe('API Client (FR-023)', () => {
  it('ApiError has correct properties', () => {
    // Verifies: FR-023
    const err = new ApiError('Not found', 404)
    expect(err.message).toBe('Not found')
    expect(err.status).toBe(404)
    expect(err.name).toBe('ApiError')
  })
})
