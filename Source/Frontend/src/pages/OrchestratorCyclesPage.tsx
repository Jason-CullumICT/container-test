// Verifies: FR-070
// Verifies: FR-091
// Orchestrator page — displays runs directly (cycles tab removed, runs-only view)

import React from 'react'
import { Header } from '../components/layout/Header'
import { RunsTab } from '../components/orchestrator/RunsTab'

// Verifies: FR-070
// Verifies: FR-091
export function OrchestratorCyclesPage() {
  return (
    <div>
      <Header
        title="Orchestrator"
        subtitle="Real-time orchestrator run dashboard"
      />

      <div className="p-6">
        {/* Verifies: FR-091 */}
        <RunsTab />
      </div>
    </div>
  )
}
