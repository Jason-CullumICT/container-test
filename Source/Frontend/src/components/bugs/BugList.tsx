// Verifies: FR-026
import React from 'react'
import type { BugReport } from '../../../../Shared/types'

interface BugListProps {
  items: BugReport[]
  onSelect: (bug: BugReport) => void
  selectable?: boolean
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
}

const SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-green-100 text-green-700',
  medium: 'bg-gray-100 text-gray-500',
  high: 'bg-amber-100 text-amber-700',
  critical: 'bg-red-100 text-red-700',
}

const STATUS_COLORS: Record<string, string> = {
  reported: 'bg-gray-100 text-gray-700',
  triaged: 'bg-blue-100 text-blue-700',
  in_development: 'bg-amber-100 text-amber-700',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-500',
}

export function BugList({ items, onSelect, selectable, selectedIds, onToggleSelect }: BugListProps) {
  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01M12 3a9 9 0 100 18 9 9 0 000-18z" />
        </svg>
        <h3 className="mt-3 text-base font-medium text-gray-600">No bug reports found</h3>
        <p className="mt-1 text-sm text-gray-400">All clear!</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {items.map((bug) => (
        <div key={bug.id} className="flex items-start gap-2">
          {selectable && (
            <input
              type="checkbox"
              checked={selectedIds?.has(bug.id) || false}
              onChange={(e) => { e.stopPropagation(); onToggleSelect?.(bug.id) }}
              className="mt-5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer flex-shrink-0"
              aria-label={`Select ${bug.title}`}
            />
          )}
          <button
            onClick={() => onSelect(bug)}
            className={`flex-1 text-left bg-white rounded-lg shadow-sm border p-4 hover:shadow-md transition-all ${selectable && selectedIds?.has(bug.id) ? "border-blue-500 ring-1 ring-blue-500" : "border-gray-200"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <span className="text-xs font-mono text-gray-400">{bug.id}</span>
                <h4 className="text-base font-semibold text-gray-900 truncate mt-0.5">{bug.title}</h4>
                <p className="text-sm text-gray-500 mt-0.5 truncate">{bug.description}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    SEVERITY_COLORS[bug.severity] ?? "bg-gray-100 text-gray-600"
                  }`}
                >
                  {bug.severity}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    STATUS_COLORS[bug.status] ?? "bg-gray-100 text-gray-600"
                  }`}
                >
                  {bug.status.replace("_", " ")}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
              {bug.source_system && <span>{bug.source_system}</span>}
              <span>{new Date(bug.created_at).toLocaleDateString()}</span>
            </div>
          </button>
        </div>
      ))}
    </div>
  )
}
