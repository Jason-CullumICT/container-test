// Verifies: FR-092
// Expandable detail section for a single orchestrator run

import React from 'react'
import type { OrchestratorRun } from './types'

interface RunDetailRowProps {
  run: OrchestratorRun
  expanded: boolean
  onNavigateToRun?: (runId: string) => void
}

// Verifies: FR-092
const PHASE_ICONS: Record<string, { icon: string; className: string }> = {
  passed: { icon: '\u2713', className: 'text-green-600' },
  failed: { icon: '\u2717', className: 'text-red-600' },
  skipped: { icon: '\u2014', className: 'text-gray-400' },
}

const PHASE_NAMES = ['leader', 'implementation', 'qa', 'smoketest', 'inspector']

const VERDICT_COLORS: Record<string, string> = {
  approved: 'bg-green-100 text-green-700',
  changes_requested: 'bg-yellow-100 text-yellow-700',
}

const MERGE_COLORS: Record<string, string> = {
  merged: 'bg-purple-100 text-purple-700',
  open: 'bg-blue-100 text-blue-700',
  closed: 'bg-gray-100 text-gray-600',
}

// Verifies: FR-092
export function RunDetailRow({ run, expanded, onNavigateToRun }: RunDetailRowProps) {
  if (!expanded) return null

  return (
    <div data-testid="run-detail-row" className="px-6 py-4 bg-gray-50 border-b border-gray-200">
      <div className="space-y-4">
          {/* Full task description — Verifies: FR-092 */}
          {run.task && (
            <div data-testid="run-detail-task">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Task</h4>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{run.task}</p>
            </div>
          )}

          {/* Phase results grid — Verifies: FR-092 */}
          {run.phases && run.phases.length > 0 && (
            <div data-testid="run-detail-phases">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Phase Results</h4>
              <div className="grid grid-cols-5 gap-2">
                {PHASE_NAMES.map((phaseName) => {
                  const phase = run.phases?.find((p) => p.phase === phaseName)
                  const statusKey = phase?.status ?? 'skipped'
                  const display = PHASE_ICONS[statusKey] ?? PHASE_ICONS.skipped
                  return (
                    <div
                      key={phaseName}
                      className="flex flex-col items-center p-2 bg-white rounded border border-gray-200"
                      data-testid={`phase-${phaseName}`}
                    >
                      <span className={`text-lg font-bold ${display.className}`}>{display.icon}</span>
                      <span className="text-xs text-gray-600 capitalize mt-1">{phaseName}</span>
                      {phase?.message && (
                        <span className="text-xs text-gray-400 mt-0.5 truncate max-w-full" title={phase.message}>
                          {phase.message}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* E2E test results — Verifies: FR-092 */}
          {run.testResults && (
            <div data-testid="run-detail-tests">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">E2E Test Results</h4>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-700">Total: <strong>{run.testResults.total}</strong></span>
                <span className="text-green-700">Passed: <strong>{run.testResults.passed}</strong></span>
                {run.testResults.failed > 0 && (
                  <span className="text-red-700">Failed: <strong>{run.testResults.failed}</strong></span>
                )}
              </div>
            </div>
          )}

          {/* PR info — Verifies: FR-092 */}
          {run.pr && (
            <div data-testid="run-detail-pr">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Pull Request</h4>
              <div className="flex items-center gap-3 text-sm">
                <a
                  href={run.pr.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 font-medium"
                  data-testid="pr-link"
                >
                  #{run.pr.number}
                </a>
                {run.pr.aiReviewVerdict && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${VERDICT_COLORS[run.pr.aiReviewVerdict] ?? 'bg-gray-100 text-gray-600'}`}
                    data-testid="pr-verdict"
                  >
                    {run.pr.aiReviewVerdict}
                  </span>
                )}
                {run.pr.mergeStatus && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${MERGE_COLORS[run.pr.mergeStatus] ?? 'bg-gray-100 text-gray-600'}`}
                    data-testid="pr-merge-status"
                  >
                    {run.pr.mergeStatus}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* RetryOf link — Verifies: FR-092 */}
          {run.retryOf && (
            <div data-testid="run-detail-retry-of">
              <span className="text-xs text-gray-500">Retry of: </span>
              <button
                onClick={() => onNavigateToRun?.(run.retryOf!)}
                className="text-xs text-blue-600 hover:text-blue-800 font-mono underline"
                data-testid="retry-of-link"
              >
                {run.retryOf.slice(-8)}
              </button>
            </div>
          )}

          {/* Error message */}
          {run.error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-xs" data-testid="run-detail-error">
              {run.error}
            </div>
          )}
        </div>
    </div>
  )
}
