// Verifies: FR-070
// Orchestrator cycles dashboard — polls listCycles() every 5s, separates active vs completed

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Header } from '../components/layout/Header'
import { CycleCard } from '../components/orchestrator/CycleCard'
import { CompletedCyclesSection } from '../components/orchestrator/CompletedCyclesSection'
import { orchestrator } from '../api/client'
import type { OrchestratorCycle } from '../components/orchestrator/types'

const POLL_INTERVAL_MS = 5000

// Verifies: FR-070
export function OrchestratorCyclesPage() {
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

  // Initial fetch + polling every 5s — Verifies: FR-070
  useEffect(() => {
    fetchCycles()
    intervalRef.current = setInterval(fetchCycles, POLL_INTERVAL_MS)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchCycles])

  // Verifies: FR-072 — stop cycle handler (CycleCard handles confirmation)
  const handleStop = useCallback(async (id: string) => {
    try {
      await orchestrator.stopCycle(id)
      await fetchCycles()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop cycle')
    }
  }, [fetchCycles])

  const activeCycles = cycles.filter((c) => c.status === 'running')
  const completedCycles = cycles.filter((c) => c.status !== 'running')

  return (
    <div>
      <Header
        title="Orchestrator"
        subtitle="Real-time orchestrator cycle dashboard"
      />

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
    </div>
  )
}
