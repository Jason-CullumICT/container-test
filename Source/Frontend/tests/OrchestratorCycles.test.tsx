// Verifies: FR-070
// Verifies: FR-074
// Verifies: FR-075
// Verifies: FR-076
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { OrchestratorCyclesPage } from '../src/pages/OrchestratorCyclesPage'
import { CompletedCyclesSection } from '../src/components/orchestrator/CompletedCyclesSection'
import type { OrchestratorCycle } from '../src/components/orchestrator/types'

// Mock the API client
vi.mock('../src/api/client', () => ({
  orchestrator: {
    listCycles: vi.fn(),
    getCycle: vi.fn(),
    stopCycle: vi.fn(),
    submitWork: vi.fn(),
  },
}))

import { orchestrator } from '../src/api/client'

// Mock EventSource globally for CycleLogStream
class MockEventSource {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  close = vi.fn()
  constructor(public url: string) {}
}

vi.stubGlobal('EventSource', MockEventSource)

const mockRunningCycle: OrchestratorCycle = {
  id: 'abc12345-6789-0000-1111-222233334444',
  status: 'running',
  team: 'TheATeam',
  task: 'Build authentication module',
  phase: 'Implementation',
  progress: 45,
  ports: { app: 5173, api: 3001 },
  branch: 'feature/auth',
  startedAt: new Date(Date.now() - 120000).toISOString(),
}

const mockCompletedCycle: OrchestratorCycle = {
  id: 'def98765-4321-0000-1111-222233334444',
  status: 'completed',
  team: 'TheBTeam',
  task: 'Fix login bug',
  startedAt: new Date(Date.now() - 600000).toISOString(),
  completedAt: new Date(Date.now() - 300000).toISOString(),
}

const mockFailedCycle: OrchestratorCycle = {
  id: 'ghi55555-4321-0000-1111-222233334444',
  status: 'failed',
  team: 'TheATeam',
  task: 'Deploy feature',
  startedAt: new Date(Date.now() - 900000).toISOString(),
  completedAt: new Date(Date.now() - 800000).toISOString(),
  error: 'Build failed',
}

function renderPage() {
  return render(
    <MemoryRouter>
      <OrchestratorCyclesPage />
    </MemoryRouter>
  )
}

// --- OrchestratorCyclesPage tests (FR-070) ---

describe('OrchestratorCyclesPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(orchestrator.listCycles).mockResolvedValue({
      data: [mockRunningCycle, mockCompletedCycle],
    })
    vi.mocked(orchestrator.stopCycle).mockResolvedValue({ stopped: true })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // Verifies: FR-070
  it('shows loading spinner initially', () => {
    vi.mocked(orchestrator.listCycles).mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByTestId('loading-spinner')).toBeTruthy()
  })

  // Verifies: FR-070
  it('displays active cycles after loading', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId('active-cycles')).toBeTruthy()
    })
    expect(screen.getByText('Active (1)')).toBeTruthy()
  })

  // Verifies: FR-070
  it('polls every 5 seconds', async () => {
    renderPage()
    await waitFor(() => {
      expect(orchestrator.listCycles).toHaveBeenCalledTimes(1)
    })
    vi.advanceTimersByTime(5000)
    await waitFor(() => {
      expect(orchestrator.listCycles).toHaveBeenCalledTimes(2)
    })
    vi.advanceTimersByTime(5000)
    await waitFor(() => {
      expect(orchestrator.listCycles).toHaveBeenCalledTimes(3)
    })
  })

  // Verifies: FR-070
  it('cleans up interval on unmount', async () => {
    const { unmount } = renderPage()
    await waitFor(() => {
      expect(orchestrator.listCycles).toHaveBeenCalledTimes(1)
    })
    unmount()
    vi.advanceTimersByTime(10000)
    expect(orchestrator.listCycles).toHaveBeenCalledTimes(1)
  })

  // Verifies: FR-070
  it('shows empty state when no cycles', async () => {
    vi.mocked(orchestrator.listCycles).mockResolvedValue({ data: [] })
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeTruthy()
    })
    expect(screen.getByText('No orchestrator cycles')).toBeTruthy()
  })

  // Verifies: FR-070
  it('shows error banner on API failure', async () => {
    vi.mocked(orchestrator.listCycles).mockRejectedValue(new Error('Network error'))
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId('error-banner')).toBeTruthy()
    })
    expect(screen.getByText('Network error')).toBeTruthy()
  })

  // Verifies: FR-071
  it('renders cycle card with team badge and progress bar', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId('cycle-card')).toBeTruthy()
    })
    expect(screen.getByTestId('team-badge')).toHaveTextContent('TheATeam')
    expect(screen.getByTestId('progress-bar')).toBeTruthy()
  })

  // Verifies: FR-071
  it('renders port links as clickable anchors opening in new tab', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId('cycle-card')).toBeTruthy()
    })
    const portLinks = screen.getAllByTestId('port-link')
    expect(portLinks).toHaveLength(2)
    expect(portLinks[0]).toHaveAttribute('href', 'http://localhost:5173')
    expect(portLinks[0]).toHaveAttribute('target', '_blank')
    expect(portLinks[1]).toHaveAttribute('href', 'http://localhost:3001')
  })

  // Verifies: FR-071
  it('shows elapsed time on cycle card', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId('elapsed-time')).toBeTruthy()
    })
    expect(screen.getByTestId('elapsed-time').textContent).toMatch(/\d+[hms]/)
  })

  // Verifies: FR-072
  it('stop button calls stopCycle with confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId('stop-button')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('stop-button'))
    expect(window.confirm).toHaveBeenCalled()
    await waitFor(() => {
      expect(orchestrator.stopCycle).toHaveBeenCalledWith(mockRunningCycle.id)
    })
  })

  // Verifies: FR-072
  it('stop button does nothing if confirm is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId('stop-button')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('stop-button'))
    expect(orchestrator.stopCycle).not.toHaveBeenCalled()
  })

  // Verifies: FR-074
  it('shows completed cycles section with count', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId('completed-cycles-section')).toBeTruthy()
    })
    expect(screen.getByText('Completed (1)')).toBeTruthy()
  })

  // Verifies: FR-075
  it('renders page header with Orchestrator title', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Orchestrator')).toBeTruthy()
    })
  })
})

// --- CompletedCyclesSection unit tests (FR-074) ---

describe('CompletedCyclesSection', () => {
  const cycles = [mockCompletedCycle, mockFailedCycle]

  // Verifies: FR-074
  it('renders nothing when no cycles', () => {
    const { container } = render(<CompletedCyclesSection cycles={[]} />)
    expect(container.innerHTML).toBe('')
  })

  // Verifies: FR-074
  it('shows count in header', () => {
    render(<CompletedCyclesSection cycles={cycles} />)
    expect(screen.getByText('Completed (2)')).toBeTruthy()
  })

  // Verifies: FR-074
  it('is collapsed by default', () => {
    render(<CompletedCyclesSection cycles={cycles} />)
    expect(screen.queryByTestId('completed-cycles-list')).toBeNull()
  })

  // Verifies: FR-074
  it('expands on click to show cycle rows', () => {
    render(<CompletedCyclesSection cycles={cycles} />)
    fireEvent.click(screen.getByTestId('completed-cycles-toggle'))
    expect(screen.getByTestId('completed-cycles-list')).toBeTruthy()
    const rows = screen.getAllByTestId('completed-cycle-row')
    expect(rows).toHaveLength(2)
  })

  // Verifies: FR-074
  it('shows status badges for each cycle', () => {
    render(<CompletedCyclesSection cycles={cycles} />)
    fireEvent.click(screen.getByTestId('completed-cycles-toggle'))
    expect(screen.getByText('completed')).toBeTruthy()
    expect(screen.getByText('failed')).toBeTruthy()
  })

  // Verifies: FR-074
  it('shows team badges for each cycle', () => {
    render(<CompletedCyclesSection cycles={cycles} />)
    fireEvent.click(screen.getByTestId('completed-cycles-toggle'))
    expect(screen.getByText('TheBTeam')).toBeTruthy()
    expect(screen.getByText('TheATeam')).toBeTruthy()
  })

  // Verifies: FR-074
  it('collapses when toggle is clicked again', () => {
    render(<CompletedCyclesSection cycles={cycles} />)
    fireEvent.click(screen.getByTestId('completed-cycles-toggle'))
    expect(screen.getByTestId('completed-cycles-list')).toBeTruthy()
    fireEvent.click(screen.getByTestId('completed-cycles-toggle'))
    expect(screen.queryByTestId('completed-cycles-list')).toBeNull()
  })

  // Verifies: FR-074
  it('shows duration for completed cycles', () => {
    render(<CompletedCyclesSection cycles={[mockCompletedCycle]} />)
    fireEvent.click(screen.getByTestId('completed-cycles-toggle'))
    const row = screen.getByTestId('completed-cycle-row')
    expect(row.textContent).toMatch(/\d+[hms]/)
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
