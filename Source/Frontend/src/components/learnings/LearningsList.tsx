// Verifies: FR-030
import React from 'react'
import type { Learning, LearningCategory } from '../../../../Shared/types'

interface LearningsListProps {
  items: Learning[]
}

const CATEGORY_COLORS: Record<LearningCategory, string> = {
  process: 'bg-blue-100 text-blue-700',
  technical: 'bg-purple-100 text-purple-700',
  domain: 'bg-green-100 text-green-700',
}

const CATEGORY_ICONS: Record<LearningCategory, string> = {
  process: '⚙️',
  technical: '💻',
  domain: '🌐',
}

export function LearningsList({ items }: LearningsListProps) {
  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p className="text-4xl mb-3">📚</p>
        <p className="text-lg font-medium text-gray-600">No learnings found</p>
        <p className="text-sm mt-1">Learnings are created when development cycles complete</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((learning) => (
        <div
          key={learning.id}
          className="bg-white rounded-lg border border-gray-200 p-4"
        >
          <div className="flex items-start gap-3">
            <span
              className={`flex-shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                CATEGORY_COLORS[learning.category] ?? 'bg-gray-100 text-gray-700'
              }`}
            >
              {CATEGORY_ICONS[learning.category]} {learning.category}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-800">{learning.content}</p>
              <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                <span>Cycle: {learning.cycle_id}</span>
                <span>·</span>
                <span>{new Date(learning.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
