// Verifies: FR-071
// Verifies: FR-072
// Cycle card displaying status, team, phase, progress, ports, elapsed time, stop button, and log stream
import React, { useState, useEffect } from 'react'
import type { OrchestratorCycle } from './types'
import { CycleLogStream } from './CycleLogStream'

interface CycleCardProps {
  cycle: OrchestratorCycle
  onStop: (id: string) => void
  onRefresh: () => void
}

const STATUS_BORDER: Record<string, string> = {
  running: 'border-l-blue-500',
  completed: 'border-l-green-500',
  failed: 'border-l-red-500',
  stopped: 'border-l-gray-400',
}

const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  running: { bg: 'bg-blue-100', text: 'text-blue-700' },
  completed: { bg: 'bg-green-100', text: 'text-green-700' },
  failed: { bg: 'bg-red-100', text: 'text-red-700' },
  stopped: { bg: 'bg-gray-100', text: 'text-gray-600' },
}

function formatElapsed(startedAt?: string, completedAt?: string): string {
  if (!startedAt) return '--'
  const start = new Date(startedAt).getTime()
  const end = completedAt ? new Date(completedAt).getTime() : Date.now()
  const diffMs = Math.max(0, end - start)
  const totalSeconds = Math.floor(diffMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

export function CycleCard({ cycle, onStop, onRefresh }: CycleCardProps) {
  const [showLogs, setShowLogs] = useState(false)
  const [elapsed, setElapsed] = useState(() =>
    formatElapsed(cycle.startedAt, cycle.completedAt)
  )
  const [stopping, setStopping] = useState(false)

  // Update elapsed time every second for running cycles
  useEffect(() => {
    if (cycle.status !== 'running' || !cycle.startedAt) {
      setElapsed(formatElapsed(cycle.startedAt, cycle.completedAt))
      return
    }

    setElapsed(formatElapsed(cycle.startedAt))
    const timer = setInterval(() => {
      setElapsed(formatElapsed(cycle.startedAt))
    }, 1000)

    return () => clearInterval(timer)
  }, [cycle.status, cycle.startedAt, cycle.completedAt])

  const handleStop = () => {
    if (window.confirm(`Stop cycle ${cycle.id}?`)) {
      setStopping(true)
      onStop(cycle.id)
    }
  }

  const borderColor = STATUS_BORDER[cycle.status] ?? 'border-l-gray-300'
  const badge = STATUS_BADGE[cycle.status] ?? STATUS_BADGE.stopped

  return (
    <div
      data-testid="cycle-card"
      className={`bg-white rounded-lg border border-gray-200 border-l-4 ${borderColor} p-4 space-y-3`}
    >
      {/* Top row: ID, team badge, status, elapsed time */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-gray-900">{cycle.id}</span>
          {cycle.team && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium" data-testid="team-badge">
              {cycle.team}
            </span>
          )}
          <span className={`text-xs px-2 py-0.5 rounded-full ${badge.bg} ${badge.text} font-medium`} data-testid="status-badge">
            {cycle.status}
          </span>
        </div>
        <span className="text-sm text-gray-500 font-mono" data-testid="elapsed-time">
          {elapsed}
        </span>
      </div>

      {/* Task description */}
      {cycle.task && (
        <p className="text-sm text-gray-600 line-clamp-2">{cycle.task}</p>
      )}

      {/* Phase + Progress */}
      {(cycle.phase || cycle.progress != null) && (
        <div className="space-y-1">
          {cycle.phase && (
            <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">
              {cycle.phase}
            </span>
          )}
          {cycle.progress != null && (
            <div className="w-full bg-gray-200 rounded-full h-2" data-testid="progress-bar">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, cycle.progress))}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Bottom row: port links, stop button, view logs */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2 flex-wrap">
          {cycle.ports && Object.entries(cycle.ports).map(([name, port]) => (
            <a
              key={name}
              href={`http://localhost:${port}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-2 py-1 rounded bg-gray-100 text-blue-600 hover:bg-blue-50 hover:text-blue-800 font-mono"
              data-testid="port-link"
            >
              {name} :{port}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="text-xs px-2 py-1 text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
            data-testid="toggle-logs"
          >
            {showLogs ? 'Hide Logs' : 'View Logs'}
          </button>
          {cycle.status === 'running' && (
            <button
              onClick={handleStop}
              disabled={stopping}
              className="text-xs px-2 py-1 text-red-600 border border-red-300 rounded hover:bg-red-50 disabled:opacity-50"
              data-testid="stop-button"
            >
              {stopping ? 'Stopping...' : 'Stop'}
            </button>
          )}
        </div>
      </div>

      {/* Error display */}
      {cycle.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-xs">
          {cycle.error}
        </div>
      )}

      {/* Log stream */}
      <CycleLogStream cycleId={cycle.id} expanded={showLogs} />
    </div>
  )
}
