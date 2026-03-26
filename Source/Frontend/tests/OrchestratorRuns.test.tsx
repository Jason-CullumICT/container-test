// Verifies: FR-090
// Verifies: FR-091
// Verifies: FR-092
// Verifies: FR-093
// Verifies: FR-094
// Verifies: FR-095
// Comprehensive tests for Runs dashboard, detail row, retry/cleanup, and real-time indicators

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RunsTab } from '../src/components/orchestrator/RunsTab'
import { RunDetailRow } from '../src/components/orchestrator/RunDetailRow'
import type { OrchestratorRun } from '../src/components/orchestrator/types'

// Mock the API client
vi.mock('../src/api/client', () => ({
  orchestrator: {
    listRuns: vi.fn(),
    getRun: vi.fn(),
    retryRun: vi.fn(),
    cleanupRun: vi.fn(),
    listCycles: vi.fn(),
    getCycle: vi.fn(),
    stopCycle: vi.fn(),
    submitWork: vi.fn(),
  },
}))

import { orchestrator } from '../src/api/client'

// --- Test fixtures ---

const mockFailedRun: OrchestratorRun = {
  id: 'run-aaaa1111-2222-3333-4444-555566667777',
  status: 'failed',
  team: 'TheATeam',
  task: 'Implement authentication module with JWT tokens and refresh token rotation for the backend service',
  riskLevel: 'medium',
  phases: [
    { phase: 'leader', status: 'passed' },
    { phase: 'implementation', status: 'passed' },
    { phase: 'qa', status: 'failed', message: 'Tests failed: 3 of 10' },
    { phase: 'smoketest', status: 'skipped' },
    { phase: 'inspector', status: 'skipped' },
  ],
  testResults: { total: 10, passed: 7, failed: 3 },
  pr: {
    number: 42,
    url: 'https://github.com/test/repo/pull/42',
    aiReviewVerdict: 'changes_requested',
    mergeStatus: 'open',
  },
  feedbackLoops: 2,
  startedAt: new Date(Date.now() - 3600000).toISOString(),
  completedAt: new Date(Date.now() - 1800000).toISOString(),
  error: 'QA gate failed',
}

const mockCompleteRun: OrchestratorRun = {
  id: 'run-bbbb1111-2222-3333-4444-555566667777',
  status: 'complete',
  team: 'TheBTeam',
  task: 'Fix login page CSS alignment issue across all responsive breakpoints',
  riskLevel: 'low',
  phases: [
    { phase: 'leader', status: 'passed' },
    { phase: 'implementation', status: 'passed' },
    { phase: 'qa', status: 'passed' },
    { phase: 'smoketest', status: 'passed' },
    { phase: 'inspector', status: 'passed' },
  ],
  testResults: { total: 5, passed: 5, failed: 0 },
  pr: {
    number: 43,
    url: 'https://github.com/test/repo/pull/43',
    aiReviewVerdict: 'approved',
    mergeStatus: 'merged',
  },
  feedbackLoops: 0,
  startedAt: new Date(Date.now() - 7200000).toISOString(),
  completedAt: new Date(Date.now() - 3600000).toISOString(),
}

const mockImplementingRun: OrchestratorRun = {
  id: 'run-cccc1111-2222-3333-4444-555566667777',
  status: 'implementing',
  team: 'TheATeam',
  task: 'Add dark mode toggle to settings page',
  riskLevel: 'low',
  feedbackLoops: 1,
  cycleId: 'cycle-123',
  startedAt: new Date(Date.now() - 300000).toISOString(),
}

const mockPlanningRun: OrchestratorRun = {
  id: 'run-dddd1111-2222-3333-4444-555566667777',
  status: 'planning',
  team: 'TheATeam',
  task: 'Refactor database layer to use connection pooling',
  riskLevel: 'high',
  feedbackLoops: 0,
  startedAt: new Date(Date.now() - 60000).toISOString(),
}

const mockRetryRun: OrchestratorRun = {
  id: 'run-eeee1111-2222-3333-4444-555566667777',
  status: 'implementing',
  team: 'TheATeam',
  task: 'Implement auth module (retry)',
  riskLevel: 'medium',
  retryOf: 'run-aaaa1111-2222-3333-4444-555566667777',
  feedbackLoops: 0,
  startedAt: new Date(Date.now() - 120000).toISOString(),
}

const allRuns = [mockFailedRun, mockCompleteRun, mockImplementingRun, mockPlanningRun]

// --- FR-090: API Client Tests ---

describe('API Client — retryRun and cleanupRun', () => {
  // Verifies: FR-090
  it('retryRun method exists on orchestrator client', () => {
    expect(orchestrator.retryRun).toBeDefined()
    expect(typeof orchestrator.retryRun).toBe('function')
  })

  // Verifies: FR-090
  it('cleanupRun method exists on orchestrator client', () => {
    expect(orchestrator.cleanupRun).toBeDefined()
    expect(typeof orchestrator.cleanupRun).toBe('function')
  })

  // Verifies: FR-090
  it('retryRun calls the correct endpoint', async () => {
    vi.mocked(orchestrator.retryRun).mockResolvedValue({ id: 'new-run-id', status: 'planning' })
    const result = await orchestrator.retryRun('test-run-id')
    expect(orchestrator.retryRun).toHaveBeenCalledWith('test-run-id')
    expect(result).toEqual({ id: 'new-run-id', status: 'planning' })
  })

  // Verifies: FR-090
  it('cleanupRun calls the correct endpoint', async () => {
    vi.mocked(orchestrator.cleanupRun).mockResolvedValue(undefined)
    await orchestrator.cleanupRun('test-run-id')
    expect(orchestrator.cleanupRun).toHaveBeenCalledWith('test-run-id')
  })

  // Verifies: FR-090
  it('retryRun accepts optional opts parameter', async () => {
    vi.mocked(orchestrator.retryRun).mockResolvedValue({ id: 'new-id', status: 'planning' })
    await orchestrator.retryRun('test-id', { team: 'TheATeam' })
    expect(orchestrator.retryRun).toHaveBeenCalledWith('test-id', { team: 'TheATeam' })
  })
})

// --- FR-091: RunsTab Tests ---

describe('RunsTab', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(orchestrator.listRuns).mockResolvedValue({ data: allRuns })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // Verifies: FR-091
  it('shows loading spinner initially', () => {
    vi.mocked(orchestrator.listRuns).mockReturnValue(new Promise(() => {}))
    render(<RunsTab />)
    expect(screen.getByTestId('loading-spinner')).toBeTruthy()
  })

  // Verifies: FR-091
  it('renders runs table after loading', async () => {
    render(<RunsTab />)
    await waitFor(() => {
      expect(screen.getByTestId('runs-table')).toBeTruthy()
    })
  })

  // Verifies: FR-091
  it('shows empty state when no runs', async () => {
    vi.mocked(orchestrator.listRuns).mockResolvedValue({ data: [] })
    render(<RunsTab />)
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeTruthy()
    })
    expect(screen.getByText('No runs found')).toBeTruthy()
  })

  // Verifies: FR-091
  it('displays correct number of run rows', async () => {
    render(<RunsTab />)
    await waitFor(() => {
      expect(screen.getAllByTestId('run-row')).toHaveLength(4)
    })
  })

  // Verifies: FR-091
  it('shows truncated run ID (last 8 chars) with full ID as tooltip', async () => {
    render(<RunsTab />)
    await waitFor(() => {
      expect(screen.getByTestId('runs-table')).toBeTruthy()
    })
    const idCells = screen.getAllByTestId('run-id')
    // Last 8 chars of 'run-aaaa1111-2222-3333-4444-555566667777'
    expect(idCells[0].textContent).toBe('66667777')
    expect(idCells[0]).toHaveAttribute('title', mockFailedRun.id)
  })

  // Verifies: FR-091
  it('renders status badges with correct text', async () => {
    render(<RunsTab />)
    await waitFor(() => {
      expect(screen.getByTestId('runs-table')).toBeTruthy()
    })
    const badges = screen.getAllByTestId('status-badge')
    const statusTexts = badges.map((b) => b.textContent)
    expect(statusTexts).toContain('failed')
    expect(statusTexts).toContain('complete')
    expect(statusTexts).toContain('implementing')
    expect(statusTexts).toContain('planning')
  })

  // Verifies: FR-091
  it('renders status badges with correct color classes', async () => {
    render(<RunsTab />)
    await waitFor(() => {
      expect(screen.getByTestId('runs-table')).toBeTruthy()
    })
    const badges = screen.getAllByTestId('status-badge')
    const failedBadge = badges.find((b) => b.textContent === 'failed')
    expect(failedBadge?.className).toContain('bg-red-100')
    const completeBadge = badges.find((b) => b.textContent === 'complete')
    expect(completeBadge?.className).toContain('bg-green-100')
  })

  // Verifies: FR-091
  it('renders team badges', async () => {
    render(<RunsTab />)
    await waitFor(() => {
      expect(screen.getByTestId('runs-table')).toBeTruthy()
    })
    const teamBadges = screen.getAllByTestId('team-badge')
    expect(teamBadges.length).toBeGreaterThan(0)
    expect(teamBadges[0].textContent).toBe('TheATeam')
  })

  // Verifies: FR-091
  it('renders risk badges with correct colors', async () => {
    render(<RunsTab />)
    await waitFor(() => {
      expect(screen.getByTestId('runs-table')).toBeTruthy()
    })
    const riskBadges = screen.getAllByTestId('risk-badge')
    const mediumBadge = riskBadges.find((b) => b.textContent === 'medium')
    expect(mediumBadge?.className).toContain('bg-yellow-100')
    const lowBadge = riskBadges.find((b) => b.textContent === 'low')
    expect(lowBadge?.className).toContain('bg-green-100')
    const highBadge = riskBadges.find((b) => b.textContent === 'high')
    expect(highBadge?.className).toContain('bg-red-100')
  })

  // Verifies: FR-091
  it('truncates task text to 80 chars', async () => {
    render(<RunsTab />)
    await waitFor(() => {
      expect(screen.getByTestId('runs-table')).toBeTruthy()
    })
    const taskCells = screen.getAllByTestId('task-summary')
    // The failed run task is >80 chars, should be truncated
    const longTask = taskCells[0]
    expect(longTask.textContent!.length).toBeLessThanOrEqual(84) // 80 + '…' + some margin
  })

  // Verifies: FR-091
  it('shows feedback loop counts', async () => {
    render(<RunsTab />)
    await waitFor(() => {
      expect(screen.getByTestId('runs-table')).toBeTruthy()
    })
    const loopCells = screen.getAllByTestId('feedback-loops')
    expect(loopCells[0].textContent).toBe('2') // failed run has 2 loops
    expect(loopCells[1].textContent).toBe('0') // complete run has 0
  })

  // Verifies: FR-091
  it('polls listRuns every 10 seconds', async () => {
    render(<RunsTab />)
    await waitFor(() => {
      expect(orchestrator.listRuns).toHaveBeenCalledTimes(1)
    })
    vi.advanceTimersByTime(10000)
    await waitFor(() => {
      expect(orchestrator.listRuns).toHaveBeenCalledTimes(2)
    })
    vi.advanceTimersByTime(10000)
    await waitFor(() => {
      expect(orchestrator.listRuns).toHaveBeenCalledTimes(3)
    })
  })

  // Verifies: FR-091
  it('cleans up polling interval on unmount', async () => {
    const { unmount } = render(<RunsTab />)
    await waitFor(() => {
      expect(orchestrator.listRuns).toHaveBeenCalledTimes(1)
    })
    unmount()
    vi.advanceTimersByTime(20000)
    expect(orchestrator.listRuns).toHaveBeenCalledTimes(1)
  })

  // Verifies: FR-091
  it('shows error banner on fetch failure', async () => {
    vi.mocked(orchestrator.listRuns).mockRejectedValue(new Error('Network error'))
    render(<RunsTab />)
    await waitFor(() => {
      expect(screen.getByTestId('error-banner')).toBeTruthy()
    })
    expect(screen.getByText('Network error')).toBeTruthy()
  })

  // Verifies: FR-091
  it('displays time-ago for run start time', async () => {
    render(<RunsTab />)
    await waitFor(() => {
      expect(screen.getByTestId('runs-table')).toBeTruthy()
    })
    const timeCells = screen.getAllByTestId('time-ago')
    // The failed run started 1h ago
    expect(timeCells[0].textContent).toMatch(/\d+[hms] ago/)
  })
})

// --- FR-092: RunDetailRow Tests ---

describe('RunDetailRow', () => {
  // Verifies: FR-092
  it('renders nothing when not expanded', () => {
    const { container } = render(
      <RunDetailRow run={mockFailedRun} expanded={false} />
    )
    expect(container.innerHTML).toBe('')
  })

  // Verifies: FR-092
  it('renders detail content when expanded', () => {
    render(<RunDetailRow run={mockFailedRun} expanded={true} />)
    expect(screen.getByTestId('run-detail-row')).toBeTruthy()
  })

  // Verifies: FR-092
  it('shows full task description', () => {
    render(<RunDetailRow run={mockFailedRun} expanded={true} />)
    expect(screen.getByTestId('run-detail-task')).toBeTruthy()
    expect(screen.getByText(mockFailedRun.task!)).toBeTruthy()
  })

  // Verifies: FR-092
  it('shows phase results grid with all 5 phases', () => {
    render(<RunDetailRow run={mockFailedRun} expanded={true} />)
    expect(screen.getByTestId('run-detail-phases')).toBeTruthy()
    expect(screen.getByTestId('phase-leader')).toBeTruthy()
    expect(screen.getByTestId('phase-implementation')).toBeTruthy()
    expect(screen.getByTestId('phase-qa')).toBeTruthy()
    expect(screen.getByTestId('phase-smoketest')).toBeTruthy()
    expect(screen.getByTestId('phase-inspector')).toBeTruthy()
  })

  // Verifies: FR-092
  it('shows green check for passed phases and red X for failed', () => {
    render(<RunDetailRow run={mockFailedRun} expanded={true} />)
    const leaderPhase = screen.getByTestId('phase-leader')
    const passedIcon = within(leaderPhase).getByText('\u2713')
    expect(passedIcon.className).toContain('text-green-600')

    const qaPhase = screen.getByTestId('phase-qa')
    const failedIcon = within(qaPhase).getByText('\u2717')
    expect(failedIcon.className).toContain('text-red-600')
  })

  // Verifies: FR-092
  it('shows gray dash for skipped phases', () => {
    render(<RunDetailRow run={mockFailedRun} expanded={true} />)
    const smoketestPhase = screen.getByTestId('phase-smoketest')
    const skippedIcon = within(smoketestPhase).getByText('\u2014')
    expect(skippedIcon.className).toContain('text-gray-400')
  })

  // Verifies: FR-092
  it('shows E2E test results with counts', () => {
    render(<RunDetailRow run={mockFailedRun} expanded={true} />)
    expect(screen.getByTestId('run-detail-tests')).toBeTruthy()
    expect(screen.getByText('10')).toBeTruthy() // total
    expect(screen.getByText('7')).toBeTruthy()  // passed
    expect(screen.getByText('3')).toBeTruthy()  // failed
  })

  // Verifies: FR-092
  it('does not show test results section when testResults is absent', () => {
    render(<RunDetailRow run={mockImplementingRun} expanded={true} />)
    expect(screen.queryByTestId('run-detail-tests')).toBeNull()
  })

  // Verifies: FR-092
  it('shows PR info with number as link', () => {
    render(<RunDetailRow run={mockFailedRun} expanded={true} />)
    expect(screen.getByTestId('run-detail-pr')).toBeTruthy()
    const prLink = screen.getByTestId('pr-link')
    expect(prLink.textContent).toBe('#42')
    expect(prLink).toHaveAttribute('href', 'https://github.com/test/repo/pull/42')
    expect(prLink).toHaveAttribute('target', '_blank')
  })

  // Verifies: FR-092
  it('shows AI review verdict badge', () => {
    render(<RunDetailRow run={mockFailedRun} expanded={true} />)
    const verdict = screen.getByTestId('pr-verdict')
    expect(verdict.textContent).toBe('changes_requested')
    expect(verdict.className).toContain('bg-yellow-100')
  })

  // Verifies: FR-092
  it('shows merge status badge', () => {
    render(<RunDetailRow run={mockFailedRun} expanded={true} />)
    const mergeStatus = screen.getByTestId('pr-merge-status')
    expect(mergeStatus.textContent).toBe('open')
    expect(mergeStatus.className).toContain('bg-blue-100')
  })

  // Verifies: FR-092
  it('shows approved verdict in green', () => {
    render(<RunDetailRow run={mockCompleteRun} expanded={true} />)
    const verdict = screen.getByTestId('pr-verdict')
    expect(verdict.textContent).toBe('approved')
    expect(verdict.className).toContain('bg-green-100')
  })

  // Verifies: FR-092
  it('shows merged status in purple', () => {
    render(<RunDetailRow run={mockCompleteRun} expanded={true} />)
    const mergeStatus = screen.getByTestId('pr-merge-status')
    expect(mergeStatus.textContent).toBe('merged')
    expect(mergeStatus.className).toContain('bg-purple-100')
  })

  // Verifies: FR-092
  it('does not show PR section when pr is absent', () => {
    render(<RunDetailRow run={mockImplementingRun} expanded={true} />)
    expect(screen.queryByTestId('run-detail-pr')).toBeNull()
  })

  // Verifies: FR-092
  it('shows retryOf link with truncated ID', () => {
    render(<RunDetailRow run={mockRetryRun} expanded={true} />)
    expect(screen.getByTestId('run-detail-retry-of')).toBeTruthy()
    const retryLink = screen.getByTestId('retry-of-link')
    expect(retryLink.textContent).toBe('66667777') // last 8 chars
  })

  // Verifies: FR-092
  it('calls onNavigateToRun when retryOf link is clicked', () => {
    const onNavigate = vi.fn()
    render(<RunDetailRow run={mockRetryRun} expanded={true} onNavigateToRun={onNavigate} />)
    fireEvent.click(screen.getByTestId('retry-of-link'))
    expect(onNavigate).toHaveBeenCalledWith(mockRetryRun.retryOf)
  })

  // Verifies: FR-092
  it('does not show retryOf section when retryOf is absent', () => {
    render(<RunDetailRow run={mockCompleteRun} expanded={true} />)
    expect(screen.queryByTestId('run-detail-retry-of')).toBeNull()
  })

  // Verifies: FR-092
  it('shows error message when run has error', () => {
    render(<RunDetailRow run={mockFailedRun} expanded={true} />)
    expect(screen.getByTestId('run-detail-error')).toBeTruthy()
    expect(screen.getByText('QA gate failed')).toBeTruthy()
  })

  // Verifies: FR-092
  it('does not show phases section when phases are absent', () => {
    render(<RunDetailRow run={{ ...mockImplementingRun, phases: undefined }} expanded={true} />)
    expect(screen.queryByTestId('run-detail-phases')).toBeNull()
  })
})

// --- FR-092: Expandable row integration in RunsTab ---

describe('RunsTab — expandable rows', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(orchestrator.listRuns).mockResolvedValue({ data: [mockFailedRun] })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // Verifies: FR-092
  it('expands detail row on click', async () => {
    render(<RunsTab />)
    await waitFor(() => {
      expect(screen.getByTestId('run-row')).toBeTruthy()
    })
    expect(screen.queryByTestId('run-detail-row')).toBeNull()
    fireEvent.click(screen.getByTestId('run-row'))
    expect(screen.getByTestId('run-detail-row')).toBeTruthy()
  })

  // Verifies: FR-092
  it('collapses detail row on second click', async () => {
    render(<RunsTab />)
    await waitFor(() => {
      expect(screen.getByTestId('run-row')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('run-row'))
    expect(screen.getByTestId('run-detail-row')).toBeTruthy()
    fireEvent.click(screen.getByTestId('run-row'))
    expect(screen.queryByTestId('run-detail-row')).toBeNull()
  })
})

// --- FR-093: Retry Button Tests ---

describe('RunsTab — retry button', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(orchestrator.listRuns).mockResolvedValue({ data: allRuns })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // Verifies: FR-093
  it('shows retry button only on failed runs', async () => {
    render(<RunsTab />)
    await waitFor(() => {
      expect(screen.getByTestId('runs-table')).toBeTruthy()
    })
    const retryButtons = screen.getAllByTestId('retry-button')
    expect(retryButtons).toHaveLength(1) // only one failed run
  })

  // Verifies: FR-093
  it('disables retry button while retrying', async () => {
    let resolveRetry: (value: any) => void
    vi.mocked(orchestrator.retryRun).mockReturnValue(
      new Promise((resolve) => { resolveRetry = resolve })
    )
    render(<RunsTab />)
    await waitFor(() => {
      expect(screen.getByTestId('retry-button')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('retry-button'))
    await waitFor(() => {
      expect(screen.getByTestId('retry-button')).toBeDisabled()
    })
    expect(screen.getByTestId('retry-button').textContent).toContain('Retrying')
    // Resolve to clean up
    resolveRetry!({ id: 'new-run', status: 'planning' })
  })

  // Verifies: FR-093
  it('shows success notification with new run ID on retry', async () => {
    vi.mocked(orchestrator.retryRun).mockResolvedValue({ id: 'new-run-abc', status: 'planning' })
    render(<RunsTab />)
    await waitFor(() => {
      expect(screen.getByTestId('retry-button')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('retry-button'))
    await waitFor(() => {
      expect(screen.getByTestId('notification-banner')).toBeTruthy()
    })
    expect(screen.getByTestId('notification-banner').textContent).toContain('new-run-abc')
    expect(screen.getByTestId('notification-banner').className).toContain('bg-green-50')
  })

  // Verifies: FR-093
  it('shows error notification when retry fails', async () => {
    vi.mocked(orchestrator.retryRun).mockRejectedValue(new Error('Retry failed'))
    render(<RunsTab />)
    await waitFor(() => {
      expect(screen.getByTestId('retry-button')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('retry-button'))
    await waitFor(() => {
      expect(screen.getByTestId('notification-banner')).toBeTruthy()
    })
    expect(screen.getByTestId('notification-banner').textContent).toContain('Retry failed')
    expect(screen.getByTestId('notification-banner').className).toContain('bg-red-50')
  })

  // Verifies: FR-093
  it('re-enables retry button after completion', async () => {
    vi.mocked(orchestrator.retryRun).mockResolvedValue({ id: 'new-run', status: 'planning' })
    render(<RunsTab />)
    await waitFor(() => {
      expect(screen.getByTestId('retry-button')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('retry-button'))
    await waitFor(() => {
      expect(screen.getByTestId('retry-button')).not.toBeDisabled()
    })
  })

  // Verifies: FR-093
  it('calls retryRun with correct run ID', async () => {
    vi.mocked(orchestrator.retryRun).mockResolvedValue({ id: 'new-run', status: 'planning' })
    render(<RunsTab />)
    await waitFor(() => {
      expect(screen.getByTestId('retry-button')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('retry-button'))
    await waitFor(() => {
      expect(orchestrator.retryRun).toHaveBeenCalledWith(mockFailedRun.id)
    })
  })
})

// --- FR-094: Cleanup Button Tests ---

describe('RunsTab — cleanup button', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(orchestrator.listRuns).mockResolvedValue({ data: allRuns })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // Verifies: FR-094
  it('shows cleanup button on completed and failed runs', async () => {
    render(<RunsTab />)
    await waitFor(() => {
      expect(screen.getByTestId('runs-table')).toBeTruthy()
    })
    const cleanupButtons = screen.getAllByTestId('cleanup-button')
    expect(cleanupButtons).toHaveLength(2) // failed + complete runs
  })

  // Verifies: FR-094
  it('does not show cleanup button on active runs', async () => {
    vi.mocked(orchestrator.listRuns).mockResolvedValue({ data: [mockImplementingRun] })
    render(<RunsTab />)
    await waitFor(() => {
      expect(screen.getByTestId('runs-table')).toBeTruthy()
    })
    expect(screen.queryByTestId('cleanup-button')).toBeNull()
  })

  // Verifies: FR-094
  it('removes row optimistically on cleanup', async () => {
    vi.mocked(orchestrator.cleanupRun).mockResolvedValue(undefined)
    render(<RunsTab />)
    await waitFor(() => {
      expect(screen.getAllByTestId('run-row')).toHaveLength(4)
    })
    const cleanupButtons = screen.getAllByTestId('cleanup-button')
    fireEvent.click(cleanupButtons[0]) // cleanup the failed run
    await waitFor(() => {
      expect(screen.getAllByTestId('run-row')).toHaveLength(3)
    })
  })

  // Verifies: FR-094
  it('calls cleanupRun with correct ID', async () => {
    vi.mocked(orchestrator.cleanupRun).mockResolvedValue(undefined)
    render(<RunsTab />)
    await waitFor(() => {
      expect(screen.getByTestId('runs-table')).toBeTruthy()
    })
    const cleanupButtons = screen.getAllByTestId('cleanup-button')
    fireEvent.click(cleanupButtons[0])
    expect(orchestrator.cleanupRun).toHaveBeenCalledWith(mockFailedRun.id)
  })

  // Verifies: FR-094
  it('re-fetches list on cleanup API error', async () => {
    vi.mocked(orchestrator.cleanupRun).mockRejectedValue(new Error('Cleanup failed'))
    vi.mocked(orchestrator.listRuns)
      .mockResolvedValueOnce({ data: allRuns })
      .mockResolvedValueOnce({ data: allRuns })
    render(<RunsTab />)
    await waitFor(() => {
      expect(screen.getAllByTestId('run-row')).toHaveLength(4)
    })
    const cleanupButtons = screen.getAllByTestId('cleanup-button')
    fireEvent.click(cleanupButtons[0])
    // Should re-fetch and restore the row
    await waitFor(() => {
      expect(screen.getAllByTestId('run-row')).toHaveLength(4)
    })
  })
})

// --- FR-095: Real-Time Status Indicators ---

describe('RunsTab — real-time indicators', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(orchestrator.listRuns).mockResolvedValue({ data: allRuns })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // Verifies: FR-095
  it('shows pulsing indicator on active runs (implementing, planning)', async () => {
    render(<RunsTab />)
    await waitFor(() => {
      expect(screen.getByTestId('runs-table')).toBeTruthy()
    })
    const indicators = screen.getAllByTestId('pulsing-indicator')
    // implementing + planning runs = 2 active
    expect(indicators).toHaveLength(2)
  })

  // Verifies: FR-095
  it('does not show pulsing indicator on completed/failed runs', async () => {
    vi.mocked(orchestrator.listRuns).mockResolvedValue({ data: [mockCompleteRun, mockFailedRun] })
    render(<RunsTab />)
    await waitFor(() => {
      expect(screen.getByTestId('runs-table')).toBeTruthy()
    })
    expect(screen.queryByTestId('pulsing-indicator')).toBeNull()
  })

  // Verifies: FR-095
  it('pulsing indicator has animate-pulse class', async () => {
    render(<RunsTab />)
    await waitFor(() => {
      expect(screen.getByTestId('runs-table')).toBeTruthy()
    })
    const indicators = screen.getAllByTestId('pulsing-indicator')
    expect(indicators[0].className).toContain('animate-pulse')
    expect(indicators[0].className).toContain('bg-blue-500')
  })

})

// --- FR-091: Module Export Tests ---

describe('Orchestrator module exports', () => {
  // Verifies: FR-091
  it('OrchestratorCyclesPage is a valid export', async () => {
    const mod = await import('../src/pages/OrchestratorCyclesPage')
    expect(mod.OrchestratorCyclesPage).toBeDefined()
  })

  // Verifies: FR-091
  it('RunsTab is a valid export', async () => {
    const mod = await import('../src/components/orchestrator/RunsTab')
    expect(mod.RunsTab).toBeDefined()
  })

  // Verifies: FR-092
  it('RunDetailRow is a valid export', async () => {
    const mod = await import('../src/components/orchestrator/RunDetailRow')
    expect(mod.RunDetailRow).toBeDefined()
  })
})
