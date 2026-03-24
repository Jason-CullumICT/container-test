// Verifies: FR-028
import React, { useCallback } from 'react'
import { Header } from '../components/layout/Header'
import { ApprovalQueue } from '../components/approvals/ApprovalQueue'
import { useApi } from '../hooks/useApi'
import { featureRequests } from '../api/client'

function getMajorityApprove(fr: { votes: Array<{ decision: string }> }): boolean {
  const approveCount = fr.votes.filter((v) => v.decision === 'approve').length
  const denyCount = fr.votes.filter((v) => v.decision === 'deny').length
  return approveCount > denyCount
}

export function ApprovalsPage() {
  const fetchFn = useCallback(
    () => featureRequests.list({ status: 'voting' }),
    []
  )

  const { data, loading, error, refetch } = useApi(fetchFn)

  const votingFRs = data?.data ?? []
  const majorityApproveFRs = votingFRs.filter((fr) => getMajorityApprove(fr))
  const majorityDenyFRs = votingFRs.filter((fr) => !getMajorityApprove(fr))

  return (
    <div>
      <Header
        title="Approvals"
        subtitle="Review and approve or deny feature requests awaiting human decision"
        actions={
          <button
            onClick={refetch}
            className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            ↻ Refresh
          </button>
        }
      />

      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            Failed to load approvals: {error}
          </div>
        ) : (
          <>
            {majorityApproveFRs.length > 0 && (
              <p className="text-sm text-gray-500 mb-4">
                {majorityApproveFRs.length} feature request{majorityApproveFRs.length !== 1 ? 's' : ''} recommended for approval
              </p>
            )}
            <ApprovalQueue items={majorityApproveFRs} onUpdate={refetch} variant="approve" />

            {majorityDenyFRs.length > 0 && (
              <div className="mt-8">
                <h2 className="text-sm font-semibold text-red-700 uppercase tracking-wide mb-3">
                  Recommended for Denial
                </h2>
                <p className="text-sm text-gray-500 mb-4">
                  {majorityDenyFRs.length} feature request{majorityDenyFRs.length !== 1 ? 's' : ''} with majority-deny votes — Deny button only
                </p>
                <ApprovalQueue items={majorityDenyFRs} onUpdate={refetch} variant="deny" />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
