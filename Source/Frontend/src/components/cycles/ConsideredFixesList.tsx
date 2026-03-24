// Verifies: FR-066
import React from 'react'
import type { ConsideredFix } from '../../../../../Shared/types'

interface ConsideredFixesListProps {
  fixes: ConsideredFix[] | null
}

export function ConsideredFixesList({ fixes }: ConsideredFixesListProps) {
  if (!fixes || fixes.length === 0) {
    return null
  }

  return (
    <div data-testid="considered-fixes" className="space-y-2">
      <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Considered Fixes</h5>
      <div className="space-y-2">
        {fixes.map((fix, index) => (
          <div
            key={index}
            className={`border rounded-lg p-3 text-sm ${
              fix.selected
                ? 'border-green-300 bg-green-50'
                : 'border-gray-200 bg-white'
            }`}
            data-testid="considered-fix"
          >
            <div className="flex items-start gap-2">
              {fix.selected && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-green-200 text-green-800 font-medium shrink-0">
                  Selected
                </span>
              )}
              <div className="flex-1">
                <p className="font-medium text-gray-800">{fix.description}</p>
                <p className="text-gray-500 mt-1">{fix.rationale}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
