// Verifies: FR-024
import React from 'react'
import { Header } from '../components/layout/Header'
import { SummaryWidgets } from '../components/dashboard/SummaryWidgets'
import { ActivityFeed } from '../components/dashboard/ActivityFeed'
import { useApi } from '../hooks/useApi'
import { dashboard } from '../api/client'

export function DashboardPage() {
  const {
    data: summary,
    loading: summaryLoading,
    error: summaryError,
    refetch: refetchSummary,
  } = useApi(() => dashboard.getSummary())

  const {
    data: activityRes,
    loading: activityLoading,
    error: activityError,
    refetch: refetchActivity,
  } = useApi(() => dashboard.getActivity(20))

  return (
    <div>
      <Header
        title="Dashboard"
        subtitle="Overview of your development workflow"
        actions={
          <button
            onClick={() => { refetchSummary(); refetchActivity() }}
            className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            ↻ Refresh
          </button>
        }
      />

      {summaryLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      ) : summaryError ? (
        <div className="m-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          Failed to load dashboard: {summaryError}
        </div>
      ) : summary ? (
        <SummaryWidgets summary={summary} />
      ) : null}

      <div className="px-6 pb-6">
        {activityLoading ? (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="animate-pulse space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-gray-100 rounded" />
              ))}
            </div>
          </div>
        ) : activityError ? (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            Failed to load activity: {activityError}
          </div>
        ) : (
          <ActivityFeed activities={activityRes?.data ?? []} />
        )}
      </div>
    </div>
  )
}
