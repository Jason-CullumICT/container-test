// Verifies: FR-027
// Verifies: FR-046
// Verifies: FR-065
import React, { useState } from 'react'
import type { DevelopmentCycle } from '../../../../Shared/types'
import { PhaseStepper } from './PhaseStepper'
import { PipelineStepper } from './PipelineStepper'
import { TicketBoard } from './TicketBoard'
import { FeedbackLog } from './FeedbackLog'
import { cycles } from '../../api/client'

interface CycleViewProps {
  cycle: DevelopmentCycle
  onCycleUpdated: () => void
}

const NEXT_PHASE: Record<string, string | null> = {
  spec_changes: 'ticket_breakdown',
  ticket_breakdown: 'implementation',
  implementation: 'review',
  review: 'smoke_test',
  smoke_test: 'complete',
  complete: null,
}

const PHASE_LABELS: Record<string, string> = {
  spec_changes: 'Spec Changes',
  ticket_breakdown: 'Ticket Breakdown',
  implementation: 'Implementation',
  review: 'Review',
  smoke_test: 'Smoke Test',
  complete: 'Complete',
}

interface AddTicketFormProps {
  cycleId: string
  onAdded: () => void
  onCancel: () => void
}

function AddTicketForm({ cycleId, onAdded, onCancel }: AddTicketFormProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignee, setAssignee] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required'); return }
    setSubmitting(true)
    setError(null)
    try {
      await cycles.createTicket(cycleId, {
        title: title.trim(),
        description: description.trim(),
        assignee: assignee.trim() || undefined,
      })
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create ticket')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
      <h4 className="text-sm font-medium text-gray-700">Add New Ticket</h4>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Ticket title *"
        className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description"
        rows={2}
        className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
      />
      <input
        type="text"
        value={assignee}
        onChange={(e) => setAssignee(e.target.value)}
        placeholder="Assignee (optional)"
        className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {error && <div className="text-red-600 text-xs">{error}</div>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? 'Adding...' : 'Add Ticket'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

export function CycleView({ cycle, onCycleUpdated }: CycleViewProps) {
  const [advancing, setAdvancing] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAddTicket, setShowAddTicket] = useState(false)

  const isPipelineLinked = !!cycle.pipeline_run_id
  const nextPhase = NEXT_PHASE[cycle.status]
  const canComplete = cycle.status === 'smoke_test'
  const allTicketsDone = cycle.tickets.length > 0 && cycle.tickets.every((t) => t.status === 'done')

  const handleAdvancePhase = async () => {
    if (!nextPhase || canComplete) return
    setAdvancing(true)
    setError(null)
    try {
      await cycles.update(cycle.id, { status: nextPhase })
      onCycleUpdated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to advance phase')
    } finally {
      setAdvancing(false)
    }
  }

  const handleComplete = async () => {
    setCompleting(true)
    setError(null)
    try {
      await cycles.completeCycle(cycle.id)
      onCycleUpdated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete cycle')
    } finally {
      setCompleting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Cycle Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-gray-900">{cycle.id}</h3>
              {/* FR-065: team_name badge */}
              {cycle.team_name && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium" data-testid="team-badge">
                  {cycle.team_name}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {cycle.work_item_type === 'bug' ? '🐛' : '✨'} {cycle.work_item_id}
            </p>
          </div>
          {/* FR-046: Hide manual advance buttons for pipeline-linked cycles */}
          {!isPipelineLinked && (
            <div className="flex gap-2">
              {nextPhase && !canComplete && cycle.status !== 'complete' && (
                <button
                  onClick={handleAdvancePhase}
                  disabled={advancing}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {advancing ? 'Advancing...' : `→ ${PHASE_LABELS[nextPhase]}`}
                </button>
              )}
              {canComplete && (
                <button
                  onClick={handleComplete}
                  disabled={completing || !allTicketsDone}
                  title={!allTicketsDone ? 'All tickets must be done' : undefined}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {completing ? 'Completing...' : 'Complete Cycle'}
                </button>
              )}
            </div>
          )}
        </div>
        <PhaseStepper currentStatus={cycle.status} />
        {error && (
          <div className="mt-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
            {error}
          </div>
        )}
      </div>

      {/* FR-046: Pipeline stepper for orchestrated cycles */}
      {isPipelineLinked && cycle.pipeline_run && (
        <PipelineStepper pipelineRun={cycle.pipeline_run} />
      )}

      {/* Spec Changes */}
      {cycle.spec_changes && (
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Spec Changes</h4>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{cycle.spec_changes}</p>
        </div>
      )}

      {/* Ticket Board */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-base font-semibold text-gray-900">
            Tickets ({cycle.tickets.length})
          </h4>
          {cycle.status !== 'complete' && (
            <button
              onClick={() => setShowAddTicket(!showAddTicket)}
              className="px-3 py-1.5 text-sm text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50"
            >
              {showAddTicket ? 'Cancel' : '+ Add Ticket'}
            </button>
          )}
        </div>
        {showAddTicket && (
          <div className="mb-4">
            <AddTicketForm
              cycleId={cycle.id}
              onAdded={() => { setShowAddTicket(false); onCycleUpdated() }}
              onCancel={() => setShowAddTicket(false)}
            />
          </div>
        )}
        <TicketBoard
          cycleId={cycle.id}
          tickets={cycle.tickets}
          onTicketsUpdated={onCycleUpdated}
        />
      </div>

      {/* FR-065: Cycle Feedback Log */}
      {cycle.feedback && cycle.feedback.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h4 className="text-base font-semibold text-gray-900 mb-4">
            Team Feedback ({cycle.feedback.length})
          </h4>
          <FeedbackLog feedback={cycle.feedback} />
        </div>
      )}
    </div>
  )
}
