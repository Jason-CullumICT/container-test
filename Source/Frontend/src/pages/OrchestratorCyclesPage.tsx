// Verifies: FR-070
// Verifies: FR-091
// Orchestrator cycles dashboard — polls listCycles() every 5s, separates active vs completed
// Tab bar: Cycles | Runs (FR-091)

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Header } from '../components/layout/Header'
import { CycleCard } from '../components/orchestrator/CycleCard'
import { CompletedCyclesSection } from '../components/orchestrator/CompletedCyclesSection'
import { RunsTab } from '../components/orchestrator/RunsTab'
import { orchestrator } from '../api/client'
import type { OrchestratorCycle } from '../components/orchestrator/types'

type TabId = 'cycles' | 'runs'

const POLL_INTERVAL_MS = 5000

// Verifies: FR-070
// Verifies: FR-091
export function OrchestratorCyclesPage() {
  const [activeTab, setActiveTab] = useState<TabId>('cycles')
  const [cycles, setCycles] = useState<OrchestratorCycle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchCycles = useCallback(async () => {
    try {
      const result = await orchestrator.listCycles()
      setCycles((result.data ?? []) as OrchestratorCycle[])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch cycles')
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial fetch + polling every 5s — only when cycles tab active — Verifies: FR-070
  useEffect(() => {
    if (activeTab !== 'cycles') {
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = null
      return
    }
    fetchCycles()
    intervalRef.current = setInterval(fetchCycles, POLL_INTERVAL_MS)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchCycles, activeTab])

  // Verifies: FR-072 — stop cycle handler (CycleCard handles confirmation)
  const handleStop = useCallback(async (id: string) => {
    try {
      await orchestrator.stopCycle(id)
      await fetchCycles()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop cycle')
    }
  }, [fetchCycles])

  // Verifies: FR-095 — switch to cycles tab from runs
  const handleSwitchToCycles = useCallback(() => {
    setActiveTab('cycles')
  }, [])

  const activeCycles = cycles.filter((c) => c.status === 'running')
  const completedCycles = cycles.filter((c) => c.status !== 'running')

  return (
    <div>
      <Header
        title="Orchestrator"
        subtitle="Real-time orchestrator cycle dashboard"
      />

      {/* Tab bar — Verifies: FR-091 */}
      <div className="border-b border-gray-200 px-6" data-testid="tab-bar">
        <div className="flex gap-4">
          {(['cycles', 'runs'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
              data-testid={`tab-${tab}`}
            >
              {tab === 'cycles' ? 'Cycles' : 'Runs'}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'cycles' ? (
        <div className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm" data-testid="error-banner">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16" data-testid="loading-spinner">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
            </div>
          ) : activeCycles.length === 0 && completedCycles.length === 0 ? (
            <div className="text-center py-16" data-testid="empty-state">
              <p className="text-4xl mb-3">⚡</p>
              <p className="text-lg font-medium text-gray-600">No orchestrator cycles</p>
              <p className="text-sm text-gray-400 mt-1">
                Submit work via the orchestrator to see cycles here
              </p>
            </div>
          ) : (
            <>
              {/* Active cycles — Verifies: FR-071 */}
              {activeCycles.length > 0 && (
                <div className="space-y-4" data-testid="active-cycles">
                  <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                    Active ({activeCycles.length})
                  </h3>
                  {activeCycles.map((cycle) => (
                    <CycleCard
                      key={cycle.id}
                      cycle={cycle}
                      onStop={handleStop}
                      onRefresh={fetchCycles}
                    />
                  ))}
                </div>
              )}

              {/* Completed cycles — Verifies: FR-074 */}
              <CompletedCyclesSection cycles={completedCycles} />
            </>
          )}
        </div>
      ) : (
        <div className="p-6">
          {/* Verifies: FR-091 */}
          <RunsTab onSwitchToCycles={handleSwitchToCycles} />
        </div>
      )}
    </div>
  )
}
