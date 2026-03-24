// Verifies: FR-027
// Verifies: FR-066
import React from 'react'
import type { Ticket, TicketStatus } from '../../../../Shared/types'
import { cycles } from '../../api/client'
import { ConsideredFixesList } from './ConsideredFixesList'

interface TicketBoardProps {
  cycleId: string
  tickets: Ticket[]
  onTicketsUpdated: () => void
}

const COLUMNS: Array<{ key: TicketStatus; label: string; color: string }> = [
  { key: 'pending', label: 'Pending', color: 'bg-gray-100' },
  { key: 'in_progress', label: 'In Progress', color: 'bg-blue-50' },
  { key: 'code_review', label: 'Code Review', color: 'bg-yellow-50' },
  { key: 'testing', label: 'Testing', color: 'bg-orange-50' },
  { key: 'security_review', label: 'Security Review', color: 'bg-purple-50' },
  { key: 'done', label: 'Done', color: 'bg-green-50' },
]

const NEXT_STATUS: Record<TicketStatus, TicketStatus | null> = {
  pending: 'in_progress',
  in_progress: 'code_review',
  code_review: 'testing',
  testing: 'security_review',
  security_review: 'done',
  done: null,
}

interface TicketCardProps {
  ticket: Ticket
  cycleId: string
  onUpdate: () => void
}

function TicketCard({ ticket, cycleId, onUpdate }: TicketCardProps) {
  const [loading, setLoading] = React.useState(false)
  const nextStatus = NEXT_STATUS[ticket.status]

  const handleAdvance = async () => {
    if (!nextStatus) return
    setLoading(true)
    try {
      await cycles.updateTicket(cycleId, ticket.id, { status: nextStatus })
      onUpdate()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
      <div className="text-xs font-mono text-gray-400">{ticket.id}</div>
      <p className="text-sm font-medium text-gray-800">{ticket.title}</p>
      {ticket.description && (
        <p className="text-xs text-gray-500 line-clamp-2">{ticket.description}</p>
      )}
      {ticket.work_item_ref && (
        <div className="text-xs text-gray-500">
          <span className="text-gray-400">Ref: </span>
          <span className="font-mono">{ticket.work_item_ref}</span>
        </div>
      )}
      {ticket.assignee && (
        <div className="text-xs text-gray-500">
          <span className="text-gray-400">Assignee: </span>{ticket.assignee}
        </div>
      )}
      {ticket.issue_description && (
        <div className="text-xs text-gray-500 mt-1">
          <span className="text-gray-400 font-medium">Issue: </span>{ticket.issue_description}
        </div>
      )}
      <ConsideredFixesList fixes={ticket.considered_fixes} />
      {nextStatus && (
        <button
          onClick={handleAdvance}
          disabled={loading}
          className="w-full text-xs px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100 disabled:opacity-50 transition-colors"
        >
          {loading ? '...' : `→ ${nextStatus.replace('_', ' ')}`}
        </button>
      )}
    </div>
  )
}

export function TicketBoard({ cycleId, tickets, onTicketsUpdated }: TicketBoardProps) {
  if (tickets.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <p>No tickets yet. Add tickets to track implementation work.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {COLUMNS.map((col) => {
        const colTickets = tickets.filter((t) => t.status === col.key)
        return (
          <div key={col.key} className={`rounded-lg p-3 ${col.color}`}>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-gray-700">{col.label}</h4>
              <span className="text-xs bg-white border border-gray-200 rounded-full w-5 h-5 flex items-center justify-center text-gray-600 font-medium">
                {colTickets.length}
              </span>
            </div>
            <div className="space-y-2">
              {colTickets.map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  cycleId={cycleId}
                  onUpdate={onTicketsUpdated}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
