// Verifies: FR-075
// Verifies: FR-091
// Tests for OrchestratorCyclesPage — simplified runs-only view
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { OrchestratorCyclesPage } from '../src/pages/OrchestratorCyclesPage'

// Mock the API client (RunsTab uses orchestrator.listRuns)
vi.mock('../src/api/client', () => ({
  orchestrator: {
    listRuns: vi.fn(),
    getRun: vi.fn(),
    retryRun: vi.fn(),
    cleanupRun: vi.fn(),
  },
}))

import { orchestrator } from '../src/api/client'

function renderPage() {
  return render(
    <MemoryRouter>
      <OrchestratorCyclesPage />
    </MemoryRouter>
  )
}

describe('OrchestratorCyclesPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(orchestrator.listRuns).mockResolvedValue({ data: [] })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // Verifies: FR-075
  it('renders page header with Orchestrator title', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Orchestrator')).toBeTruthy()
    })
  })

  // Verifies: FR-091
  it('renders RunsTab directly without tab bar', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId('runs-tab')).toBeTruthy()
    })
    expect(screen.queryByTestId('tab-bar')).toBeNull()
  })

  // Verifies: FR-091
  it('shows runs empty state when no runs exist', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeTruthy()
    })
    expect(screen.getByText('No runs found')).toBeTruthy()
  })
})

// --- Module export tests ---

describe('Module exports', () => {
  // Verifies: FR-075
  it('OrchestratorCyclesPage is a valid export', async () => {
    const mod = await import('../src/pages/OrchestratorCyclesPage')
    expect(mod.OrchestratorCyclesPage).toBeDefined()
  })

  // Verifies: FR-075
  it('App.tsx default export is defined', async () => {
    const appSource = await import('../src/App')
    expect(appSource.default).toBeDefined()
  })
})
