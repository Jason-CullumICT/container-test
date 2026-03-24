// Verifies: FR-030
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LearningsPage } from '../src/pages/LearningsPage'
import type { Learning } from '../../Shared/types'

vi.mock('../src/api/client', () => ({
  learnings: {
    list: vi.fn(),
  },
}))

import { learnings } from '../src/api/client'

const mockLearnings: Learning[] = [
  {
    id: 'LEARN-0001',
    cycle_id: 'CYCLE-0001',
    content: 'We should break down large tickets into smaller ones',
    category: 'process',
    created_at: new Date().toISOString(),
  },
  {
    id: 'LEARN-0002',
    cycle_id: 'CYCLE-0001',
    content: 'Use TypeScript strict mode from the start',
    category: 'technical',
    created_at: new Date().toISOString(),
  },
  {
    id: 'LEARN-0003',
    cycle_id: 'CYCLE-0002',
    content: 'Domain experts should review all feature specs',
    category: 'domain',
    created_at: new Date().toISOString(),
  },
]

function renderPage() {
  return render(
    <MemoryRouter>
      <LearningsPage />
    </MemoryRouter>
  )
}

describe('LearningsPage', () => {
  beforeEach(() => {
    vi.mocked(learnings.list).mockResolvedValue({ data: mockLearnings })
  })

  it('renders Learnings heading', () => {
    // Verifies: FR-030
    renderPage()
    expect(screen.getByText('Learnings')).toBeInTheDocument()
  })

  it('shows loading spinner initially', () => {
    // Verifies: FR-030
    renderPage()
    const spinner = document.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()
  })

  it('displays all learnings after loading', async () => {
    // Verifies: FR-030
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('We should break down large tickets into smaller ones')).toBeInTheDocument()
    })
    expect(screen.getByText('Use TypeScript strict mode from the start')).toBeInTheDocument()
    expect(screen.getByText('Domain experts should review all feature specs')).toBeInTheDocument()
  })

  it('displays category badges', async () => {
    // Verifies: FR-030
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/process/)).toBeInTheDocument()
    })
    expect(screen.getByText(/technical/)).toBeInTheDocument()
    expect(screen.getByText(/domain/)).toBeInTheDocument()
  })

  it('shows cycle reference for each learning', async () => {
    // Verifies: FR-030
    renderPage()
    await waitFor(() => {
      const cycleRefs = screen.getAllByText(/Cycle: CYCLE/)
      expect(cycleRefs.length).toBe(3)
    })
  })

  it('renders category filter dropdown', () => {
    // Verifies: FR-030
    renderPage()
    expect(screen.getByDisplayValue('All Categories')).toBeInTheDocument()
  })

  it('calls API with category filter when selected', async () => {
    // Verifies: FR-030
    renderPage()

    const categorySelect = screen.getByDisplayValue('All Categories')
    fireEvent.change(categorySelect, { target: { value: 'technical' } })

    await waitFor(() => {
      expect(learnings.list).toHaveBeenCalledWith({
        category: 'technical',
        cycle_id: undefined,
      })
    })
  })

  it('calls API with cycle filter when submitted', async () => {
    // Verifies: FR-030
    renderPage()

    const cycleInput = screen.getByPlaceholderText('Filter by cycle ID...')
    fireEvent.change(cycleInput, { target: { value: 'CYCLE-0001' } })

    const filterBtn = screen.getByText('Filter')
    fireEvent.click(filterBtn)

    await waitFor(() => {
      expect(learnings.list).toHaveBeenCalledWith({
        category: undefined,
        cycle_id: 'CYCLE-0001',
      })
    })
  })

  it('shows empty state when no learnings found', async () => {
    // Verifies: FR-030
    vi.mocked(learnings.list).mockResolvedValue({ data: [] })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('No learnings found')).toBeInTheDocument()
    })
  })

  it('shows error state when fetch fails', async () => {
    // Verifies: FR-030
    vi.mocked(learnings.list).mockRejectedValue(new Error('Server error'))
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Failed to load learnings/)).toBeInTheDocument()
    })
  })

  it('shows learning count', async () => {
    // Verifies: FR-030
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('3 learnings')).toBeInTheDocument()
    })
  })

  it('clears cycle filter when × is clicked', async () => {
    // Verifies: FR-030
    renderPage()
    await waitFor(() => screen.getByPlaceholderText('Filter by cycle ID...'))

    const cycleInput = screen.getByPlaceholderText('Filter by cycle ID...')
    fireEvent.change(cycleInput, { target: { value: 'CYCLE-0001' } })

    fireEvent.click(screen.getByText('Filter'))

    await waitFor(() => {
      expect(screen.getByText('×')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('×'))

    await waitFor(() => {
      expect(learnings.list).toHaveBeenCalledWith({
        category: undefined,
        cycle_id: undefined,
      })
    })
  })
})
