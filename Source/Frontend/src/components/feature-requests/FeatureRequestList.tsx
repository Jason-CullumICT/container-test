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
  in_development: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-purple-100 text-purple-700',
}

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-blue-100 text-blue-600',
  high: 'bg-orange-100 text-orange-600',
  critical: 'bg-red-100 text-red-600',
}

export function FeatureRequestList({ items, onSelect }: FeatureRequestListProps) {
  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p className="text-lg">No feature requests found</p>
        <p className="text-sm mt-1">Create one to get started</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {items.map((fr) => (
        <button
          key={fr.id}
          onClick={() => onSelect(fr)}
          className="w-full text-left bg-white rounded-lg border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all"
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
              <h4 className="font-medium text-gray-900 truncate">{fr.title}</h4>
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
