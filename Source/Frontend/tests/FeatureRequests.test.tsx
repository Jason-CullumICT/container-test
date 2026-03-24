// Verifies: FR-025
// Verifies: FR-032
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { FeatureRequestsPage } from '../src/pages/FeatureRequestsPage'
import type { FeatureRequest } from '../../Shared/types'

vi.mock('../src/api/client', () => ({
  featureRequests: {
    list: vi.fn(),
    create: vi.fn(),
    getById: vi.fn(),
    vote: vi.fn(),
    approve: vi.fn(),
    deny: vi.fn(),
  },
}))

import { featureRequests } from '../src/api/client'

const mockFRs: FeatureRequest[] = [
  {
    id: 'FR-0001',
    title: 'Dark mode support',
    description: 'Add dark mode to the application',
    source: 'manual',
    status: 'potential',
    priority: 'medium',
    votes: [],
    human_approval_comment: null,
    human_approval_approved_at: null,
    duplicate_warning: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'FR-0002',
    title: 'Export to CSV',
    description: 'Allow exporting data to CSV format',
    source: 'zendesk',
    status: 'voting',
    priority: 'high',
    votes: [
      {
        id: 'v1',
        feature_request_id: 'FR-0002',
        agent_name: 'Agent Alpha',
        decision: 'approve',
        comment: 'This is a commonly requested feature',
        created_at: new Date().toISOString(),
      },
    ],
    human_approval_comment: null,
    human_approval_approved_at: null,
    duplicate_warning: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
]

function renderPage() {
  return render(
    <MemoryRouter>
      <FeatureRequestsPage />
    </MemoryRouter>
  )
}

describe('FeatureRequestsPage', () => {
  beforeEach(() => {
    vi.mocked(featureRequests.list).mockResolvedValue({ data: mockFRs })
  })

  it('renders the page heading', () => {
    // Verifies: FR-025
    renderPage()
    expect(screen.getByText('Feature Requests')).toBeInTheDocument()
  })

  it('shows list of feature requests after loading', async () => {
    // Verifies: FR-025
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Dark mode support')).toBeInTheDocument()
    })
    expect(screen.getByText('Export to CSV')).toBeInTheDocument()
  })

  it('shows loading spinner initially', () => {
    // Verifies: FR-025
    renderPage()
    const spinner = document.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()
  })

  it('renders New Feature Request button', () => {
    // Verifies: FR-025
    renderPage()
    expect(screen.getByText('+ New Feature Request')).toBeInTheDocument()
  })

  it('shows create form when button is clicked', async () => {
    // Verifies: FR-025
    renderPage()
    const createBtn = screen.getByText('+ New Feature Request')
    fireEvent.click(createBtn)
    expect(screen.getByText('New Feature Request')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Brief description of the feature')).toBeInTheDocument()
  })

  it('shows error state when fetch fails', async () => {
    // Verifies: FR-025
    vi.mocked(featureRequests.list).mockRejectedValue(new Error('Server error'))
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Failed to load feature requests/)).toBeInTheDocument()
    })
  })

  it('shows status filter dropdown', () => {
    // Verifies: FR-025
    renderPage()
    expect(screen.getByDisplayValue('All Statuses')).toBeInTheDocument()
  })

  it('shows source filter dropdown', () => {
    // Verifies: FR-025
    renderPage()
    expect(screen.getByDisplayValue('All Sources')).toBeInTheDocument()
  })

  it('displays duplicate warning badge when set', async () => {
    // Verifies: FR-025
    const dupeWarningFR: FeatureRequest = {
      ...mockFRs[0],
      id: 'FR-0003',
      duplicate_warning: true,
    }
    vi.mocked(featureRequests.list).mockResolvedValue({ data: [dupeWarningFR] })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('⚠ Duplicate')).toBeInTheDocument()
    })
  })

  it('displays vote count in list item', async () => {
    // Verifies: FR-025
    renderPage()
    await waitFor(() => {
      // Vote count is rendered as part of a compound text node
      expect(screen.getByText(/1 votes/)).toBeInTheDocument()
    })
  })

  it('creates a feature request successfully', async () => {
    // Verifies: FR-025
    const newFR: FeatureRequest = {
      id: 'FR-0010',
      title: 'New feature',
      description: 'A brand new feature',
      source: 'manual',
      status: 'potential',
      priority: 'medium',
      votes: [],
      human_approval_comment: null,
      human_approval_approved_at: null,
      duplicate_warning: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    vi.mocked(featureRequests.create).mockResolvedValue(newFR)

    renderPage()

    // Open form
    fireEvent.click(screen.getByText('+ New Feature Request'))

    // Fill in form
    const titleInput = screen.getByPlaceholderText('Brief description of the feature')
    const descInput = screen.getByPlaceholderText('Detailed description of what you need and why')
    fireEvent.change(titleInput, { target: { value: 'New feature' } })
    fireEvent.change(descInput, { target: { value: 'A brand new feature' } })

    // Submit
    fireEvent.click(screen.getByText('Create Feature Request'))

    await waitFor(() => {
      expect(featureRequests.create).toHaveBeenCalledWith({
        title: 'New feature',
        description: 'A brand new feature',
        source: 'manual',
        priority: 'medium',
      })
    })
  })
})
