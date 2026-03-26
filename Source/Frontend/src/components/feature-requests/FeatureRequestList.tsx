// Verifies: FR-025
import React from 'react'
import type { FeatureRequest } from '../../../../Shared/types'

interface FeatureRequestListProps {
  items: FeatureRequest[]
  onSelect: (fr: FeatureRequest) => void
}

const STATUS_COLORS: Record<string, string> = {
  potential: 'bg-gray-100 text-gray-700',
  voting: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  denied: 'bg-red-100 text-red-700',
  in_development: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
}

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-gray-100 text-gray-500',
  high: 'bg-amber-100 text-amber-600',
  critical: 'bg-red-100 text-red-600',
}

export function FeatureRequestList({ items, onSelect }: FeatureRequestListProps) {
  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <h3 className="mt-3 text-base font-medium text-gray-600">No feature requests found</h3>
        <p className="mt-1 text-sm text-gray-400">Create one to get started</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {items.map((fr) => (
        <button
          key={fr.id}
          onClick={() => onSelect(fr)}
          className="w-full text-left bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-all"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono text-gray-400">{fr.id}</span>
                {fr.duplicate_warning && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                    ⚠ Duplicate
                  </span>
                )}
              </div>
              <h4 className="text-base font-semibold text-gray-900 truncate">{fr.title}</h4>
              <p className="text-sm text-gray-500 mt-0.5 truncate">{fr.description}</p>
            </div>
            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  STATUS_COLORS[fr.status] ?? 'bg-gray-100 text-gray-600'
                }`}
              >
                {fr.status.replace('_', ' ')}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  PRIORITY_COLORS[fr.priority] ?? 'bg-gray-100 text-gray-600'
                }`}
              >
                {fr.priority}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
            <span>{fr.source.replace('_', ' ')}</span>
            {fr.votes.length > 0 && <span>· {fr.votes.length} votes</span>}
            <span>· {new Date(fr.created_at).toLocaleDateString()}</span>
          </div>
        </button>
      ))}
    </div>
  )
}
