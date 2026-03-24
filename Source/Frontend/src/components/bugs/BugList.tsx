// Verifies: FR-026
import React from 'react'
import type { BugReport } from '../../../../Shared/types'

interface BugListProps {
  items: BugReport[]
  onSelect: (bug: BugReport) => void
}

const SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
}

const STATUS_COLORS: Record<string, string> = {
  reported: 'bg-gray-100 text-gray-700',
  triaged: 'bg-blue-100 text-blue-700',
  in_development: 'bg-yellow-100 text-yellow-700',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-500',
}

export function BugList({ items, onSelect }: BugListProps) {
  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p className="text-lg">No bug reports found</p>
        <p className="text-sm mt-1">All clear!</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {items.map((bug) => (
        <button
          key={bug.id}
          onClick={() => onSelect(bug)}
          className="w-full text-left bg-white rounded-lg border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <span className="text-xs font-mono text-gray-400">{bug.id}</span>
              <h4 className="font-medium text-gray-900 truncate mt-0.5">{bug.title}</h4>
              <p className="text-sm text-gray-500 mt-0.5 truncate">{bug.description}</p>
            </div>
            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  SEVERITY_COLORS[bug.severity] ?? 'bg-gray-100 text-gray-600'
                }`}
              >
                {bug.severity}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  STATUS_COLORS[bug.status] ?? 'bg-gray-100 text-gray-600'
                }`}
              >
                {bug.status.replace('_', ' ')}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
            {bug.source_system && <span>{bug.source_system}</span>}
            <span>{new Date(bug.created_at).toLocaleDateString()}</span>
          </div>
        </button>
      ))}
    </div>
  )
}
