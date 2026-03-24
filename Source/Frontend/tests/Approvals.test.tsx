// Verifies: FR-028
// Verifies: FR-032
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ApprovalsPage } from '../src/pages/ApprovalsPage'
import type { FeatureRequest } from '../../Shared/types'

vi.mock('../src/api/client', () => ({
  featureRequests: {
    list: vi.fn(),
    approve: vi.fn(),
    deny: vi.fn(),
  },
}))

import { featureRequests } from '../src/api/client'

const mockVotingFRs: FeatureRequest[] = [
  {
    id: 'FR-0001',
    title: 'Add dark mode',
    description: 'Support dark mode theming',
    source: 'manual',
    status: 'voting',
    priority: 'medium',
    votes: [
      {
        id: 'v1',
        feature_request_id: 'FR-0001',
        agent_name: 'Agent Alpha',
        decision: 'approve',
        comment: 'Good UX improvement',
        created_at: new Date().toISOString(),
      },
      {
        id: 'v2',
        feature_request_id: 'FR-0001',
        agent_name: 'Agent Beta',
        decision: 'approve',
        comment: 'Users have requested this',
        created_at: new Date().toISOString(),
      },
      {
        id: 'v3',
        feature_request_id: 'FR-0001',
        agent_name: 'Agent Gamma',
        decision: 'deny',
        comment: 'Low priority',
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

const mockMajorityDenyFR: FeatureRequest = {
  id: 'FR-0002',
  title: 'Remove all tests',
  description: 'Tests slow down development',
  source: 'manual',
  status: 'voting',
  priority: 'low',
  votes: [
    {
      id: 'v4',
      feature_request_id: 'FR-0002',
      agent_name: 'Agent Alpha',
      decision: 'deny',
      comment: 'Bad idea',
      created_at: new Date().toISOString(),
    },
    {
      id: 'v5',
      feature_request_id: 'FR-0002',
      agent_name: 'Agent Beta',
      decision: 'deny',
      comment: 'Quality risk',
      created_at: new Date().toISOString(),
    },
    {
      id: 'v6',
      feature_request_id: 'FR-0002',
      agent_name: 'Agent Gamma',
      decision: 'approve',
      comment: 'Speed benefit',
      created_at: new Date().toISOString(),
    },
  ],
  human_approval_comment: null,
  human_approval_approved_at: null,
  duplicate_warning: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ApprovalsPage />
    </MemoryRouter>
  )
}

describe('ApprovalsPage', () => {
  beforeEach(() => {
    vi.mocked(featureRequests.list).mockResolvedValue({ data: mockVotingFRs })
    vi.mocked(featureRequests.approve).mockResolvedValue({
      ...mockVotingFRs[0],
      status: 'approved',
    })
    vi.mocked(featureRequests.deny).mockResolvedValue({
      ...mockVotingFRs[0],
      status: 'denied',
    })
  })

  it('renders Approvals heading', () => {
    // Verifies: FR-028
    renderPage()
    expect(screen.getByText('Approvals')).toBeInTheDocument()
  })

  it('fetches only voting-status FRs', async () => {
    // Verifies: FR-028
    renderPage()
    await waitFor(() => {
      expect(featureRequests.list).toHaveBeenCalledWith({ status: 'voting' })
    })
  })

  it('displays FRs awaiting approval', async () => {
    // Verifies: FR-028
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Add dark mode')).toBeInTheDocument()
    })
  })

  it('shows vote result summary', async () => {
    // Verifies: FR-028
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/2 approve \/ 1 deny/)).toBeInTheDocument()
    })
  })

  it('shows majority approve indicator', async () => {
    // Verifies: FR-028
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Majority approve/)).toBeInTheDocument()
    })
  })

  it('calls approve API when Approve button clicked', async () => {
    // Verifies: FR-028
    renderPage()
    await waitFor(() => screen.getByText('✓ Approve'))

    fireEvent.click(screen.getByText('✓ Approve'))
    await waitFor(() => {
      expect(featureRequests.approve).toHaveBeenCalledWith('FR-0001')
    })
  })

  it('shows deny form when Deny button clicked', async () => {
    // Verifies: FR-028
    renderPage()
    await waitFor(() => screen.getByText('✗ Deny'))

    fireEvent.click(screen.getByText('✗ Deny'))
    expect(screen.getByPlaceholderText('Reason for denial (required)')).toBeInTheDocument()
  })

  it('calls deny API with comment', async () => {
    // Verifies: FR-028
    renderPage()
    await waitFor(() => screen.getByText('✗ Deny'))

    fireEvent.click(screen.getByText('✗ Deny'))

    const commentInput = screen.getByPlaceholderText('Reason for denial (required)')
    fireEvent.change(commentInput, { target: { value: 'Not aligned with roadmap' } })

    fireEvent.click(screen.getByText('Confirm Deny'))
    await waitFor(() => {
      expect(featureRequests.deny).toHaveBeenCalledWith('FR-0001', {
        comment: 'Not aligned with roadmap',
      })
    })
  })

  it('shows empty state when no voting FRs', async () => {
    // Verifies: FR-028
    vi.mocked(featureRequests.list).mockResolvedValue({ data: [] })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('No pending approvals')).toBeInTheDocument()
    })
  })

  it('shows loading spinner initially', () => {
    // Verifies: FR-028
    renderPage()
    const spinner = document.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()
  })

  it('shows error state when fetch fails', async () => {
    // Verifies: FR-028
    vi.mocked(featureRequests.list).mockRejectedValue(new Error('Network error'))
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Failed to load approvals/)).toBeInTheDocument()
    })
  })

  it('Approve button is enabled for majority-approve FR', async () => {
    // Verifies: FR-028 — only approvable FRs have Approve enabled (SS-3)
    renderPage()
    await waitFor(() => screen.getByText('✓ Approve'))
    const approveBtn = screen.getByText('✓ Approve').closest('button')
    expect(approveBtn).not.toBeDisabled()
  })

  it('Approve button is disabled for majority-deny FR', async () => {
    // Verifies: FR-028 — majority-deny FRs must not be approvable (SS-3)
    vi.mocked(featureRequests.list).mockResolvedValue({ data: [mockMajorityDenyFR] })
    renderPage()
    await waitFor(() => screen.getByText('✓ Approve'))
    const approveBtn = screen.getByText('✓ Approve').closest('button')
    expect(approveBtn).toBeDisabled()
  })

  it('shows Recommended for Denial section for majority-deny FR', async () => {
    // Verifies: FR-028 — majority-deny FRs shown in separate section (SS-3)
    vi.mocked(featureRequests.list).mockResolvedValue({ data: [mockMajorityDenyFR] })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Recommended for Denial/i)).toBeInTheDocument()
    })
  })

  it('majority-deny FR is shown in the page with deny button enabled', async () => {
    // Verifies: FR-028 — majority-deny FRs still show Deny button so human can confirm denial (SS-3)
    vi.mocked(featureRequests.list).mockResolvedValue({ data: [mockMajorityDenyFR] })
    renderPage()
    await waitFor(() => screen.getByText('Remove all tests'))
    const denyBtn = screen.getByText('✗ Deny').closest('button')
    expect(denyBtn).not.toBeDisabled()
  })

  it('does not show Recommended for Denial section when all FRs are majority-approve', async () => {
    // Verifies: FR-028 — section hidden when there are no majority-deny FRs (SS-3)
    renderPage()
    await waitFor(() => screen.getByText('Add dark mode'))
    expect(screen.queryByText(/Recommended for Denial/i)).not.toBeInTheDocument()
  })

  it('shows both sections when mixed majority votes exist', async () => {
    // Verifies: FR-028 — mixed queue splits correctly by majority vote (SS-3)
    vi.mocked(featureRequests.list).mockResolvedValue({
      data: [...mockVotingFRs, mockMajorityDenyFR],
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Add dark mode')).toBeInTheDocument()
      expect(screen.getByText('Remove all tests')).toBeInTheDocument()
      expect(screen.getByText(/Recommended for Denial/i)).toBeInTheDocument()
    })
  })
})
