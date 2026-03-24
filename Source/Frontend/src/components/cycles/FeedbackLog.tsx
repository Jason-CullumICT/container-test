// Verifies: FR-064
import React, { useState } from 'react'
import type { CycleFeedback, CycleFeedbackType } from '../../../../../Shared/types'

interface FeedbackLogProps {
  feedback: CycleFeedback[]
}

const FEEDBACK_TYPE_COLORS: Record<CycleFeedbackType, string> = {
  rejection: 'bg-red-100 text-red-700 border-red-200',
  finding: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  suggestion: 'bg-blue-100 text-blue-700 border-blue-200',
  approval: 'bg-green-100 text-green-700 border-green-200',
}

const AGENT_ROLE_COLORS: Record<string, string> = {
  'security-qa': 'bg-purple-100 text-purple-700',
  'qa-review-and-tests': 'bg-orange-100 text-orange-700',
  'chaos-tester': 'bg-red-100 text-red-700',
  'traceability-reporter': 'bg-blue-100 text-blue-700',
  'design-critic': 'bg-pink-100 text-pink-700',
  'integration-reviewer': 'bg-teal-100 text-teal-700',
}

function getAgentRoleColor(role: string): string {
  return AGENT_ROLE_COLORS[role] ?? 'bg-gray-100 text-gray-700'
}

export function FeedbackLog({ feedback }: FeedbackLogProps) {
  const [roleFilter, setRoleFilter] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<string>('')

  const uniqueRoles = [...new Set(feedback.map((f) => f.agent_role))].sort()
  const feedbackTypes: CycleFeedbackType[] = ['rejection', 'finding', 'suggestion', 'approval']

  const filtered = feedback.filter((f) => {
    if (roleFilter && f.agent_role !== roleFilter) return false
    if (typeFilter && f.feedback_type !== typeFilter) return false
    return true
  })

  if (feedback.length === 0) {
    return (
      <div data-testid="feedback-log" className="text-center py-6 text-gray-400 text-sm">
        No feedback recorded for this cycle
      </div>
    )
  }

  return (
    <div data-testid="feedback-log" className="space-y-4">
      {/* Filters */}
      <div className="flex gap-3">
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Roles</option>
          {uniqueRoles.map((role) => (
            <option key={role} value={role}>{role}</option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Types</option>
          {feedbackTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* Feedback entries */}
      {filtered.length === 0 ? (
        <div className="text-center py-4 text-gray-400 text-sm">
          No feedback matches the selected filters
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((entry) => (
            <div
              key={entry.id}
              className="bg-white border border-gray-200 rounded-lg p-4 space-y-2"
              data-testid="feedback-entry"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getAgentRoleColor(entry.agent_role)}`}>
                  {entry.agent_role}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${FEEDBACK_TYPE_COLORS[entry.feedback_type]}`}>
                  {entry.feedback_type}
                </span>
                {entry.team && (
                  <span className="text-xs text-gray-400">
                    {entry.team}
                  </span>
                )}
                {entry.ticket_id && (
                  <span className="text-xs font-mono text-gray-400">
                    {entry.ticket_id}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{entry.content}</p>
              <div className="text-xs text-gray-400">
                {new Date(entry.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
