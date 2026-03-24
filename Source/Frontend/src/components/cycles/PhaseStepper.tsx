// Verifies: FR-027
import React from 'react'
import type { CycleStatus } from '../../../../Shared/types'

interface PhaseStepperProps {
  currentStatus: CycleStatus
}

const PHASES: Array<{ key: CycleStatus; label: string }> = [
  { key: 'spec_changes', label: 'Spec Changes' },
  { key: 'ticket_breakdown', label: 'Ticket Breakdown' },
  { key: 'implementation', label: 'Implementation' },
  { key: 'review', label: 'Review' },
  { key: 'smoke_test', label: 'Smoke Test' },
  { key: 'complete', label: 'Complete' },
]

const PHASE_ORDER = PHASES.map((p) => p.key)

export function PhaseStepper({ currentStatus }: PhaseStepperProps) {
  const currentIndex = PHASE_ORDER.indexOf(currentStatus)

  return (
    <div className="flex items-center">
      {PHASES.map((phase, idx) => {
        const isDone = idx < currentIndex
        const isActive = idx === currentIndex
        const isUpcoming = idx > currentIndex

        return (
          <React.Fragment key={phase.key}>
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium border-2 transition-colors ${
                  isDone
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : isActive
                    ? 'bg-white border-blue-600 text-blue-600'
                    : 'bg-gray-100 border-gray-300 text-gray-400'
                }`}
              >
                {isDone ? '✓' : idx + 1}
              </div>
              <span
                className={`text-xs mt-1 text-center max-w-[70px] ${
                  isActive ? 'text-blue-600 font-medium' : isUpcoming ? 'text-gray-400' : 'text-gray-600'
                }`}
              >
                {phase.label}
              </span>
            </div>
            {idx < PHASES.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-1 transition-colors ${
                  idx < currentIndex ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}
