// Verifies: FR-024
// Verifies: FR-047
import React from 'react'
import type { DashboardSummary, PipelineStageName } from '../../../../Shared/types'

interface SummaryWidgetsProps {
  summary: DashboardSummary
}

const CYCLE_PHASE_LABELS: Record<string, string> = {
  spec_changes: 'Spec Changes',
  ticket_breakdown: 'Ticket Breakdown',
  implementation: 'Implementation',
  review: 'Review',
  smoke_test: 'Smoke Test',
  complete: 'Complete',
}

const CYCLE_PHASE_COLORS: Record<string, string> = {
  spec_changes: 'bg-blue-100 text-blue-800',
  ticket_breakdown: 'bg-blue-100 text-blue-800',
  implementation: 'bg-amber-100 text-amber-800',
  review: 'bg-amber-100 text-amber-800',
  smoke_test: 'bg-gray-100 text-gray-800',
  complete: 'bg-green-100 text-green-800',
}

// FR-047: Pipeline stage labels for dashboard widget
const PIPELINE_STAGE_LABELS: Record<number, string> = {
  1: 'Requirements',
  2: 'API Contract',
  3: 'Implementation',
  4: 'QA',
  5: 'Integration',
}

export function SummaryWidgets({ summary }: SummaryWidgetsProps) {
  const frCounts = summary.feature_requests
  const bugsByStatus = summary.bugs.by_status
  const bugsBySeverity = summary.bugs.by_severity
  const activeCycle = summary.active_cycle

  const totalFRs = Object.values(frCounts).reduce((a, b) => a + b, 0)
  const activeBugs =
    (bugsByStatus.reported ?? 0) +
    (bugsByStatus.triaged ?? 0) +
    (bugsByStatus.in_development ?? 0)
  const criticalBugs = bugsBySeverity.critical ?? 0

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-6">
      {/* FR Pipeline */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Feature Requests</h3>
        <div className="text-3xl font-bold text-gray-900 mb-3">{totalFRs}</div>
        <div className="space-y-1 text-xs">
          {Object.entries(frCounts).map(([status, count]) => (
            <div key={status} className="flex justify-between text-gray-600">
              <span className="capitalize">{status.replace('_', ' ')}</span>
              <span className="font-medium">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Active Bugs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Active Bugs</h3>
        <div className="text-3xl font-bold text-gray-900 mb-3">{activeBugs}</div>
        {criticalBugs > 0 && (
          <div className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-red-100 text-red-700 font-medium">
            {criticalBugs} critical
          </div>
        )}
        <div className="mt-2 space-y-1 text-xs">
          {Object.entries(bugsByStatus).map(([status, count]) => (
            <div key={status} className="flex justify-between text-gray-600">
              <span className="capitalize">{status.replace('_', ' ')}</span>
              <span className="font-medium">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Active Cycle */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Active Cycle</h3>
        {activeCycle ? (
          <>
            <div className="font-semibold text-gray-900 mb-2">{activeCycle.id}</div>
            <span
              className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                CYCLE_PHASE_COLORS[activeCycle.status] ?? 'bg-gray-100 text-gray-800'
              }`}
            >
              {CYCLE_PHASE_LABELS[activeCycle.status] ?? activeCycle.status}
            </span>
            <div className="mt-2 text-xs text-gray-500">
              {activeCycle.work_item_type === 'bug' ? '🐛' : '✨'} {activeCycle.work_item_id}
            </div>
            {/* FR-047: Pipeline stage info */}
            {activeCycle.pipeline_run_id && activeCycle.pipeline_stage != null && (
              <div className="mt-2 flex items-center gap-1.5">
                <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700">
                  Pipeline Stage {activeCycle.pipeline_stage}/5
                </span>
                <span className="text-[10px] text-gray-400">
                  {PIPELINE_STAGE_LABELS[activeCycle.pipeline_stage] ?? ''}
                </span>
                {activeCycle.pipeline_status && (
                  <span className={`text-[10px] font-medium ${
                    activeCycle.pipeline_status === 'running' ? 'text-blue-600' :
                    activeCycle.pipeline_status === 'completed' ? 'text-green-600' :
                    activeCycle.pipeline_status === 'failed' ? 'text-red-600' : 'text-gray-500'
                  }`}>
                    ({activeCycle.pipeline_status})
                  </span>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="text-gray-400 text-sm">No active cycle</div>
        )}
      </div>

      {/* Bug Severity Breakdown */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Bug Severity</h3>
        <div className="space-y-2">
          {[
            { key: 'critical', color: 'bg-red-500' },
            { key: 'high', color: 'bg-amber-500' },
            { key: 'medium', color: 'bg-gray-400' },
            { key: 'low', color: 'bg-green-500' },
          ].map(({ key, color }) => {
            const count = bugsBySeverity[key as keyof typeof bugsBySeverity] ?? 0
            const total = Object.values(bugsBySeverity).reduce((a, b) => a + b, 0)
            const pct = total > 0 ? Math.round((count / total) * 100) : 0
            return (
              <div key={key}>
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                  <span className="capitalize">{key}</span>
                  <span>{count}</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full">
                  <div
                    className={`h-1.5 rounded-full ${color}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
