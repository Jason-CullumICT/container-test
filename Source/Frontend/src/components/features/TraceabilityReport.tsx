// Verifies: FR-067
import React, { useState } from 'react'

interface TraceabilityReportProps {
  report: string | null
}

interface TraceabilityEntry {
  fr_id?: string;
  id?: string;
  description?: string;
  status?: string;
  coverage?: string;
  files?: string[];
  [key: string]: unknown;
}

export function TraceabilityReport({ report }: TraceabilityReportProps) {
  const [expanded, setExpanded] = useState(false)

  if (!report) {
    return null
  }

  let parsed: TraceabilityEntry[] | Record<string, unknown> | null = null
  try {
    parsed = JSON.parse(report)
  } catch {
    return (
      <div data-testid="traceability-report" className="space-y-2">
        <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Traceability Report</h5>
        <pre className="text-xs text-gray-600 bg-gray-50 rounded p-3 whitespace-pre-wrap overflow-auto max-h-64">
          {report}
        </pre>
      </div>
    )
  }

  const entries = Array.isArray(parsed) ? parsed : null

  return (
    <div data-testid="traceability-report" className="space-y-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wide hover:text-gray-700"
      >
        <span className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
        Traceability Report
        {entries && <span className="normal-case font-normal">({entries.length} entries)</span>}
      </button>

      {expanded && (
        entries ? (
          <div className="overflow-auto">
            <table className="w-full text-sm border border-gray-200 rounded" data-testid="traceability-table">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 border-b">FR ID</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 border-b">Description</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 border-b">Status</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 border-b">Coverage</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-b-0">
                    <td className="px-3 py-2 font-mono text-xs text-gray-700">{entry.fr_id ?? entry.id ?? '-'}</td>
                    <td className="px-3 py-2 text-gray-600">{entry.description ?? '-'}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        entry.status === 'covered' || entry.coverage === '100%'
                          ? 'bg-green-100 text-green-700'
                          : entry.status === 'partial'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {entry.status ?? '-'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">{entry.coverage ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <pre className="text-xs text-gray-600 bg-gray-50 rounded p-3 whitespace-pre-wrap overflow-auto max-h-64">
            {JSON.stringify(parsed, null, 2)}
          </pre>
        )
      )}
    </div>
  )
}
