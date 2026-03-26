// Verifies: FR-091, FR-093, FR-094, FR-095
// Runs history tab — polls listRuns() every 10s, displays table with retry/cleanup actions

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { orchestrator } from '../../api/client'
import { RunDetailRow } from './RunDetailRow'
import type { OrchestratorRun, OrchestratorRunStatus } from './types'

const POLL_INTERVAL_MS = 10000

// Verifies: FR-091
const RUN_STATUS_COLORS: Record<string, string> = {
  complete: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  implementing: 'bg-blue-100 text-blue-700',
  planning: 'bg-purple-100 text-purple-700',
  qa_running: 'bg-yellow-100 text-yellow-700',
  validating: 'bg-indigo-100 text-indigo-700',
}

// Verifies: FR-091
const RISK_COLORS: Record<string, string> = {
  low: 'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-red-100 text-red-700',
}

const ACTIVE_STATUSES: OrchestratorRunStatus[] = ['planning', 'implementing', 'qa_running', 'validating']

// Verifies: FR-091
function formatTimeAgo(dateStr?: string): string {
  if (!dateStr) return '--'
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 0) return 'just now'
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// Verifies: FR-091
export function RunsTab() {
  const [runs, setRuns] = useState<OrchestratorRun[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const notificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchRuns = useCallback(async () => {
    try {
      const result = await orchestrator.listRuns()
      setRuns((result.data ?? []) as OrchestratorRun[])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch runs')
    } finally {
      setLoading(false)
    }
  }, [])

  // Verifies: FR-091 — polling every 10s
  useEffect(() => {
    fetchRuns()
    intervalRef.current = setInterval(fetchRuns, POLL_INTERVAL_MS)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchRuns])

  // Cleanup notification timer
  useEffect(() => {
    return () => {
      if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current)
    }
  }, [])

  const showNotification = useCallback((message: string, type: 'success' | 'error') => {
    setNotification({ message, type })
    if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current)
    notificationTimerRef.current = setTimeout(() => setNotification(null), 5000)
  }, [])

  // Verifies: FR-093 — retry handler
  const handleRetry = useCallback(async (id: string) => {
    setRetryingId(id)
    try {
      const result = await orchestrator.retryRun(id)
      showNotification(`Retry started — new run: ${result.id}`, 'success')
      setExpandedRunId(result.id)
      await fetchRuns()
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'Retry failed', 'error')
    } finally {
      setRetryingId(null)
    }
  }, [fetchRuns, showNotification])

  // Verifies: FR-094 — cleanup handler with optimistic removal
  const handleCleanup = useCallback(async (id: string) => {
    setRuns((prev) => prev.filter((r) => r.id !== id))
    try {
      await orchestrator.cleanupRun(id)
    } catch {
      // Re-fetch on error to restore accurate state
      await fetchRuns()
      showNotification('Cleanup failed — list restored', 'error')
    }
  }, [fetchRuns, showNotification])

  const handleRowClick = useCallback((id: string) => {
    setExpandedRunId((prev) => (prev === id ? null : id))
  }, [])

  // Verifies: FR-095 — check if run is active
  const isActive = (status: OrchestratorRunStatus) => ACTIVE_STATUSES.includes(status)

  return (
    <div className="space-y-4" data-testid="runs-tab">
      {/* Notification banner — Verifies: FR-093 */}
      {notification && (
        <div
          className={`px-4 py-3 rounded-lg text-sm border ${
            notification.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
          data-testid="notification-banner"
        >
          {notification.message}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm" data-testid="error-banner">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16" data-testid="loading-spinner">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      ) : runs.length === 0 ? (
        <div className="text-center py-16" data-testid="empty-state">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-lg font-medium text-gray-600">No runs found</p>
          <p className="text-sm text-gray-400 mt-1">
            Submit work via the orchestrator to see run history here
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden" data-testid="runs-table">
          {/* Table header */}
          <div className="grid grid-cols-[100px_120px_100px_80px_1fr_100px_60px_120px] gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wide">
            <span>ID</span>
            <span>Status</span>
            <span>Team</span>
            <span>Risk</span>
            <span>Task</span>
            <span>Time</span>
            <span>Loops</span>
            <span>Actions</span>
          </div>

          {/* Table rows — Verifies: FR-091 */}
          {runs.map((run) => (
            <div key={run.id}>
              <div
                className="grid grid-cols-[100px_120px_100px_80px_1fr_100px_60px_120px] gap-2 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer items-center text-sm"
                onClick={() => handleRowClick(run.id)}
                data-testid="run-row"
              >
                {/* Truncated ID — Verifies: FR-091 */}
                <span
                  className="font-mono text-gray-700 truncate"
                  title={run.id}
                  data-testid="run-id"
                >
                  {run.id.slice(-8)}
                </span>

                {/* Status badge — Verifies: FR-091, FR-095 */}
                <span className="flex items-center gap-1">
                  {isActive(run.status) && (
                    <span
                      className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse"
                      data-testid="pulsing-indicator"
                    />
                  )}
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${RUN_STATUS_COLORS[run.status] ?? 'bg-gray-100 text-gray-600'}`}
                    data-testid="status-badge"
                  >
                    {run.status}
                  </span>
                </span>

                {/* Team badge — Verifies: FR-091 */}
                <span>
                  {run.team ? (
                    <span
                      className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium"
                      data-testid="team-badge"
                    >
                      {run.team}
                    </span>
                  ) : (
                    <span className="text-gray-400">--</span>
                  )}
                </span>

                {/* Risk badge — Verifies: FR-091 */}
                <span>
                  {run.riskLevel ? (
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${RISK_COLORS[run.riskLevel] ?? 'bg-gray-100 text-gray-600'}`}
                      data-testid="risk-badge"
                    >
                      {run.riskLevel}
                    </span>
                  ) : (
                    <span className="text-gray-400">--</span>
                  )}
                </span>

                {/* Task summary — Verifies: FR-091 */}
                <span className="text-gray-600 truncate" title={run.task} data-testid="task-summary">
                  {run.task ? (run.task.length > 80 ? run.task.slice(0, 80) + '…' : run.task) : '--'}
                </span>

                {/* Time ago — Verifies: FR-091 */}
                <span className="text-gray-500 text-xs" data-testid="time-ago">
                  {formatTimeAgo(run.startedAt)}
                </span>

                {/* Feedback loops — Verifies: FR-091 */}
                <span className="text-gray-600 text-center" data-testid="feedback-loops">
                  {run.feedbackLoops ?? 0}
                </span>

                {/* Actions — Verifies: FR-093, FR-094 */}
                <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  {run.status === 'failed' && (
                    <button
                      onClick={() => handleRetry(run.id)}
                      disabled={retryingId === run.id}
                      className="text-xs px-2 py-1 text-blue-600 border border-blue-300 rounded hover:bg-blue-50 disabled:opacity-50"
                      data-testid="retry-button"
                    >
                      {retryingId === run.id ? 'Retrying…' : 'Retry'}
                    </button>
                  )}
                  {(run.status === 'complete' || run.status === 'failed') && (
                    <button
                      onClick={() => handleCleanup(run.id)}
                      className="text-xs px-2 py-1 text-gray-500 border border-gray-300 rounded hover:bg-gray-50"
                      data-testid="cleanup-button"
                    >
                      ✕
                    </button>
                  )}
                </span>
              </div>

              {/* Expandable detail — Verifies: FR-092 */}
              <RunDetailRow
                run={run}
                expanded={expandedRunId === run.id}
                onNavigateToRun={(id) => setExpandedRunId(id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
