// Verifies: FR-029
// Verifies: FR-067
import React, { useState, useEffect, useCallback } from 'react'
import type { Feature } from '../../../../Shared/types'
import { features } from '../../api/client'
import { TraceabilityReport } from './TraceabilityReport'

export function FeatureBrowser() {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [items, setItems] = useState<Feature[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query)
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const fetchFeatures = useCallback(async (q: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await features.list(q || undefined)
      setItems(res.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load features')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchFeatures(debouncedQuery)
  }, [debouncedQuery, fetchFeatures])

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search completed features by title or description..."
          className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        )}
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">📦</p>
          <p className="text-lg font-medium text-gray-600">
            {query ? 'No features match your search' : 'No completed features yet'}
          </p>
          {query && (
            <p className="text-sm mt-1">
              Try a different search term or{' '}
              <button
                onClick={() => setQuery('')}
                className="text-blue-500 hover:underline"
              >
                clear the search
              </button>
            </p>
          )}
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500">
            {items.length} feature{items.length !== 1 ? 's' : ''} found
            {query && ` for "${query}"`}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((feature) => (
              <div
                key={feature.id}
                className="bg-white rounded-lg border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-xs font-mono text-gray-400">{feature.id}</span>
                  <span className="text-xs text-gray-400">
                    {new Date(feature.created_at).toLocaleDateString()}
                  </span>
                </div>
                <h4 className="font-semibold text-gray-900 mb-1">{feature.title}</h4>
                <p className="text-sm text-gray-600 line-clamp-3">{feature.description}</p>
                <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
                  {feature.source_work_item_id && (
                    <span>From: {feature.source_work_item_id}</span>
                  )}
                  {feature.cycle_id && (
                    <span>Cycle: {feature.cycle_id}</span>
                  )}
                </div>
                {feature.traceability_report && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <TraceabilityReport report={feature.traceability_report} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
