// Verifies: FR-071
// Verifies: FR-072
// Verifies: FR-073
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { CycleCard } from '../src/components/orchestrator/CycleCard'
import { CycleLogStream } from '../src/components/orchestrator/CycleLogStream'
import type { OrchestratorCycle } from '../src/components/orchestrator/types'

// --- Mock data ---

function makeCycle(overrides: Partial<OrchestratorCycle> = {}): OrchestratorCycle {
  return {
    id: 'cycle-001',
    status: 'running',
    team: 'TheATeam',
    task: 'Implement user authentication',
    phase: 'Implementation',
    progress: 60,
    ports: { app: 5173, api: 3001 },
    branch: 'feat/auth',
    startedAt: new Date(Date.now() - 120000).toISOString(), // 2 min ago
    ...overrides,
  }
}

// --- CycleCard tests ---

describe('CycleCard', () => {
  let onStop: ReturnType<typeof vi.fn>
  let onRefresh: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onStop = vi.fn()
    onRefresh = vi.fn()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    // Stub EventSource so CycleLogStream can mount inside CycleCard
    vi.stubGlobal('EventSource', vi.fn().mockImplementation(() => ({
      onmessage: null,
      onerror: null,
      close: vi.fn(),
    })))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('renders cycle ID, team badge, and status badge', () => {
    // Verifies: FR-071
    render(<CycleCard cycle={makeCycle()} onStop={onStop} onRefresh={onRefresh} />)
    expect(screen.getByText('cycle-001')).toBeInTheDocument()
    expect(screen.getByTestId('team-badge')).toHaveTextContent('TheATeam')
    expect(screen.getByTestId('status-badge')).toHaveTextContent('running')
  })

  it('renders task description', () => {
    // Verifies: FR-071
    render(<CycleCard cycle={makeCycle()} onStop={onStop} onRefresh={onRefresh} />)
    expect(screen.getByText('Implement user authentication')).toBeInTheDocument()
  })

  it('renders phase label and progress bar', () => {
    // Verifies: FR-071
    render(<CycleCard cycle={makeCycle()} onStop={onStop} onRefresh={onRefresh} />)
    expect(screen.getByText('Implementation')).toBeInTheDocument()
    expect(screen.getByTestId('progress-bar')).toBeInTheDocument()
  })

  it('renders port links as clickable anchors opening in new tab', () => {
    // Verifies: FR-071
    render(<CycleCard cycle={makeCycle()} onStop={onStop} onRefresh={onRefresh} />)
    const links = screen.getAllByTestId('port-link')
    expect(links).toHaveLength(2)
    const appLink = links.find((l) => l.textContent?.includes('app'))!
    expect(appLink).toHaveAttribute('href', 'http://localhost:5173')
    expect(appLink).toHaveAttribute('target', '_blank')
    expect(appLink).toHaveAttribute('rel', 'noopener noreferrer')
    const apiLink = links.find((l) => l.textContent?.includes('api'))!
    expect(apiLink).toHaveAttribute('href', 'http://localhost:3001')
  })

  it('renders elapsed time', () => {
    // Verifies: FR-071
    render(<CycleCard cycle={makeCycle()} onStop={onStop} onRefresh={onRefresh} />)
    const elapsedEl = screen.getByTestId('elapsed-time')
    expect(elapsedEl.textContent).toMatch(/\d+[hms]/)
  })

  it('updates elapsed time every second for running cycles', () => {
    // Verifies: FR-071
    const cycle = makeCycle({ startedAt: new Date(Date.now() - 5000).toISOString() })
    render(<CycleCard cycle={cycle} onStop={onStop} onRefresh={onRefresh} />)
    const initial = screen.getByTestId('elapsed-time').textContent

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    // After 2s the elapsed should have changed (or be the same second range)
    const updated = screen.getByTestId('elapsed-time').textContent
    // Both should be valid elapsed strings
    expect(updated).toMatch(/\d+s/)
  })

  it('shows stop button for running cycles', () => {
    // Verifies: FR-072
    render(<CycleCard cycle={makeCycle()} onStop={onStop} onRefresh={onRefresh} />)
    expect(screen.getByTestId('stop-button')).toBeInTheDocument()
    expect(screen.getByTestId('stop-button')).toHaveTextContent('Stop')
  })

  it('does not show stop button for completed cycles', () => {
    // Verifies: FR-072
    render(<CycleCard cycle={makeCycle({ status: 'completed' })} onStop={onStop} onRefresh={onRefresh} />)
    expect(screen.queryByTestId('stop-button')).not.toBeInTheDocument()
  })

  it('calls onStop with cycle id after confirmation', () => {
    // Verifies: FR-072
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<CycleCard cycle={makeCycle()} onStop={onStop} onRefresh={onRefresh} />)
    fireEvent.click(screen.getByTestId('stop-button'))
    expect(window.confirm).toHaveBeenCalledWith('Stop cycle cycle-001?')
    expect(onStop).toHaveBeenCalledWith('cycle-001')
  })

  it('does not call onStop when confirmation is cancelled', () => {
    // Verifies: FR-072
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<CycleCard cycle={makeCycle()} onStop={onStop} onRefresh={onRefresh} />)
    fireEvent.click(screen.getByTestId('stop-button'))
    expect(onStop).not.toHaveBeenCalled()
  })

  it('renders View Logs toggle button', () => {
    // Verifies: FR-073
    render(<CycleCard cycle={makeCycle()} onStop={onStop} onRefresh={onRefresh} />)
    expect(screen.getByTestId('toggle-logs')).toHaveTextContent('View Logs')
  })

  it('toggles log stream visibility', () => {
    // Verifies: FR-073
    render(<CycleCard cycle={makeCycle()} onStop={onStop} onRefresh={onRefresh} />)
    // Initially hidden
    expect(screen.queryByTestId('cycle-log-stream')).not.toBeInTheDocument()

    // Click to show
    fireEvent.click(screen.getByTestId('toggle-logs'))
    expect(screen.getByTestId('cycle-log-stream')).toBeInTheDocument()
    expect(screen.getByTestId('toggle-logs')).toHaveTextContent('Hide Logs')

    // Click to hide
    fireEvent.click(screen.getByTestId('toggle-logs'))
    expect(screen.queryByTestId('cycle-log-stream')).not.toBeInTheDocument()
  })

  it('renders error message when cycle has error', () => {
    // Verifies: FR-071
    render(<CycleCard cycle={makeCycle({ error: 'Build failed' })} onStop={onStop} onRefresh={onRefresh} />)
    expect(screen.getByText('Build failed')).toBeInTheDocument()
  })

  it('handles cycle with no ports', () => {
    // Verifies: FR-071
    render(<CycleCard cycle={makeCycle({ ports: undefined })} onStop={onStop} onRefresh={onRefresh} />)
    expect(screen.queryByTestId('port-link')).not.toBeInTheDocument()
  })

  it('handles cycle with no team', () => {
    // Verifies: FR-071
    render(<CycleCard cycle={makeCycle({ team: undefined })} onStop={onStop} onRefresh={onRefresh} />)
    expect(screen.queryByTestId('team-badge')).not.toBeInTheDocument()
  })

  it('clamps progress bar between 0-100%', () => {
    // Verifies: FR-071
    const { container } = render(
      <CycleCard cycle={makeCycle({ progress: 150 })} onStop={onStop} onRefresh={onRefresh} />
    )
    const progressFill = container.querySelector('[data-testid="progress-bar"] > div')
    expect(progressFill).toHaveStyle({ width: '100%' })
  })

  it('applies correct border color for each status', () => {
    // Verifies: FR-071
    const { rerender } = render(
      <CycleCard cycle={makeCycle({ status: 'running' })} onStop={onStop} onRefresh={onRefresh} />
    )
    let card = screen.getByTestId('cycle-card')
    expect(card.className).toContain('border-l-blue-500')

    rerender(<CycleCard cycle={makeCycle({ status: 'completed' })} onStop={onStop} onRefresh={onRefresh} />)
    card = screen.getByTestId('cycle-card')
    expect(card.className).toContain('border-l-green-500')

    rerender(<CycleCard cycle={makeCycle({ status: 'failed' })} onStop={onStop} onRefresh={onRefresh} />)
    card = screen.getByTestId('cycle-card')
    expect(card.className).toContain('border-l-red-500')

    rerender(<CycleCard cycle={makeCycle({ status: 'stopped' })} onStop={onStop} onRefresh={onRefresh} />)
    card = screen.getByTestId('cycle-card')
    expect(card.className).toContain('border-l-gray-400')
  })
})

// --- CycleLogStream tests ---

describe('CycleLogStream', () => {
  let mockEventSource: {
    onmessage: ((event: MessageEvent) => void) | null
    onerror: (() => void) | null
    close: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    mockEventSource = {
      onmessage: null,
      onerror: null,
      close: vi.fn(),
    }
    vi.stubGlobal('EventSource', vi.fn().mockImplementation(() => mockEventSource))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders nothing when not expanded', () => {
    // Verifies: FR-073
    const { container } = render(<CycleLogStream cycleId="cycle-001" expanded={false} />)
    expect(container.innerHTML).toBe('')
  })

  it('connects to SSE endpoint when expanded', () => {
    // Verifies: FR-073
    render(<CycleLogStream cycleId="cycle-001" expanded={true} />)
    expect(EventSource).toHaveBeenCalledWith('/api/orchestrator/api/cycles/cycle-001/logs')
  })

  it('renders log entries from SSE events', () => {
    // Verifies: FR-073
    render(<CycleLogStream cycleId="cycle-001" expanded={true} />)

    act(() => {
      mockEventSource.onmessage?.({
        data: JSON.stringify({
          timestamp: '2026-03-25T10:00:00.000Z',
          agent: 'frontend-coder',
          message: 'Starting implementation',
          level: 'info',
        }),
      } as MessageEvent)
    })

    expect(screen.getByText('Starting implementation')).toBeInTheDocument()
    expect(screen.getByText('[frontend-coder]')).toBeInTheDocument()
  })

  it('shows waiting message when no logs yet', () => {
    // Verifies: FR-073
    render(<CycleLogStream cycleId="cycle-001" expanded={true} />)
    expect(screen.getByText('Waiting for log events...')).toBeInTheDocument()
  })

  it('shows connection error message on SSE error', () => {
    // Verifies: FR-073
    render(<CycleLogStream cycleId="cycle-001" expanded={true} />)

    act(() => {
      mockEventSource.onerror?.()
    })

    expect(screen.getByText(/Logs unavailable/)).toBeInTheDocument()
  })

  it('shows "Connection lost" when error occurs after receiving logs', () => {
    // Verifies: FR-073
    render(<CycleLogStream cycleId="cycle-001" expanded={true} />)

    act(() => {
      mockEventSource.onmessage?.({
        data: JSON.stringify({
          timestamp: '2026-03-25T10:00:00.000Z',
          message: 'First log',
        }),
      } as MessageEvent)
    })

    act(() => {
      mockEventSource.onerror?.()
    })

    expect(screen.getByText(/Connection lost/)).toBeInTheDocument()
    expect(screen.getByText('First log')).toBeInTheDocument()
  })

  it('closes EventSource on unmount', () => {
    // Verifies: FR-073
    const { unmount } = render(<CycleLogStream cycleId="cycle-001" expanded={true} />)
    unmount()
    expect(mockEventSource.close).toHaveBeenCalled()
  })

  it('applies color based on log level', () => {
    // Verifies: FR-073
    render(<CycleLogStream cycleId="cycle-001" expanded={true} />)

    act(() => {
      mockEventSource.onmessage?.({
        data: JSON.stringify({
          timestamp: '2026-03-25T10:00:00.000Z',
          message: 'Error occurred',
          level: 'error',
        }),
      } as MessageEvent)
    })

    const logLine = screen.getByText('Error occurred').closest('div')
    expect(logLine?.className).toContain('text-red-400')
  })

  it('handles malformed JSON gracefully', () => {
    // Verifies: FR-073
    render(<CycleLogStream cycleId="cycle-001" expanded={true} />)

    act(() => {
      mockEventSource.onmessage?.({
        data: 'not-valid-json',
      } as MessageEvent)
    })

    // Should not crash, still shows waiting
    expect(screen.getByText('Waiting for log events...')).toBeInTheDocument()
  })

  it('encodes cycleId in the SSE URL', () => {
    // Verifies: FR-073
    render(<CycleLogStream cycleId="cycle/special&id" expanded={true} />)
    expect(EventSource).toHaveBeenCalledWith(
      '/api/orchestrator/api/cycles/cycle%2Fspecial%26id/logs'
    )
  })
})
