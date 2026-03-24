// Verifies: FR-027
import React, { useState, useCallback } from 'react'
import { Header } from '../components/layout/Header'
import { CycleView } from '../components/cycles/CycleView'
import { useApi } from '../hooks/useApi'
import { cycles } from '../api/client'

export function DevelopmentCyclePage() {
  const [startingCycle, setStartingCycle] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  const fetchFn = useCallback(() => cycles.list(), [])
  const { data, loading, error, refetch } = useApi(fetchFn)

  const allCycles = data?.data ?? []
  const activeCycle = allCycles.find(
    (c) => c.status !== 'complete'
  ) ?? null

  const handleStartCycle = async () => {
    setStartingCycle(true)
    setStartError(null)
    try {
      await cycles.create()
      refetch()
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Failed to start cycle')
    } finally {
      setStartingCycle(false)
    }
  }

  return (
    <div>
      <Header
        title="Development Cycle"
        subtitle="Track the current development cycle through all phases"
        actions={
          !activeCycle && !loading ? (
            <button
              onClick={handleStartCycle}
              disabled={startingCycle}
              className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              {startingCycle ? 'Starting...' : '+ Start New Cycle'}
            </button>
          ) : undefined
        }
      />

      <div className="p-6 space-y-4">
        {startError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {startError}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            Failed to load cycles: {error}
          </div>
        ) : activeCycle ? (
          <CycleView cycle={activeCycle} onCycleUpdated={refetch} />
        ) : (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">🔄</p>
            <p className="text-lg font-medium text-gray-600">No active development cycle</p>
            <p className="text-sm text-gray-400 mt-1">
              Start a new cycle to pick the next highest-priority work item
            </p>
            <button
              onClick={handleStartCycle}
              disabled={startingCycle}
              className="mt-4 px-6 py-2.5 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              {startingCycle ? 'Starting...' : 'Start New Cycle'}
            </button>
          </div>
        )}

        {/* Past cycles */}
        {!loading && !error && allCycles.filter((c) => c.status === 'complete').length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h3 className="text-base font-semibold text-gray-900 mb-3">
              Completed Cycles ({allCycles.filter((c) => c.status === 'complete').length})
            </h3>
            <div className="space-y-2">
              {allCycles
                .filter((c) => c.status === 'complete')
                .map((cycle) => (
                  <div
                    key={cycle.id}
                    className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                  >
                    <div>
                      <span className="text-sm font-medium text-gray-800">{cycle.id}</span>
                      <span className="ml-2 text-xs text-gray-500">
                        {cycle.work_item_type === 'bug' ? '🐛' : '✨'} {cycle.work_item_id}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400">
                      {cycle.completed_at
                        ? new Date(cycle.completed_at).toLocaleDateString()
                        : ''}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
