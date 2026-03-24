// Verifies: FR-028
import React, { useState } from 'react'
import type { FeatureRequest } from '../../../../Shared/types'
import { featureRequests } from '../../api/client'

interface ApprovalQueueProps {
  items: FeatureRequest[]
  onUpdate: () => void
  variant?: 'approve' | 'deny'
}

interface ApprovalCardProps {
  fr: FeatureRequest
  onUpdate: () => void
}

function ApprovalCard({ fr, onUpdate }: ApprovalCardProps) {
  const [loading, setLoading] = useState(false)
  const [showDenyForm, setShowDenyForm] = useState(false)
  const [denyComment, setDenyComment] = useState('')
  const [error, setError] = useState<string | null>(null)

  const approveCount = fr.votes.filter((v) => v.decision === 'approve').length
  const denyCount = fr.votes.filter((v) => v.decision === 'deny').length
  const majorityApprove = approveCount > denyCount

  const handleApprove = async () => {
    setLoading(true)
    setError(null)
    try {
      await featureRequests.approve(fr.id)
      onUpdate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve')
      setLoading(false)
    }
  }

  const handleDeny = async () => {
    if (!denyComment.trim()) { setError('Comment is required'); return }
    setLoading(true)
    setError(null)
    try {
      await featureRequests.deny(fr.id, { comment: denyComment.trim() })
      onUpdate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deny')
      setLoading(false)
    }
  }

  return (
    <div className={`bg-white rounded-lg border p-5 space-y-4 ${majorityApprove ? 'border-green-200' : 'border-red-200 bg-red-50'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-xs font-mono text-gray-400">{fr.id}</span>
          <h3 className="font-semibold text-gray-900 mt-0.5">{fr.title}</h3>
          <p className="text-sm text-gray-500 mt-1 line-clamp-2">{fr.description}</p>
        </div>
        <div className="flex-shrink-0 text-right">
          <div className="text-xs text-gray-500">Priority</div>
          <div className="text-sm font-medium text-gray-700 capitalize">{fr.priority}</div>
        </div>
      </div>

      {/* Vote Summary */}
      <div className="flex items-center gap-4 py-2 border-t border-gray-100">
        <span className="text-sm text-gray-600">AI Vote Result:</span>
        <span className={`text-sm font-medium ${majorityApprove ? 'text-green-600' : 'text-red-600'}`}>
          {approveCount} approve / {denyCount} deny — {majorityApprove ? '✓ Majority approve' : '✗ Majority deny'}
        </span>
      </div>

      {/* Vote details */}
      {fr.votes.length > 0 && (
        <details className="text-xs">
          <summary className="text-gray-500 cursor-pointer hover:text-gray-700">
            View {fr.votes.length} votes
          </summary>
          <div className="mt-2 space-y-1">
            {fr.votes.map((vote) => (
              <div key={vote.id} className="flex gap-2 text-gray-600">
                <span className={vote.decision === 'approve' ? 'text-green-600' : 'text-red-600'}>
                  [{vote.decision}]
                </span>
                <span className="font-medium">{vote.agent_name}:</span>
                <span>{vote.comment}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
          {error}
        </div>
      )}

      {!showDenyForm ? (
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleApprove}
            disabled={loading || !majorityApprove}
            title={!majorityApprove ? 'Cannot approve: majority of AI agents voted to deny' : undefined}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Processing...' : '✓ Approve'}
          </button>
          <button
            onClick={() => setShowDenyForm(true)}
            disabled={loading}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            ✗ Deny
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            value={denyComment}
            onChange={(e) => setDenyComment(e.target.value)}
            placeholder="Reason for denial (required)"
            rows={2}
            className="w-full px-3 py-2 border border-red-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          <div className="flex gap-2">
            <button
              onClick={handleDeny}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? 'Processing...' : 'Confirm Deny'}
            </button>
            <button
              onClick={() => { setShowDenyForm(false); setDenyComment(''); setError(null) }}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function ApprovalQueue({ items, onUpdate, variant = 'approve' }: ApprovalQueueProps) {
  if (items.length === 0) {
    if (variant === 'deny') {
      return null
    }
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-4xl mb-3">✅</p>
        <p className="text-lg font-medium text-gray-600">No pending approvals</p>
        <p className="text-sm mt-1">All feature requests have been reviewed</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {items.map((fr) => (
        <ApprovalCard key={fr.id} fr={fr} onUpdate={onUpdate} />
      ))}
    </div>
  )
}
