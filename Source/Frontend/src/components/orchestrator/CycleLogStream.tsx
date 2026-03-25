// Verifies: FR-073
// Real-time SSE log stream for orchestrator cycles
import React, { useState, useEffect, useRef } from 'react'
import type { CycleLogEntry } from './types'

interface CycleLogStreamProps {
  cycleId: string
  expanded: boolean
}

function formatTimestamp(isoString: string): string {
  try {
    const date = new Date(isoString)
    return date.toLocaleTimeString('en-US', { hour12: false })
  } catch {
    return isoString
  }
}

const LEVEL_COLORS: Record<string, string> = {
  info: 'text-green-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
}

export function CycleLogStream({ cycleId, expanded }: CycleLogStreamProps) {
  const [logs, setLogs] = useState<CycleLogEntry[]>([])
  const [connectionError, setConnectionError] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!expanded) return

    setLogs([])
    setConnectionError(false)

    const eventSource = new EventSource(
      `/api/orchestrator/api/cycles/${encodeURIComponent(cycleId)}/logs`
    )

    eventSource.onmessage = (event) => {
      try {
        const entry: CycleLogEntry = JSON.parse(event.data)
        setLogs((prev) => [...prev, entry])
      } catch {
        // Skip malformed log entries
      }
    }

    eventSource.onerror = () => {
      setConnectionError(true)
    }

    return () => {
      eventSource.close()
    }
  }, [cycleId, expanded])

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logs])

  if (!expanded) return null

  return (
    <div
      ref={containerRef}
      data-testid="cycle-log-stream"
      className="bg-gray-900 text-green-400 font-mono text-xs rounded-lg p-3 max-h-64 overflow-y-auto mt-3"
    >
      {connectionError && logs.length === 0 && (
        <div className="text-gray-500 italic">Logs unavailable — connection error</div>
      )}
      {!connectionError && logs.length === 0 && (
        <div className="text-gray-500 italic">Waiting for log events...</div>
      )}
      {logs.map((entry, index) => (
        <div key={index} className={`py-0.5 ${LEVEL_COLORS[entry.level ?? 'info'] ?? 'text-green-400'}`}>
          <span className="text-gray-500">[{formatTimestamp(entry.timestamp)}]</span>
          {entry.agent && (
            <span className="text-blue-400 ml-1">[{entry.agent}]</span>
          )}
          <span className="ml-1">{entry.message}</span>
        </div>
      ))}
      {connectionError && logs.length > 0 && (
        <div className="text-yellow-500 italic mt-1">Connection lost — stream ended</div>
      )}
    </div>
  )
}
