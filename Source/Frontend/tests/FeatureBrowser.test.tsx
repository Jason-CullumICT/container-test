// Verifies: FR-029
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { FeatureBrowserPage } from '../src/pages/FeatureBrowserPage'
import type { Feature } from '../../Shared/types'

vi.mock('../src/api/client', () => ({
  features: {
    list: vi.fn(),
  },
}))

import { features } from '../src/api/client'

const mockFeatures: Feature[] = [
  {
    id: 'FEAT-0001',
    title: 'Dark Mode',
    description: 'Full dark mode support across all pages',
    source_work_item_id: 'FR-0001',
    created_at: new Date().toISOString(),
  },
  {
    id: 'FEAT-0002',
    title: 'CSV Export',
    description: 'Export data tables to CSV format',
    source_work_item_id: 'FR-0002',
    created_at: new Date().toISOString(),
  },
  {
    id: 'FEAT-0003',
    title: 'Push Notifications',
    description: 'Real-time push notifications for events',
    source_work_item_id: 'FR-0003',
    created_at: new Date().toISOString(),
  },
]

function renderPage() {
  return render(
    <MemoryRouter>
      <FeatureBrowserPage />
    </MemoryRouter>
  )
}

describe('FeatureBrowserPage', () => {
  beforeEach(() => {
    vi.mocked(features.list).mockResolvedValue({ data: mockFeatures })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders Feature Browser heading', () => {
    // Verifies: FR-029
    renderPage()
    expect(screen.getByText('Feature Browser')).toBeInTheDocument()
  })

  it('shows loading spinner initially', () => {
    // Verifies: FR-029
    renderPage()
    const spinner = document.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()
  })

  it('renders search input', () => {
    // Verifies: FR-029
    renderPage()
    expect(
      screen.getByPlaceholderText(/Search completed features/)
    ).toBeInTheDocument()
  })

  it('displays all features after loading', async () => {
    // Verifies: FR-029
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Dark Mode')).toBeInTheDocument()
    })
    expect(screen.getByText('CSV Export')).toBeInTheDocument()
    expect(screen.getByText('Push Notifications')).toBeInTheDocument()
  })

  it('shows feature count', async () => {
    // Verifies: FR-029
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('3 features found')).toBeInTheDocument()
    })
  })

  it('displays source work item IDs', async () => {
    // Verifies: FR-029
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('From: FR-0001')).toBeInTheDocument()
    })
  })

  it('calls API with search query after debounce', async () => {
    // Verifies: FR-029
    // Use real timers for this test; just check that typing triggers a new fetch
    renderPage()

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Dark Mode')).toBeInTheDocument()
    })

    vi.mocked(features.list).mockResolvedValue({ data: [mockFeatures[0]] })

    const searchInput = screen.getByPlaceholderText(/Search completed features/)
    fireEvent.change(searchInput, { target: { value: 'dark' } })

    // After debounce (300ms), the API should be called with the query
    await waitFor(
      () => {
        expect(features.list).toHaveBeenCalledWith('dark')
      },
      { timeout: 2000 }
    )
  })

  it('shows empty state when no features exist', async () => {
    // Verifies: FR-029
    vi.mocked(features.list).mockResolvedValue({ data: [] })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('No completed features yet')).toBeInTheDocument()
    })
  })

  it('shows empty search state with search term', async () => {
    // Verifies: FR-029
    // First load with results, then search returns empty
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Dark Mode')).toBeInTheDocument()
    })

    vi.mocked(features.list).mockResolvedValue({ data: [] })
    const searchInput = screen.getByPlaceholderText(/Search completed features/)
    fireEvent.change(searchInput, { target: { value: 'nonexistent' } })

    await waitFor(
      () => {
        expect(screen.getByText('No features match your search')).toBeInTheDocument()
      },
      { timeout: 2000 }
    )
  })

  it('shows error state when fetch fails', async () => {
    // Verifies: FR-029
    vi.mocked(features.list).mockRejectedValue(new Error('Network error'))
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })
  })

  it('clears search when clear button is clicked', async () => {
    // Verifies: FR-029
    renderPage()
    await waitFor(() => screen.getByPlaceholderText(/Search completed features/))

    const searchInput = screen.getByPlaceholderText(/Search completed features/)

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'dark' } })
    })

    // Clear button should appear
    await waitFor(() => screen.getByText('×'))
    const clearBtn = screen.getByText('×')
    fireEvent.click(clearBtn)

    expect(searchInput).toHaveValue('')
  })
})
