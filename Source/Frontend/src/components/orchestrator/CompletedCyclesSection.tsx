// Verifies: FR-074
// Collapsible section showing completed/stopped/failed cycles

import React, { useState } from 'react'
import type { OrchestratorCycle } from './types'

interface CompletedCyclesSectionProps {
  cycles: OrchestratorCycle[]
}

const statusColors: Record<string, string> = {
  completed: 'bg-green-100 text-green-800',
  stopped: 'bg-gray-100 text-gray-800',
  failed: 'bg-red-100 text-red-800',
}

function formatDuration(startedAt?: string, completedAt?: string): string {
  if (!startedAt || !completedAt) return '-'
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime()
  if (ms < 0) return '-'
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

// Verifies: FR-074
export function CompletedCyclesSection({ cycles }: CompletedCyclesSectionProps) {
  const [expanded, setExpanded] = useState(false)

  if (cycles.length === 0) return null

  return (
    <div className="bg-white rounded-lg border border-gray-200" data-testid="completed-cycles-section">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
        data-testid="completed-cycles-toggle"
      >
        <h3 className="text-base font-semibold text-gray-900">
          Completed ({cycles.length})
        </h3>
        <span className={`text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>

      {expanded && (
        <div className="border-t border-gray-200 divide-y divide-gray-100" data-testid="completed-cycles-list">
          {cycles.map((cycle) => (
            <div
              key={cycle.id}
              className="flex items-center justify-between px-5 py-3"
              data-testid="completed-cycle-row"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-mono text-gray-700">{cycle.id.slice(0, 8)}</span>
                {cycle.team && (
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                    {cycle.team}
                  </span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[cycle.status] ?? 'bg-gray-100 text-gray-800'}`}>
                  {cycle.status}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>{formatDuration(cycle.startedAt, cycle.completedAt)}</span>
                {cycle.completedAt && (
                  <span>{new Date(cycle.completedAt).toLocaleString()}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
