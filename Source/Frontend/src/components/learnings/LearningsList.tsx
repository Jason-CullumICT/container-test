// Verifies: FR-030
import React from 'react'
import type { Learning, LearningCategory } from '../../../../Shared/types'

interface LearningsListProps {
  items: Learning[]
}

const CATEGORY_COLORS: Record<LearningCategory, string> = {
  process: 'bg-blue-100 text-blue-700',
  technical: 'bg-gray-100 text-gray-700',
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
      <div className="text-center py-12">
        <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        <h3 className="mt-3 text-base font-medium text-gray-600">No learnings found</h3>
        <p className="mt-1 text-sm text-gray-400">Learnings are created when development cycles complete</p>
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
