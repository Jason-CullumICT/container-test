// Verifies: FR-024
import React from 'react'
import type { ActivityItem } from '../../../../Shared/types'

interface ActivityFeedProps {
  activities: ActivityItem[]
}

const TYPE_ICONS: Record<string, string> = {
  feature_request: '✨',
  bug: '🐛',
  cycle: '🔄',
  ticket: '🎫',
  learning: '📚',
  feature: '📦',
}

const TYPE_COLORS: Record<string, string> = {
  feature_request: 'bg-blue-100 text-blue-700',
  bug: 'bg-red-100 text-red-700',
  cycle: 'bg-purple-100 text-purple-700',
  ticket: 'bg-yellow-100 text-yellow-700',
  learning: 'bg-green-100 text-green-700',
  feature: 'bg-indigo-100 text-indigo-700',
}

function formatTimeAgo(timestamp: string): string {
  const now = new Date()
  const then = new Date(timestamp)
  const diffMs = now.getTime() - then.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${diffDays}d ago`
}

export function ActivityFeed({ activities }: ActivityFeedProps) {
  if (activities.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Recent Activity</h3>
        <p className="text-gray-400 text-sm">No recent activity</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-base font-semibold text-gray-900 mb-4">Recent Activity</h3>
      <ul className="space-y-3">
        {activities.map((item, idx) => (
          <li key={`${item.entity_id}-${idx}`} className="flex items-start gap-3">
            <span
              className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm flex-shrink-0 ${
                TYPE_COLORS[item.type] ?? 'bg-gray-100 text-gray-600'
              }`}
            >
              {TYPE_ICONS[item.type] ?? '•'}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-800">{item.description}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-gray-400">{item.entity_id}</span>
                <span className="text-xs text-gray-400">·</span>
                <span className="text-xs text-gray-400">{formatTimeAgo(item.timestamp)}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
