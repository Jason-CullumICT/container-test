// Verifies: FR-025
import React from 'react'
import type { Vote } from '../../../../Shared/types'

interface VoteResultsProps {
  votes: Vote[]
}

export function VoteResults({ votes }: VoteResultsProps) {
  if (votes.length === 0) {
    return (
      <div className="text-sm text-gray-400 italic">No votes yet</div>
    )
  }

  const approveCount = votes.filter((v) => v.decision === 'approve').length
  const denyCount = votes.filter((v) => v.decision === 'deny').length

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-sm">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
          <span className="font-medium text-green-700">{approveCount} Approve</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
          <span className="font-medium text-red-700">{denyCount} Deny</span>
        </span>
      </div>
      <div className="space-y-2">
        {votes.map((vote) => (
          <div
            key={vote.id}
            className={`border rounded-lg p-3 ${
              vote.decision === 'approve'
                ? 'border-green-200 bg-green-50'
                : 'border-red-200 bg-red-50'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-800">{vote.agent_name}</span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  vote.decision === 'approve'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                }`}
              >
                {vote.decision}
              </span>
            </div>
            <p className="text-xs text-gray-600">{vote.comment}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
